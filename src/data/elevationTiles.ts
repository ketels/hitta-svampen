/**
 * Elevation data from terrain tiles (Terrarium-encoded PNGs, AWS Open Data).
 *
 * A single tile holds 256×256 elevation values — at our latitudes roughly ten
 * metres of resolution. That is both faster and considerably finer grained
 * than querying a point API a thousand times, and tiles can be saved offline
 * so that terrain analysis works without coverage.
 *
 * Encoding: elevation = R·256 + G + B/256 − 32768 metres.
 */

import { loadTile, saveTile } from '../lib/db.ts'
import type { BBox } from '../lib/types.ts'

const SOURCE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const TILE_SIZE = 256

const MIN_ZOOM = 8
/** Zoom 14 gives a little over five metres per pixel at our latitudes. Finer
 *  than that there is rarely real data behind it, only upsampled values. */
const MAX_ZOOM = 14

/* ---------- Web Mercator ---------- */

export const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z

export function latToY(lat: number, z: number): number {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export const xToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180

export function yToLat(y: number, z: number): number {
  const n = Math.PI - 2 * Math.PI * (y / 2 ** z)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Metres per pixel at the given latitude and zoom, for 256-pixel-wide tiles.
 * At the equator one tile at zoom 0 is the whole earth: 40,075,017 m spread
 * over 256 pixels gives 156,543 m per pixel.
 */
export const metresPerPixel = (lat: number, z: number) =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z

/* ---------- Decoding ---------- */

let canvasCache: {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
} | null = null

function getCanvas() {
  if (canvasCache) return canvasCache
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) return (canvasCache = { canvas, ctx })
  }
  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE
  canvas.height = TILE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Kan inte skapa rityta för höjddata')
  return (canvasCache = { canvas, ctx })
}

async function decode(blob: Blob): Promise<Float32Array> {
  const image = await createImageBitmap(blob)
  const { ctx } = getCanvas()
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE)
  ctx.drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE)
  image.close?.()
  const d = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
  const z = new Float32Array(TILE_SIZE * TILE_SIZE)
  for (let i = 0, p = 0; i < z.length; i++, p += 4) {
    z[i] = d[p]! * 256 + d[p + 1]! + d[p + 2]! / 256 - 32768
  }
  return z
}

const inMemory = new Map<string, Float32Array>()
const inFlight = new Map<string, Promise<Float32Array>>()

async function fetchTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array> {
  const key = `terr/${z}/${x}/${y}`
  const cached = inMemory.get(key)
  if (cached) return cached
  const pending = inFlight.get(key)
  if (pending) return pending

  const work = (async () => {
    const saved = await loadTile(key)
    if (saved) {
      const h = await decode(saved)
      inMemory.set(key, h)
      return h
    }
    const res = await fetch(`${SOURCE}/${z}/${x}/${y}.png`, { signal })
    if (!res.ok) throw new Error(`Höjdkakel ${z}/${x}/${y} svarade ${res.status}`)
    const blob = await res.blob()
    await saveTile(key, blob)
    const h = await decode(blob)
    inMemory.set(key, h)
    return h
  })()

  inFlight.set(key, work)
  try {
    return await work
  } finally {
    inFlight.delete(key)
  }
}

/* ---------- Mosaic ---------- */

/** A stitched elevation surface that can be sampled anywhere within its area. */
export class ElevationMosaic {
  private tiles = new Map<string, Float32Array>()
  readonly zoom: number
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number

  private constructor(zoom: number, x0: number, y0: number, x1: number, y1: number) {
    this.zoom = zoom
    this.x0 = x0
    this.y0 = y0
    this.x1 = x1
    this.y1 = y1
  }

  /**
   * Loads every tile covering the box. `zoom` is chosen so that the resolution
   * lands close to `targetResolutionM` metres per pixel.
   */
  static async load(
    box: BBox,
    targetResolutionM: number,
    signal?: AbortSignal,
    progress?: (done: number, total: number) => void,
  ): Promise<ElevationMosaic> {
    // The finest zoom that gives at least the requested resolution — but no
    // finer, since every step quadruples the number of tiles to fetch.
    const midLat = (box.south + box.north) / 2
    let zoom = MIN_ZOOM
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
      zoom = z
      if (metresPerPixel(midLat, z) <= targetResolutionM) break
    }

    const x0 = Math.floor(lonToX(box.west, zoom))
    const x1 = Math.floor(lonToX(box.east, zoom))
    const y0 = Math.floor(latToY(box.north, zoom))
    const y1 = Math.floor(latToY(box.south, zoom))

    const m = new ElevationMosaic(zoom, x0, y0, x1, y1)
    const jobs: { x: number; y: number }[] = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push({ x, y })

    let done = 0
    progress?.(0, jobs.length)
    const CONCURRENCY = 6
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
      const group = jobs.slice(i, i + CONCURRENCY)
      const res = await Promise.all(
        group.map(async (j) => {
          try {
            return { j, h: await fetchTile(zoom, j.x, j.y, signal) }
          } catch {
            return { j, h: null }
          }
        }),
      )
      for (const { j, h } of res) {
        if (h) m.tiles.set(`${j.x}/${j.y}`, h)
        done++
      }
      progress?.(done, jobs.length)
    }
    if (m.tiles.size === 0) throw new Error('Kunde inte hämta någon höjddata')
    return m
  }

  /** Elevation at a single pixel, or NaN outside the loaded area. */
  private pixel(px: number, py: number): number {
    const tx = Math.floor(px / TILE_SIZE)
    const ty = Math.floor(py / TILE_SIZE)
    const h = this.tiles.get(`${tx}/${ty}`)
    if (!h) return NaN
    const ix = px - tx * TILE_SIZE
    const iy = py - ty * TILE_SIZE
    return h[iy * TILE_SIZE + ix]!
  }

  /** Bilinearly interpolated elevation for a coordinate. */
  elevation(lat: number, lon: number): number {
    const fx = lonToX(lon, this.zoom) * TILE_SIZE
    const fy = latToY(lat, this.zoom) * TILE_SIZE
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const a = this.pixel(x0, y0)
    const b = this.pixel(x0 + 1, y0)
    const c = this.pixel(x0, y0 + 1)
    const d = this.pixel(x0 + 1, y0 + 1)
    // Fall back on the nearest valid value at missing tile edges.
    const valid = [a, b, c, d].filter((v) => !isNaN(v))
    if (valid.length === 0) return NaN
    if (valid.length < 4) return valid[0]!
    return (
      a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
    )
  }

  get resolutionM(): number {
    return metresPerPixel(yToLat(this.y0 + 0.5, this.zoom), this.zoom)
  }

  get tileCount(): number {
    return this.tiles.size
  }
}
