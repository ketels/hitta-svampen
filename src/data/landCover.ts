/**
 * Land cover from the National Land Cover Data (Nationella marktäckedata, NMD).
 *
 * NMD is Naturvårdsverket's ten-metre raster of all of Sweden, and it answers
 * exactly the questions this app asks: pine forest or spruce forest, deciduous
 * or mixed, clear-cut, bog, arable, water. It is published under CC0 through a
 * WMS that serves a tile in a few hundred milliseconds from anywhere, and the
 * tiles are plain PNGs that can be saved for offline use like any other tile.
 *
 * Two editions are combined. The 2023 mapping is the most recent and tells
 * clear-cuts from forest as they were a couple of years ago, but at the time of
 * writing it only covers part of the country. The 2018 mapping covers all of
 * Sweden. Where the newer one has data it wins; elsewhere the older one fills
 * in. They are fetched as separate images — asking the server to compose them
 * fails intermittently, composing them here never does.
 *
 * The images are rendered with the service's own legend, one flat colour per
 * class and no antialiasing, so the class is read straight back from the pixel
 * colour. The colour tables below are the legend; a test checks them against
 * the live service.
 *
 * Paths and small streams are not in NMD. They come from OpenStreetMap vector
 * tiles — see `vectorTiles.ts` — which also supply a coarser land cover as a
 * fallback outside Sweden.
 */

import { loadTile, saveTile } from '../lib/db.ts'
import { tilePixels } from '../lib/tileImage.ts'
import type { BBox, Host, LandType, LatLng } from '../lib/types.ts'
import { latToY, lonToX } from './elevationTiles.ts'
import {
  fetchVectorFeatures, prefetchVectorTiles, tilesCovering, type Area,
} from './vectorTiles.ts'

export type { Area } from './vectorTiles.ts'

const WMS = 'https://geodata.naturvardsverket.se/inspire/lc-nmd/ows'

/**
 * Zoom 13 is a little under ten metres per pixel at Swedish latitudes — the
 * native resolution of the data. Finer tiles would only be upsampled.
 */
export const NMD_ZOOM = 13
const TILE_SIZE = 256
const HALF_WORLD = 20037508.342789244

/** The service answers in well under a second; if it has not in ten, move on. */
const TILE_TIMEOUT_MS = 10_000

/* ---------- Classes ---------- */

export type LandCoverClass = {
  code: number
  name: string
  landType: LandType
  treeSpecies: Host[]
  /** Forest or open land on wetland. The terrain model already sees the water;
   *  this is kept for the description. */
  wet: boolean
}

/**
 * The NMD classes and how the model reads them. Codes are shared between the
 * 2018 and 2023 editions where the classes match; the 2023 edition adds finer
 * wetland and open-land classes.
 *
 * Forest on wetland is still forest of that kind — spruce on a mire is spruce
 * — and the wetness is left to the topographic wetness index, which sees it
 * anyway.
 */
const CLASSES: LandCoverClass[] = [
  { code: 2, name: 'Öppen våtmark', landType: 'bog', treeSpecies: [], wet: true },
  { code: 3, name: 'Åkermark', landType: 'farmland', treeSpecies: [], wet: false },
  { code: 20, name: 'Öppen våtmark', landType: 'bog', treeSpecies: [], wet: true },
  { code: 23, name: 'Låg fjällskog på våtmark', landType: 'deciduous', treeSpecies: ['birch'], wet: true },
  { code: 41, name: 'Öppen mark utan vegetation', landType: 'bare', treeSpecies: [], wet: false },
  { code: 42, name: 'Öppen mark med vegetation', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 43, name: 'Låg fjällskog på fastmark', landType: 'deciduous', treeSpecies: ['birch'], wet: false },
  { code: 51, name: 'Byggnad', landType: 'built', treeSpecies: [], wet: false },
  { code: 52, name: 'Anlagd mark', landType: 'built', treeSpecies: [], wet: false },
  { code: 53, name: 'Väg eller järnväg', landType: 'built', treeSpecies: [], wet: false },
  { code: 54, name: 'Torvtäkt', landType: 'bog', treeSpecies: [], wet: true },
  { code: 61, name: 'Sjö eller vattendrag', landType: 'water', treeSpecies: [], wet: true },
  { code: 62, name: 'Hav', landType: 'water', treeSpecies: [], wet: true },

  { code: 111, name: 'Tallskog', landType: 'coniferous', treeSpecies: ['pine'], wet: false },
  { code: 112, name: 'Granskog', landType: 'coniferous', treeSpecies: ['spruce'], wet: false },
  { code: 113, name: 'Barrblandskog', landType: 'coniferous', treeSpecies: ['pine', 'spruce'], wet: false },
  { code: 114, name: 'Lövblandad barrskog', landType: 'mixed', treeSpecies: ['spruce', 'pine', 'birch'], wet: false },
  { code: 115, name: 'Triviallövskog', landType: 'deciduous', treeSpecies: ['birch', 'aspen'], wet: false },
  { code: 116, name: 'Ädellövskog', landType: 'deciduous', treeSpecies: ['oak', 'beech', 'hazel'], wet: false },
  { code: 117, name: 'Triviallövskog med ädellövinslag', landType: 'deciduous', treeSpecies: ['birch', 'oak', 'aspen'], wet: false },
  { code: 118, name: 'Hygge', landType: 'clearcut', treeSpecies: [], wet: false },

  { code: 121, name: 'Tallskog på våtmark', landType: 'coniferous', treeSpecies: ['pine'], wet: true },
  { code: 122, name: 'Granskog på våtmark', landType: 'coniferous', treeSpecies: ['spruce'], wet: true },
  { code: 123, name: 'Barrblandskog på våtmark', landType: 'coniferous', treeSpecies: ['pine', 'spruce'], wet: true },
  { code: 124, name: 'Lövblandad barrskog på våtmark', landType: 'mixed', treeSpecies: ['spruce', 'pine', 'birch'], wet: true },
  { code: 125, name: 'Triviallövskog på våtmark', landType: 'deciduous', treeSpecies: ['birch', 'aspen'], wet: true },
  { code: 126, name: 'Ädellövskog på våtmark', landType: 'deciduous', treeSpecies: ['oak', 'beech', 'hazel'], wet: true },
  { code: 127, name: 'Triviallövskog med ädellövinslag på våtmark', landType: 'deciduous', treeSpecies: ['birch', 'oak', 'aspen'], wet: true },
  { code: 128, name: 'Hygge på våtmark', landType: 'clearcut', treeSpecies: [], wet: true },

  // The 2023 edition's wetland subdivision. All of it is open mire of one kind
  // or another, and the funnel chanterelle only ever uses the edges.
  { code: 200, name: 'Öppen våtmark', landType: 'bog', treeSpecies: [], wet: true },
  { code: 211, name: 'Buskmyr', landType: 'bog', treeSpecies: [], wet: true },
  { code: 212, name: 'Ristuvemyr', landType: 'bog', treeSpecies: [], wet: true },
  { code: 213, name: 'Fastmattemyr, mager', landType: 'bog', treeSpecies: [], wet: true },
  { code: 214, name: 'Fastmattemyr, frodig', landType: 'bog', treeSpecies: [], wet: true },
  { code: 215, name: 'Sumpkärr', landType: 'bog', treeSpecies: [], wet: true },
  { code: 216, name: 'Mjukmattemyr', landType: 'bog', treeSpecies: [], wet: true },
  { code: 217, name: 'Våtmark utan växttäcke', landType: 'bog', treeSpecies: [], wet: true },
  { code: 218, name: 'Övrig öppen myr', landType: 'bog', treeSpecies: [], wet: true },
  { code: 221, name: 'Våtmark med buskar', landType: 'bog', treeSpecies: [], wet: true },
  { code: 222, name: 'Risdominerad våtmark', landType: 'bog', treeSpecies: [], wet: true },
  { code: 223, name: 'Gräsdominerad våtmark, mager', landType: 'bog', treeSpecies: [], wet: true },
  { code: 224, name: 'Gräsdominerad våtmark, frodvuxen', landType: 'bog', treeSpecies: [], wet: true },
  { code: 225, name: 'Gräsdominerad våtmark, högvuxen', landType: 'bog', treeSpecies: [], wet: true },
  { code: 226, name: 'Mossdominerad våtmark', landType: 'bog', treeSpecies: [], wet: true },
  { code: 227, name: 'Lösbottnad våtmark', landType: 'bog', treeSpecies: [], wet: true },
  { code: 228, name: 'Övrig öppen våtmark', landType: 'bog', treeSpecies: [], wet: true },

  // The 2023 edition's open land on firm ground.
  { code: 411, name: 'Öppen mark utan vegetation', landType: 'bare', treeSpecies: [], wet: false },
  { code: 4211, name: 'Buskmark, torr', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 4212, name: 'Buskmark, frisk', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 4213, name: 'Buskmark, frisk-fuktig', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 4221, name: 'Rismark, torr', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 4222, name: 'Rismark, frisk', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 4223, name: 'Rismark, frisk-fuktig', landType: 'scrub', treeSpecies: [], wet: false },
  { code: 4231, name: 'Gräsmark, torr', landType: 'meadow', treeSpecies: [], wet: false },
  { code: 4232, name: 'Gräsmark, frisk', landType: 'meadow', treeSpecies: [], wet: false },
  { code: 4233, name: 'Gräsmark, frisk-fuktig', landType: 'meadow', treeSpecies: [], wet: false },
]

/** Index in `CLASSES` per code. Pixel values are stored as index + 1 so that
 *  zero can mean "no data". */
const INDEX_BY_CODE = new Map<number, number>(CLASSES.map((c, i) => [c.code, i + 1]))

export const classByCode = (code: number): LandCoverClass | undefined =>
  CLASSES[(INDEX_BY_CODE.get(code) ?? 0) - 1]

/* ---------- Legends ---------- */

/**
 * Colour → class code for each edition, exactly as the service's legend has
 * them (GetLegendGraphic in JSON). Where the two editions share a class they
 * share a colour, which is what makes the pixel reading unambiguous.
 */
export const LEGEND_2023: Record<string, number> = {
  '#FFFFBE': 3, '#00E6A9': 23, '#55FF00': 43, '#5A1414': 51, '#E5464B': 52, '#191919': 53,
  '#800080': 54, '#6699CD': 61, '#8ACCFA': 62,
  '#6E8C05': 111, '#2D5F00': 112, '#4E7000': 113, '#38A800': 114, '#4CE600': 115,
  '#AAFF00': 116, '#97E600': 117, '#CDCD66': 118,
  '#598C55': 121, '#305E50': 122, '#23735A': 123, '#438870': 124, '#89CD9B': 125,
  '#A5F578': 126, '#ABCD78': 127, '#898944': 128,
  '#C29ED7': 200, '#894465': 211, '#CD6699': 212, '#F57AB6': 213, '#D69DBC': 214,
  '#73004C': 215, '#A80084': 216, '#E600A9': 217, '#FF00C5': 218, '#704489': 221,
  '#AA66CD': 222, '#CA7AF5': 223, '#4C0073': 225, '#8400A8': 226, '#A900E6': 227,
  '#C500FF': 228,
  '#E1E1E1': 411, '#CCD79E': 4211, '#ABC9A6': 4212, '#9EB591': 4213, '#D7C29E': 4221,
  '#CDAA66': 4222, '#897044': 4223, '#FFEBAF': 4231, '#FFD37F': 4232, '#FFBF7F': 4233,
}

export const LEGEND_2018: Record<string, number> = {
  '#C29ED7': 2, '#FFFFBE': 3, '#E1E1E1': 41, '#FFD37F': 42, '#5A1414': 51, '#E5464B': 52,
  '#191919': 53, '#6699CD': 61, '#8ACCFA': 62,
  '#6E8C05': 111, '#2D5F00': 112, '#4E7000': 113, '#38A800': 114, '#4CE600': 115,
  '#AAFF00': 116, '#97E600': 117, '#CDCD66': 118,
  '#598C55': 121, '#305E50': 122, '#23735A': 123, '#438870': 124, '#89CD9B': 125,
  '#A5F578': 126, '#ABCD78': 127, '#898944': 128,
}

type Edition = {
  /** Key prefix in the tile store. */
  id: string
  wmsLayer: string
  legend: Record<string, number>
}

export const EDITIONS: Edition[] = [
  { id: 'nmd23', wmsLayer: 'LC.LandCoverRaster.Bas_2.0', legend: LEGEND_2023 },
  { id: 'nmd18', wmsLayer: 'LC.LandCoverRaster.Bas.2018', legend: LEGEND_2018 },
]

/** Packed RGB → class index, built once per edition. */
const lookups = new Map<string, Map<number, number>>()

function lookup(ed: Edition): Map<number, number> {
  let m = lookups.get(ed.id)
  if (m) return m
  m = new Map()
  for (const [hex, code] of Object.entries(ed.legend)) {
    const rgb = parseInt(hex.slice(1), 16)
    const idx = INDEX_BY_CODE.get(code)
    if (idx) m.set(rgb, idx)
  }
  lookups.set(ed.id, m)
  return m
}

/* ---------- Tiles ---------- */

export function tileUrl(ed: Edition, z: number, x: number, y: number): string {
  const n = 2 ** z
  const west = (x / n - 0.5) * 2 * HALF_WORLD
  const east = ((x + 1) / n - 0.5) * 2 * HALF_WORLD
  const north = (0.5 - y / n) * 2 * HALF_WORLD
  const south = (0.5 - (y + 1) / n) * 2 * HALF_WORLD
  const bbox = [west, south, east, north].map((v) => v.toFixed(3)).join(',')
  return (
    `${WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${ed.wmsLayer}&styles=` +
    `&crs=EPSG:3857&bbox=${bbox}&width=${TILE_SIZE}&height=${TILE_SIZE}` +
    `&format=image/png&transparent=true`
  )
}

/** Turns a decoded tile image into class indices, zero where transparent or
 *  an unknown colour. */
export function classify(pixels: Uint8ClampedArray, ed: Edition): Uint8Array {
  const table = lookup(ed)
  const out = new Uint8Array(TILE_SIZE * TILE_SIZE)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    if (pixels[p + 3]! < 128) continue
    const rgb = (pixels[p]! << 16) | (pixels[p + 1]! << 8) | pixels[p + 2]!
    out[i] = table.get(rgb) ?? 0
  }
  return out
}

const inMemory = new Map<string, Uint8Array>()
const inFlight = new Map<string, Promise<Uint8Array>>()

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const clock = new AbortController()
  const timer = setTimeout(() => clock.abort(), TILE_TIMEOUT_MS)
  const relay = () => clock.abort()
  signal?.addEventListener('abort', relay)
  try {
    return await fetch(url, { signal: clock.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', relay)
  }
}

/**
 * One edition's tile as class indices: from memory, the tile store or the
 * network, in that order. Saved tiles never expire — land cover data is
 * published in editions, not updated in place.
 */
async function fetchClassTile(ed: Edition, z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array> {
  const key = `${ed.id}/${z}/${x}/${y}`
  const cached = inMemory.get(key)
  if (cached) return cached
  const pending = inFlight.get(key)
  if (pending) return pending

  const work = (async () => {
    const saved = await loadTile(key)
    if (saved) {
      const c = classify(await tilePixels(saved, TILE_SIZE), ed)
      inMemory.set(key, c)
      return c
    }
    // The service occasionally answers a GetMap with an XML error and is fine
    // a moment later, so one retry is cheap insurance.
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700))
      if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
      try {
        const res = await fetchWithTimeout(tileUrl(ed, z, x, y), signal)
        if (!res.ok) throw new Error(`Marktäckekakel ${key} svarade ${res.status}`)
        if (!(res.headers.get('Content-Type') ?? '').startsWith('image/')) {
          throw new Error(`Marktäckekakel ${key} gav inte en bild`)
        }
        const blob = await res.blob()
        const c = classify(await tilePixels(blob, TILE_SIZE), ed)
        await saveTile(key, blob)
        inMemory.set(key, c)
        return c
      } catch (e) {
        if (signal?.aborted) throw e
        lastError = e
      }
    }
    throw lastError ?? new Error(`Marktäckekakel ${key} gick inte att hämta`)
  })()

  inFlight.set(key, work)
  try {
    return await work
  } finally {
    inFlight.delete(key)
  }
}

/**
 * Both editions merged: the newer where it has data, the older elsewhere.
 * Returns null only when neither could be fetched.
 */
async function fetchMergedTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  const [newer, older] = await Promise.all(
    EDITIONS.map((ed) => fetchClassTile(ed, z, x, y, signal).catch((e) => {
      if (signal?.aborted) throw e
      return null
    })),
  )
  if (!newer && !older) return null
  if (!newer) return older
  if (!older) return newer
  const out = new Uint8Array(newer)
  for (let i = 0; i < out.length; i++) if (out[i] === 0) out[i] = older[i]!
  return out
}

/* ---------- Raster ---------- */

/** A stitched land cover surface that can be sampled anywhere in its area. */
export class LandCoverRaster {
  private tiles = new Map<string, Uint8Array>()
  readonly zoom = NMD_ZOOM
  /** Tiles that were fetched and hold at least one classified pixel. */
  tilesWithData = 0
  tilesWanted = 0

  add(x: number, y: number, classes: Uint8Array) {
    this.tiles.set(`${x}/${y}`, classes)
    if (classes.some((v) => v !== 0)) this.tilesWithData++
  }

  /** The class at a coordinate, or null where there is no data. */
  sample(lat: number, lon: number): LandCoverClass | null {
    const fx = lonToX(lon, this.zoom) * TILE_SIZE
    const fy = latToY(lat, this.zoom) * TILE_SIZE
    const px = Math.floor(fx)
    const py = Math.floor(fy)
    const tx = Math.floor(px / TILE_SIZE)
    const ty = Math.floor(py / TILE_SIZE)
    const t = this.tiles.get(`${tx}/${ty}`)
    if (!t) return null
    const idx = t[(py - ty * TILE_SIZE) * TILE_SIZE + (px - tx * TILE_SIZE)]!
    return idx === 0 ? null : CLASSES[idx - 1]!
  }
}

/* ---------- What the model gets ---------- */

export type LandCoverSource = 'nmd' | 'osm' | 'none'

export type LandCover = {
  box: BBox
  /** The national raster. Null when no tile could be fetched. */
  raster: LandCoverRaster | null
  /** Coarser polygons from OpenStreetMap, used only where the raster has no data. */
  areas: Area[]
  waterways: LatLng[][]
  paths: LatLng[][]
  /** Where the land type will mainly come from. 'none' means terrain only. */
  source: LandCoverSource
  /** True when the paths and streams could not be fetched. */
  linesMissing: boolean
}

/**
 * Land cover for a box: the national raster and the OpenStreetMap lines,
 * fetched side by side. Missing tiles are tolerated — a scan with most of its
 * forest data beats no scan — and only a complete blank is reported as such.
 */
export async function fetchLandCover(
  box: BBox,
  signal?: AbortSignal,
  progress?: (done: number, total: number) => void,
): Promise<LandCover> {
  const jobs = tilesCovering(box, NMD_ZOOM)
  const raster = new LandCoverRaster()
  raster.tilesWanted = jobs.length

  const rasterWork = (async () => {
    let done = 0
    progress?.(0, jobs.length)
    const CONCURRENCY = 6
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
      const group = jobs.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        group.map(async (j) => ({ j, classes: await fetchMergedTile(NMD_ZOOM, j.x, j.y, signal) })),
      )
      for (const { j, classes } of results) {
        if (classes) raster.add(j.x, j.y, classes)
        done++
      }
      progress?.(done, jobs.length)
    }
  })()

  const linesWork = fetchVectorFeatures(box, signal).catch((e) => {
    if (signal?.aborted) throw e
    return null
  })

  const [, vector] = await Promise.all([rasterWork, linesWork])

  const hasRaster = raster.tilesWithData > 0
  const areas = vector?.areas ?? []
  return {
    box,
    raster: hasRaster ? raster : null,
    areas,
    waterways: vector?.waterways ?? [],
    paths: vector?.paths ?? [],
    source: hasRaster ? 'nmd' : areas.length > 0 ? 'osm' : 'none',
    linesMissing: !vector || vector.tilesLoaded === 0,
  }
}

/* ---------- Prefetching ---------- */

export type PrefetchProgress = { done: number; total: number; what: string }

/**
 * Saves every land cover and vector tile covering the box, so that scans
 * inside it work without coverage. Both sources are static tiles, so this is
 * a plain download with no throttling to dodge; it just takes a moment.
 */
export async function prefetchLandCover(
  box: BBox,
  signal: AbortSignal,
  progress: (state: PrefetchProgress) => void,
): Promise<{ fetched: number; failed: number }> {
  const jobs = tilesCovering(box, NMD_ZOOM)
  let fetched = 0
  let failed = 0
  let done = 0
  const CONCURRENCY = 4
  progress({ done: 0, total: jobs.length, what: 'Skogs- och markdata' })
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (signal.aborted) break
    await Promise.all(
      jobs.slice(i, i + CONCURRENCY).map(async (j) => {
        const classes = await fetchMergedTile(NMD_ZOOM, j.x, j.y, signal)
        if (classes) fetched++
        else failed++
        done++
        progress({ done, total: jobs.length, what: 'Skogs- och markdata' })
      }),
    )
  }
  if (signal.aborted) return { fetched, failed }

  const lines = await prefetchVectorTiles(box, signal, (d, t) =>
    progress({ done: d, total: t, what: 'Stigar och vattendrag' }),
  )
  return { fetched: fetched + lines.fetched + lines.skipped, failed: failed + lines.failed }
}

/* ---------- Names ---------- */

export const LAND_TYPE_NAME: Record<LandType, string> = {
  coniferous: 'Barrskog',
  deciduous: 'Lövskog',
  mixed: 'Blandskog',
  forest: 'Skog',
  scrub: 'Busksnår / hed',
  bog: 'Myr eller kärr',
  meadow: 'Äng eller gräsmark',
  farmland: 'Åker',
  water: 'Vatten',
  built: 'Bebyggt',
  clearcut: 'Hygge',
  bare: 'Kalmark eller berg',
  unknown: 'Okänt',
}
