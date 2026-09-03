/**
 * Paths and small watercourses from OpenStreetMap, read out of vector tiles.
 *
 * The tiles come from OpenFreeMap — a static, CDN-served rendering of the
 * whole planet in the OpenMapTiles schema, free and without keys. Being static
 * files they behave like any other tile source: they answer in tens of
 * milliseconds, they can be cached offline, and there is no query engine that
 * can be overloaded. That is the whole point. The app used to ask Overpass for
 * the same lines, and Overpass throttles cloud addresses so hard that the
 * request failed more often than it succeeded.
 *
 * Two layers matter: `transportation` for paths and tracks, and `waterway`
 * for streams and ditches. Land cover itself comes from the national land
 * cover data — see `landCover.ts` — and is read from these tiles only as a
 * fallback outside Sweden, where the schema's coarse classes are better than
 * nothing.
 *
 * The decoder below is a minimal reading of the Mapbox Vector Tile
 * specification (protobuf), enough for lines and polygons with tags. Pulling
 * in a library for that would be more code than this file.
 */

import { cacheRead, cacheReadStale, cacheWrite, loadTile, saveTile } from '../lib/db.ts'
import { ringBBox } from '../lib/geo.ts'
import type { BBox, Host, LandType, LatLng } from '../lib/types.ts'
import { latToY, lonToX, xToLon, yToLat } from './elevationTiles.ts'

/** The TileJSON document. Its `tiles` URL carries the date of the planet
 *  build and changes a few times a week, so it has to be looked up. */
const TILEJSON = 'https://tiles.openfreemap.org/planet'

/** Paths and streams are complete in the schema from zoom 14. */
export const VECTOR_ZOOM = 14

const TILE_TIMEOUT_MS = 12_000

/* ---------- Protobuf reading ---------- */

class Reader {
  pos = 0
  readonly buf: Uint8Array
  readonly end: number
  constructor(buf: Uint8Array, end = buf.length) {
    this.buf = buf
    this.end = end
  }

  varint(): number {
    let result = 0
    let shift = 0
    for (;;) {
      const b = this.buf[this.pos++]!
      if (shift < 28) {
        result |= (b & 0x7f) << shift
      } else {
        // Beyond 32 bits `|=` would wrap; multiply instead. Feature ids are
        // the only values that get here, and nothing reads them.
        result += (b & 0x7f) * 2 ** shift
      }
      if (b < 0x80) return result >>> 0 === result ? result : result
      shift += 7
    }
  }

  /** Skips a field of the given wire type. */
  skip(wireType: number) {
    if (wireType === 0) this.varint()
    else if (wireType === 1) this.pos += 8
    else if (wireType === 2) this.pos += this.varint()
    else if (wireType === 5) this.pos += 4
    else throw new Error(`Okänd wire type ${wireType}`)
  }

  bytes(): Uint8Array {
    const n = this.varint()
    const out = this.buf.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }

  string(): string {
    return new TextDecoder().decode(this.bytes())
  }

  /** Reads a length-delimited field as a nested reader. */
  sub(): Reader {
    const n = this.varint()
    const r = new Reader(this.buf, this.pos + n)
    r.pos = this.pos
    this.pos += n
    return r
  }

  packedUint32(): number[] {
    const r = this.sub()
    const out: number[] = []
    while (r.pos < r.end) out.push(r.varint())
    return out
  }
}

type TagValue = string | number | boolean | null

function readValue(r: Reader): TagValue {
  let v: TagValue = null
  while (r.pos < r.end) {
    const key = r.varint()
    const field = key >>> 3
    const wt = key & 7
    if (field === 1) v = r.string()
    else if (field === 2) { v = new DataView(r.buf.buffer, r.buf.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4 }
    else if (field === 3) { v = new DataView(r.buf.buffer, r.buf.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8 }
    else if (field === 4 || field === 5) v = r.varint()
    else if (field === 6) { const z = r.varint(); v = (z >>> 1) ^ -(z & 1) }
    else if (field === 7) v = r.varint() !== 0
    else r.skip(wt)
  }
  return v
}

export type VectorFeature = {
  /** 1 point, 2 line, 3 polygon. */
  type: number
  tags: Record<string, TagValue>
  /** Rings or lines, in tile units (0..extent). */
  geometry: { x: number; y: number }[][]
}

export type VectorLayer = {
  name: string
  extent: number
  features: VectorFeature[]
}

function readGeometry(cmds: number[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = []
  let x = 0
  let y = 0
  let line: { x: number; y: number }[] = []
  for (let i = 0; i < cmds.length; ) {
    const c = cmds[i++]!
    const id = c & 7
    const count = c >>> 3
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k++) {
        const dx = cmds[i++]!
        const dy = cmds[i++]!
        x += (dx >>> 1) ^ -(dx & 1)
        y += (dy >>> 1) ^ -(dy & 1)
        if (id === 1) {
          if (line.length) out.push(line)
          line = []
        }
        line.push({ x, y })
      }
    } else if (id === 7) {
      if (line.length) line.push(line[0]!)
    } else {
      throw new Error(`Okänt geometrikommando ${id}`)
    }
  }
  if (line.length) out.push(line)
  return out
}

function readFeature(r: Reader, keys: string[], values: TagValue[]): VectorFeature {
  let type = 0
  let tagIdx: number[] = []
  let geom: number[] = []
  while (r.pos < r.end) {
    const key = r.varint()
    const field = key >>> 3
    const wt = key & 7
    if (field === 2) tagIdx = r.packedUint32()
    else if (field === 3) type = r.varint()
    else if (field === 4) geom = r.packedUint32()
    else r.skip(wt)
  }
  const tags: Record<string, TagValue> = {}
  for (let i = 0; i + 1 < tagIdx.length; i += 2) {
    const k = keys[tagIdx[i]!]
    if (k !== undefined) tags[k] = values[tagIdx[i + 1]!] ?? null
  }
  return { type, tags, geometry: readGeometry(geom) }
}

function readLayer(r: Reader): VectorLayer {
  let name = ''
  let extent = 4096
  const keys: string[] = []
  const values: TagValue[] = []
  const rawFeatures: Reader[] = []
  while (r.pos < r.end) {
    const key = r.varint()
    const field = key >>> 3
    const wt = key & 7
    if (field === 1) name = r.string()
    else if (field === 2) rawFeatures.push(r.sub())
    else if (field === 3) keys.push(r.string())
    else if (field === 4) values.push(readValue(r.sub()))
    else if (field === 5) extent = r.varint()
    else r.skip(wt)
  }
  // Features refer to keys and values by index, so they are read last.
  return { name, extent, features: rawFeatures.map((f) => readFeature(f, keys, values)) }
}

/** Decodes a tile. Only the named layers are kept; the rest is skipped. */
export function decodeTile(data: Uint8Array, wanted: Set<string>): VectorLayer[] {
  const r = new Reader(data)
  const layers: VectorLayer[] = []
  while (r.pos < r.end) {
    const key = r.varint()
    const field = key >>> 3
    const wt = key & 7
    if (field === 3) {
      const sub = r.sub()
      // Peek at the name before decoding the whole layer.
      const layer = readLayer(sub)
      if (wanted.has(layer.name)) layers.push(layer)
    } else r.skip(wt)
  }
  return layers
}

/* ---------- Fetching ---------- */

async function ungzipIfNeeded(buf: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(buf)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const ds = new DecompressionStream('gzip')
  const stream = new Blob([bytes]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

let templatePromise: Promise<string> | null = null

/** The current tile URL template, looked up from TileJSON and kept for a day. */
async function tileTemplate(signal?: AbortSignal): Promise<string> {
  if (templatePromise) return templatePromise
  templatePromise = (async () => {
    const key = 'ofm:tilejson'
    const cached = await cacheRead<string>(key)
    if (cached) return cached
    try {
      const res = await fetch(TILEJSON, { signal })
      if (!res.ok) throw new Error(`TileJSON ${res.status}`)
      const j = (await res.json()) as { tiles?: string[] }
      const t = j.tiles?.[0]
      if (!t) throw new Error('TileJSON utan tiles')
      await cacheWrite(key, t, 24 * 3600e3)
      return t
    } catch (e) {
      const stale = await cacheReadStale<string>(key)
      if (stale) return stale
      throw e
    }
  })()
  try {
    return await templatePromise
  } catch (e) {
    templatePromise = null
    throw e
  }
}

const inMemory = new Map<string, Uint8Array>()
const inFlight = new Map<string, Promise<Uint8Array>>()

/**
 * Raw bytes of one tile, from memory, IndexedDB or the network in that order.
 * The tiles are immutable once built (the URL carries the build date), so
 * what is saved never needs to expire; a fresh planet build merely means a
 * new key.
 */
async function fetchTileBytes(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array> {
  const key = `osmv/${z}/${x}/${y}`
  const cached = inMemory.get(key)
  if (cached) return cached
  const pending = inFlight.get(key)
  if (pending) return pending

  const work = (async () => {
    const saved = await loadTile(key)
    if (saved) {
      const b = await ungzipIfNeeded(await saved.arrayBuffer())
      inMemory.set(key, b)
      return b
    }
    const template = await tileTemplate(signal)
    const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    const clock = new AbortController()
    const timer = setTimeout(() => clock.abort(), TILE_TIMEOUT_MS)
    const relay = () => clock.abort()
    signal?.addEventListener('abort', relay)
    try {
      const res = await fetch(url, { signal: clock.signal })
      if (!res.ok) throw new Error(`Vektorkakel ${z}/${x}/${y} svarade ${res.status}`)
      const blob = await res.blob()
      await saveTile(key, blob)
      const b = await ungzipIfNeeded(await blob.arrayBuffer())
      inMemory.set(key, b)
      return b
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', relay)
    }
  })()

  inFlight.set(key, work)
  try {
    return await work
  } finally {
    inFlight.delete(key)
  }
}

/* ---------- What the model wants ---------- */

export type Area = {
  landType: LandType
  ring: LatLng[]
  box: BBox
  treeSpecies: Host[]
  /** Higher wins when areas overlap. */
  priority: number
}

/** OpenMapTiles classes that count as a path you can walk. */
const PATH_CLASSES = new Set(['path', 'track'])
/** Unpaved or footway-like subclasses under other classes. */
const PATH_SUBCLASSES = new Set(['path', 'track', 'footway', 'bridleway', 'cycleway', 'steps'])
const WATERWAY_CLASSES = new Set(['stream', 'river', 'ditch', 'drain', 'canal'])
const BUILT_CLASSES = new Set([
  'residential', 'commercial', 'industrial', 'retail', 'cemetery', 'quarry', 'landfill',
  'railway', 'garages', 'military',
])

/**
 * OpenMapTiles polygon classes → land type. This is the fallback where the
 * national raster has nothing, so it is deliberately coarse: the schema does
 * not carry leaf type, so a wood is just 'forest'.
 */
function classifyPolygon(
  layer: string,
  cls: string,
  subclass: string,
): { landType: LandType; priority: number } | null {
  if (layer === 'water') return { landType: 'water', priority: 90 }
  if (layer === 'landuse') return BUILT_CLASSES.has(cls) ? { landType: 'built', priority: 80 } : null
  if (layer !== 'landcover') return null
  switch (cls) {
    case 'wetland': return { landType: 'bog', priority: 75 }
    case 'farmland': return { landType: 'farmland', priority: 70 }
    case 'grass':
      return subclass === 'heath' || subclass === 'scrub'
        ? { landType: 'scrub', priority: 60 }
        : { landType: 'meadow', priority: 65 }
    case 'sand':
    case 'rock':
    case 'ice':
      return { landType: 'bare', priority: 60 }
    case 'wood': return { landType: 'forest', priority: 40 }
  }
  return null
}

/** Surveyor's formula in tile units. Exterior rings are positive by the spec. */
function signedArea(ring: { x: number; y: number }[]): number {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % n]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export type VectorFeatures = {
  paths: LatLng[][]
  waterways: LatLng[][]
  /** Land cover polygons, outer rings only. */
  areas: Area[]
  /** How many of the tiles covering the box actually arrived. */
  tilesLoaded: number
  tilesWanted: number
}

/** Tile coordinates covering a box at the given zoom. */
export function tilesCovering(box: BBox, zoom = VECTOR_ZOOM): { x: number; y: number }[] {
  const x0 = Math.floor(lonToX(box.west, zoom))
  const x1 = Math.floor(lonToX(box.east, zoom))
  const y0 = Math.floor(latToY(box.north, zoom))
  const y1 = Math.floor(latToY(box.south, zoom))
  const out: { x: number; y: number }[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y })
  return out
}

function toLatLng(z: number, x: number, y: number, extent: number) {
  return (p: { x: number; y: number }): LatLng => ({
    lat: yToLat(y + p.y / extent, z),
    lon: xToLon(x + p.x / extent, z),
  })
}

const WANTED_LAYERS = new Set(['transportation', 'waterway', 'landcover', 'landuse', 'water'])

/**
 * Paths, watercourses and land cover polygons within the box. Tiles that fail
 * are skipped rather than failing the whole call — a scan is better with most
 * of its paths than with none.
 */
export async function fetchVectorFeatures(
  box: BBox,
  signal?: AbortSignal,
  progress?: (done: number, total: number) => void,
): Promise<VectorFeatures> {
  const z = VECTOR_ZOOM
  const jobs = tilesCovering(box, z)
  const out: VectorFeatures = { paths: [], waterways: [], areas: [], tilesLoaded: 0, tilesWanted: jobs.length }

  let done = 0
  const CONCURRENCY = 6
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
    const group = jobs.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      group.map(async (j) => {
        try {
          return { j, layers: decodeTile(await fetchTileBytes(z, j.x, j.y, signal), WANTED_LAYERS) }
        } catch (e) {
          if (signal?.aborted) throw e
          return { j, layers: null }
        }
      }),
    )
    for (const { j, layers } of results) {
      done++
      if (!layers) continue
      out.tilesLoaded++
      for (const layer of layers) {
        const convert = toLatLng(z, j.x, j.y, layer.extent)
        for (const f of layer.features) {
          const cls = String(f.tags.class ?? '')
          const sub = String(f.tags.subclass ?? '')
          if (f.type === 2 && layer.name === 'transportation') {
            if (!(PATH_CLASSES.has(cls) || PATH_SUBCLASSES.has(sub))) continue
            for (const line of f.geometry) if (line.length > 1) out.paths.push(line.map(convert))
          } else if (f.type === 2 && layer.name === 'waterway') {
            if (!WATERWAY_CLASSES.has(cls)) continue
            for (const line of f.geometry) if (line.length > 1) out.waterways.push(line.map(convert))
          } else if (f.type === 3) {
            const k = classifyPolygon(layer.name, cls, sub)
            if (!k) continue
            for (const raw of f.geometry) {
              // Holes have negative area and are skipped; a lake in a forest
              // is drawn by the water polygon anyway.
              if (raw.length < 4 || signedArea(raw) <= 0) continue
              const ring = raw.map(convert)
              out.areas.push({ landType: k.landType, ring, box: ringBBox(ring), treeSpecies: [], priority: k.priority })
            }
          }
        }
      }
    }
    progress?.(done, jobs.length)
  }
  return out
}

/**
 * Fetches and stores every vector tile covering the box, for use offline.
 * Returns how many tiles were fetched and how many were already present.
 */
export async function prefetchVectorTiles(
  box: BBox,
  signal?: AbortSignal,
  progress?: (done: number, total: number) => void,
): Promise<{ fetched: number; skipped: number; failed: number }> {
  const jobs = tilesCovering(box, VECTOR_ZOOM)
  let fetched = 0
  let skipped = 0
  let failed = 0
  let done = 0
  const CONCURRENCY = 4
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (signal?.aborted) break
    await Promise.all(
      jobs.slice(i, i + CONCURRENCY).map(async (j) => {
        const key = `osmv/${VECTOR_ZOOM}/${j.x}/${j.y}`
        if (await loadTile(key)) {
          skipped++
        } else {
          try {
            await fetchTileBytes(VECTOR_ZOOM, j.x, j.y, signal)
            fetched++
          } catch {
            failed++
          }
        }
        done++
        progress?.(done, jobs.length)
      }),
    )
  }
  return { fetched, skipped, failed }
}
