/**
 * Area scan: turns a patch of forest into a probability map.
 *
 * The chain is: elevation grid → terrain analysis (slope, aspect, wetness
 * index) → land cover from the national land cover raster, with paths and
 * streams from OpenStreetMap → known finds from GBIF and your own logbook →
 * habitat score per cell → multiplied by today's fruiting and season.
 *
 * The emphasis is on doing this fast enough to be useful. Distances to water,
 * paths and forest edges are computed with a distance transform on the grid
 * rather than point-to-line per cell — otherwise a scan takes minutes instead
 * of seconds.
 */

import { distance, bboxAround, inPolygon, metresPerDegreeLat, metresPerDegreeLon } from '../lib/geo.ts'
import { analyseTerrain, cellCoord, createDEM, type Terrain } from '../lib/terrain.ts'
import type {
  BBox, Find, HabitatSample, Host, LandType, LatLng, ScanCell, ScorePart, SpeciesId,
} from '../lib/types.ts'
import { fetchWeather, type WeatherSeries } from '../data/weather.ts'
import { ElevationMosaic } from '../data/elevationTiles.ts'
import { fetchLandCover, type LandCover } from '../data/landCover.ts'
import { fetchObservations, observationSupport, type Observation } from '../data/gbif.ts'
import { species as lookupSpecies } from '../data/species.ts'
import { computeHabitat } from './habitat.ts'
import { computeFruiting, seasonFactor, type Fruiting } from './fruiting.ts'
import { adaptSpecies, type Learning } from './personalize.ts'

export type Progress = (step: string, share: number) => void

export type ScanOptions = {
  center: LatLng
  radiusM: number
  species: SpeciesId
  finds: Find[]
  progress?: Progress
  signal?: AbortSignal
}

export type Scan = {
  center: LatLng
  radiusM: number
  species: SpeciesId
  box: BBox
  rows: number
  cols: number
  cellM: number
  /** Cells in grid order. `null` for cells outside the search radius. */
  grid: (ScanCell | null)[]
  cells: ScanCell[]
  fruiting: Fruiting
  season: number
  weather: WeatherSeries
  learning: Learning
  observations: Observation[]
  time: number
  /**
   * True when no land cover at all could be fetched. The scan is still usable
   * — the terrain carries most of it — but it cannot tell forest from
   * farmland, and that has to be visible in the interface instead of quietly
   * appearing to work.
   */
  landCoverMissing: boolean
}

/* ---------- Grid helpers ---------- */

/** Distance transform: metres to the nearest marked cell. Two-pass chamfer. */
function distanceField(rows: number, cols: number, seeds: Uint8Array, cellM: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(rows * cols).fill(INF)
  for (let i = 0; i < d.length; i++) if (seeds[i]) d[i] = 0
  const a = 1
  const b = Math.SQRT2

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      let v = d[i]!
      if (r > 0) {
        v = Math.min(v, d[i - cols]! + a)
        if (c > 0) v = Math.min(v, d[i - cols - 1]! + b)
        if (c < cols - 1) v = Math.min(v, d[i - cols + 1]! + b)
      }
      if (c > 0) v = Math.min(v, d[i - 1]! + a)
      d[i] = v
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c
      let v = d[i]!
      if (r < rows - 1) {
        v = Math.min(v, d[i + cols]! + a)
        if (c > 0) v = Math.min(v, d[i + cols - 1]! + b)
        if (c < cols - 1) v = Math.min(v, d[i + cols + 1]! + b)
      }
      if (c < cols - 1) v = Math.min(v, d[i + 1]! + a)
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! >= INF ? Infinity : d[i]! * cellM
  return d
}

/** Draws a line of lat/lon points into the grid. */
function rasteriseLine(
  line: { lat: number; lon: number }[],
  box: BBox,
  rows: number,
  cols: number,
  out: Uint8Array,
) {
  const toCell = (p: { lat: number; lon: number }) => ({
    r: ((box.north - p.lat) / (box.north - box.south)) * (rows - 1),
    c: ((p.lon - box.west) / (box.east - box.west)) * (cols - 1),
  })
  for (let k = 0; k < line.length - 1; k++) {
    const a = toCell(line[k]!)
    const b = toCell(line[k + 1]!)
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c)) * 2))
    for (let s = 0; s <= steps; s++) {
      const r = Math.round(a.r + ((b.r - a.r) * s) / steps)
      const c = Math.round(a.c + ((b.c - a.c) * s) / steps)
      if (r < 0 || c < 0 || r >= rows || c >= cols) continue
      out[r * cols + c] = 1
    }
  }
}

/** Forest and whatever is probably forest — no edge is drawn between them. */
const FOREST_LIKE = new Set<LandType>(['forest', 'coniferous', 'deciduous', 'mixed', 'unknown'])

type Painted = {
  landType: LandType[]
  treeSpecies: Host[][]
  /** Cells that are water: lakes, streams, ditches. */
  waterSeeds: Uint8Array
  /** Cells on a forest edge or a path. */
  edgeSeeds: Uint8Array
}

/**
 * Paints the land cover onto the grid.
 *
 * The fallback polygons go on first, higher priority over lower, and the
 * national raster on top wherever it has data — which in Sweden is
 * everywhere. Water and edge seeds are then read off the finished grid, so a
 * forest edge is simply where forest meets something that is not forest:
 * a clear-cut, a mire, a field, a road.
 */
function paintLandCover(lc: LandCover, box: BBox, rows: number, cols: number): Painted {
  const landType: LandType[] = new Array(rows * cols).fill('unknown')
  const treeSpecies: Host[][] = new Array(rows * cols).fill(null).map(() => [] as Host[])
  const prio = new Int16Array(rows * cols)

  const sorted = [...lc.areas].sort((a, b) => a.priority - b.priority)
  for (const area of sorted) {
    const r0 = Math.max(0, Math.floor(((box.north - area.box.north) / (box.north - box.south)) * (rows - 1)))
    const r1 = Math.min(rows - 1, Math.ceil(((box.north - area.box.south) / (box.north - box.south)) * (rows - 1)))
    const c0 = Math.max(0, Math.floor(((area.box.west - box.west) / (box.east - box.west)) * (cols - 1)))
    const c1 = Math.min(cols - 1, Math.ceil(((area.box.east - box.west) / (box.east - box.west)) * (cols - 1)))
    if (r1 < r0 || c1 < c0) continue
    for (let r = r0; r <= r1; r++) {
      const lat = box.north - (r / (rows - 1)) * (box.north - box.south)
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c
        if (prio[i]! > area.priority) continue
        const lon = box.west + (c / (cols - 1)) * (box.east - box.west)
        if (!inPolygon(lat, lon, area.ring)) continue
        landType[i] = area.landType
        prio[i] = area.priority
        if (area.treeSpecies.length) treeSpecies[i] = area.treeSpecies
      }
    }
  }

  if (lc.raster) {
    for (let r = 0; r < rows; r++) {
      const lat = box.north - (r / (rows - 1)) * (box.north - box.south)
      for (let c = 0; c < cols; c++) {
        const lon = box.west + (c / (cols - 1)) * (box.east - box.west)
        const k = lc.raster.sample(lat, lon)
        if (!k) continue
        const i = r * cols + c
        landType[i] = k.landType
        treeSpecies[i] = k.treeSpecies
      }
    }
  }

  const waterSeeds = new Uint8Array(rows * cols)
  for (const l of lc.waterways) rasteriseLine(l, box, rows, cols, waterSeeds)
  for (let i = 0; i < waterSeeds.length; i++) if (landType[i] === 'water') waterSeeds[i] = 1

  const edgeSeeds = new Uint8Array(rows * cols)
  for (const l of lc.paths) rasteriseLine(l, box, rows, cols, edgeSeeds)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const forest = FOREST_LIKE.has(landType[i]!)
      if (c + 1 < cols && FOREST_LIKE.has(landType[i + 1]!) !== forest) {
        edgeSeeds[i] = 1
        edgeSeeds[i + 1] = 1
      }
      if (r + 1 < rows && FOREST_LIKE.has(landType[i + cols]!) !== forest) {
        edgeSeeds[i] = 1
        edgeSeeds[i + cols] = 1
      }
    }
  }

  return { landType, treeSpecies, waterSeeds, edgeSeeds }
}

const emptyLandCover = (box: BBox): LandCover => ({
  box, raster: null, areas: [], waterways: [], paths: [], source: 'none', linesMissing: true,
})

/* ---------- Elevation grid ---------- */

async function buildDEM(
  box: BBox,
  rows: number,
  cols: number,
  cellM: number,
  progress: Progress | undefined,
  signal: AbortSignal | undefined,
  from: number,
  to: number,
) {
  // Aim for tiles at least as fine grained as the grid, so we do not
  // interpolate up data that is not there.
  const mosaic = await ElevationMosaic.load(box, cellM * 0.9, signal, (done, total) =>
    progress?.('Hämtar höjddata', from + ((to - from) * done) / Math.max(1, total)),
  )

  const z = new Float32Array(rows * cols)
  let missing = 0
  for (let r = 0; r < rows; r++) {
    const lat = box.north - (r / (rows - 1)) * (box.north - box.south)
    for (let c = 0; c < cols; c++) {
      const lon = box.west + (c / (cols - 1)) * (box.east - box.west)
      const h = mosaic.elevation(lat, lon)
      if (isNaN(h)) missing++
      z[r * cols + c] = h
    }
  }

  // Isolated gaps at tile boundaries are filled with a neighbour mean so the
  // hydrology has no holes to get stuck in.
  if (missing > 0) {
    for (let pass = 0; pass < 3 && missing > 0; pass++) {
      missing = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          if (!isNaN(z[i]!)) continue
          let sum = 0
          let n = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr
              const cc = c + dc
              if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
              const v = z[rr * cols + cc]!
              if (!isNaN(v)) { sum += v; n++ }
            }
          }
          if (n > 0) z[i] = sum / n
          else missing++
        }
      }
    }
    for (let i = 0; i < z.length; i++) if (isNaN(z[i]!)) z[i] = 0
  }

  return { dem: createDEM(box, rows, cols, z), mosaic }
}

/* ---------- Scan ---------- */

export async function scan(options: ScanOptions): Promise<Scan> {
  const { center, radiusM, finds, progress, signal } = options
  const baseSpecies = lookupSpecies(options.species)
  const { species: sp, learning } = adaptSpecies(baseSpecies, finds)

  // A margin so the paths of water are not cut off at the edge of the grid.
  const margin = 1.35
  const box = bboxAround(center, radiusM * margin)

  // Elevation tiles are around ten metres of resolution, so the grid may be
  // fine. The ceiling keeps scoring under a second even on a phone.
  const widthM = radiusM * 2 * margin
  const MAX_SIDE = 170
  const MIN_CELL = 16
  const n = Math.min(MAX_SIDE, Math.max(50, Math.round(widthM / MIN_CELL) + 1))
  const rows = n
  const cols = n
  const targetCell = widthM / (n - 1)

  progress?.('Hämtar väderdata', 2)
  const weather = await fetchWeather(center.lat, center.lon)
  const todayDate = weather.days[weather.today]!.date
  const fruiting = computeFruiting(weather.days, sp, todayDate)
  const season = seasonFactor(sp, new Date(), center.lat)

  const { dem } = await buildDEM(box, rows, cols, targetCell, progress, signal, 5, 48)

  progress?.('Analyserar terräng', 52)
  await yieldToRender()
  const terrain: Terrain = analyseTerrain(dem)

  progress?.('Hämtar skogs- och markdata', 62)
  let landCover: LandCover
  try {
    landCover = await fetchLandCover(box, signal, (done, total) =>
      progress?.('Hämtar skogs- och markdata', 62 + (16 * done) / Math.max(1, total)),
    )
  } catch (e) {
    if (signal?.aborted) throw e
    // Without land cover it gets worse but not worthless — the terrain carries the model.
    landCover = emptyLandCover(box)
  }
  const landCoverMissing = landCover.source === 'none'

  progress?.('Hämtar rapporterade fynd', 80)
  let observations: Observation[] = []
  try {
    observations = await fetchObservations(box, [options.species], signal)
  } catch {
    observations = []
  }

  progress?.('Poängsätter terrängen', 86)
  await yieldToRender()

  const { landType, treeSpecies, waterSeeds, edgeSeeds } = paintLandCover(landCover, box, rows, cols)

  // Distance fields for water and for forest edges and paths.
  const dWater = distanceField(rows, cols, waterSeeds, dem.cellM)
  const dEdge = distanceField(rows, cols, edgeSeeds, dem.cellM)

  const mLat = metresPerDegreeLat()
  const mLon = metresPerDegreeLon(center.lat)
  const ownObs = findsAsObservations(finds, options.species)

  const grid: (ScanCell | null)[] = new Array(rows * cols).fill(null)
  const cells: ScanCell[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const { lat, lon } = cellCoord(dem, r, c)
      if (distance(center, { lat, lon }) > radiusM) continue

      const asp = terrain.aspect[i]!
      const sample: HabitatSample = {
        lat,
        lon,
        landType: landType[i]!,
        elevation: dem.z[i]!,
        slope: terrain.slopeDegrees[i]!,
        aspect: asp < 0 ? null : asp,
        twi: terrain.twi[i]!,
        toWater: isFinite(dWater[i]!) ? dWater[i]! : null,
        toEdge: isFinite(dEdge[i]!) ? dEdge[i]! : null,
        treeSpecies: treeSpecies[i]!,
      }

      const gbifSupport = observationSupport(observations, lat, lon, mLat, mLon)
      const ownSupport = observationSupport(ownObs, lat, lon, mLat, mLon)

      const h = computeHabitat({
        sample,
        species: sp,
        soilTemp: fruiting.meanSoilTemp,
        gbifSupport,
        ownSupport,
      })

      const cell: ScanCell = {
        lat,
        lon,
        score: h.score,
        habitat: sample,
        support: gbifSupport + ownSupport,
      }
      grid[i] = cell
      cells.push(cell)
    }
    if (r % 12 === 0) await yieldToRender()
  }

  progress?.('Klart', 100)

  return {
    center,
    radiusM,
    species: options.species,
    box,
    rows,
    cols,
    cellM: dem.cellM,
    grid,
    cells,
    fruiting,
    season,
    weather,
    learning,
    observations,
    time: Date.now(),
    landCoverMissing,
  }
}

/**
 * Your own finds translated into observation format. The GPS accuracy becomes
 * the uncertainty, and the amount decides the weight — a full basket says more
 * about a place than one lone little chanterelle.
 */
function findsAsObservations(finds: Find[], speciesId: SpeciesId): Observation[] {
  const weight: Record<string, number> = { few: 1, handful: 2, basket: 3, jackpot: 4 }
  const out: Observation[] = []
  for (const f of finds) {
    if (f.species !== speciesId) continue
    const d = new Date(f.time)
    const uncertainty = Math.max(25, Math.min(120, f.accuracy ?? 40))
    // Repeat heavy finds so they weigh more in the sum.
    const n = weight[f.amount] ?? 1
    for (let k = 0; k < n; k++) {
      out.push({
        lat: f.lat,
        lon: f.lon,
        species: f.species,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        uncertainty,
        place: null,
      })
    }
  }
  return out
}

/** Lets rendering through so the interface does not freeze during heavy loops. */
const yieldToRender = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * The final chance in per cent: the habitat's quality times how much is
 * fruiting right now times the season. The formula lives only here.
 */
export function chance(habitat: number, fruitingIndex: number, season: number): number {
  return habitat * fruitingIndex * season * 100
}

/** The final chance in per cent for a cell in a scan. */
export function chanceForCell(s: Scan, cell: ScanCell): number {
  return chance(cell.score, s.fruiting.index, s.season)
}

/**
 * The best places to head for, with a minimum spacing so you get spread-out
 * tips rather than six dots on the same hillock.
 *
 * Cells too close to a find you have already saved are skipped. Those places
 * show up as their own markers on the map anyway, and a tip pointing at
 * somewhere you found yourself last year is not a tip. These are suggestions
 * for new ground.
 */
export function bestPlaces(
  s: Scan,
  count: number,
  minSpacingM = 140,
  ownFinds: Find[] = [],
  minFromOwnM = 90,
): ScanCell[] {
  const relevant = ownFinds.filter((f) => f.species === s.species)
  const sorted = [...s.cells].sort((a, b) => b.score - a.score)
  const chosen: ScanCell[] = []
  for (const c of sorted) {
    if (chosen.length >= count) break
    if (chosen.some((v) => distance(v, c) < minSpacingM)) continue
    if (relevant.some((f) => distance(f, c) < minFromOwnM)) continue
    chosen.push(c)
  }
  return chosen
}

/**
 * The numbered top places, exactly as they land on the map.
 *
 * The numbering exists in two places — the markers on the map and the label in
 * the navigation panel — and must be the same figure in both. The selection
 * therefore lives here and not in whichever happens to draw first.
 */
export function numberedTopPlaces(s: Scan, ownFinds: Find[] = []): ScanCell[] {
  const best = bestPlaces(s, 6, s.radiusM / 6, ownFinds)
  // A tip noticeably worse than the best one is not a tip.
  const threshold = (best[0]?.score ?? 0) * 0.82
  return best.filter((c) => c.score >= threshold)
}

/* ---------- Single point ---------- */

export type PointAssessment = {
  point: LatLng
  sample: HabitatSample
  habitat: number
  parts: ScorePart[]
  fruiting: Fruiting
  season: number
  /** The final chance in per cent. */
  chance: number
  weather: WeatherSeries
  learning: Learning
  /** True when the assessment was read from a finished scan instead of the net. */
  fromScan: boolean
  /** True when no land cover could be fetched — the score is then terrain only. */
  landCoverMissing: boolean
}

/** Reads out a point from an already completed scan. Instantaneous. */
export function assessFromScan(
  s: Scan,
  point: LatLng,
  finds: Find[],
): PointAssessment | null {
  if (
    point.lat < s.box.south || point.lat > s.box.north ||
    point.lon < s.box.west || point.lon > s.box.east
  ) return null

  const r = Math.round(((s.box.north - point.lat) / (s.box.north - s.box.south)) * (s.rows - 1))
  const c = Math.round(((point.lon - s.box.west) / (s.box.east - s.box.west)) * (s.cols - 1))
  if (r < 0 || c < 0 || r >= s.rows || c >= s.cols) return null
  const cell = s.grid[r * s.cols + c]
  if (!cell) return null

  const baseSpecies = lookupSpecies(s.species)
  const { species: sp, learning } = adaptSpecies(baseSpecies, finds)
  const mLat = metresPerDegreeLat()
  const mLon = metresPerDegreeLon(point.lat)
  const h = computeHabitat({
    sample: cell.habitat,
    species: sp,
    soilTemp: s.fruiting.meanSoilTemp,
    gbifSupport: observationSupport(s.observations, cell.lat, cell.lon, mLat, mLon),
    ownSupport: observationSupport(findsAsObservations(finds, s.species), cell.lat, cell.lon, mLat, mLon),
  })

  return {
    point: { lat: cell.lat, lon: cell.lon },
    sample: cell.habitat,
    habitat: h.score,
    parts: h.parts,
    fruiting: s.fruiting,
    season: s.season,
    chance: chance(h.score, s.fruiting.index, s.season),
    weather: s.weather,
    learning,
    fromScan: true,
    landCoverMissing: s.landCoverMissing,
  }
}

/**
 * Assesses a single point without a finished scan. Fetches only the small area
 * needed — but still large enough for the hydrology to be meaningful, since
 * the path water takes to a point is determined by the hillside above it.
 */
export async function assessPoint(
  point: LatLng,
  speciesId: SpeciesId,
  finds: Find[],
  signal?: AbortSignal,
): Promise<PointAssessment> {
  const baseSpecies = lookupSpecies(speciesId)
  const { species: sp, learning } = adaptSpecies(baseSpecies, finds)

  const RADIUS = 450
  const box = bboxAround(point, RADIUS)
  const N = 91
  const cellM = (RADIUS * 2) / (N - 1)

  const weather = await fetchWeather(point.lat, point.lon)
  const fruiting = computeFruiting(weather.days, sp, weather.days[weather.today]!.date)
  const season = seasonFactor(sp, new Date(), point.lat)

  const { dem } = await buildDEM(box, N, N, cellM, undefined, signal, 0, 0)
  const terrain = analyseTerrain(dem)

  let landCover: LandCover
  try {
    landCover = await fetchLandCover(box, signal)
  } catch (e) {
    if (signal?.aborted) throw e
    landCover = emptyLandCover(box)
  }
  const landCoverMissing = landCover.source === 'none'

  let observations: Observation[] = []
  try {
    observations = await fetchObservations(box, [speciesId], signal)
  } catch {
    observations = []
  }

  const { landType, treeSpecies, waterSeeds, edgeSeeds } = paintLandCover(landCover, box, N, N)

  const dWater = distanceField(N, N, waterSeeds, dem.cellM)
  const dEdge = distanceField(N, N, edgeSeeds, dem.cellM)

  const r = Math.max(0, Math.min(N - 1, Math.round(((box.north - point.lat) / (box.north - box.south)) * (N - 1))))
  const c = Math.max(0, Math.min(N - 1, Math.round(((point.lon - box.west) / (box.east - box.west)) * (N - 1))))
  const i = r * N + c
  const asp = terrain.aspect[i]!

  const sample: HabitatSample = {
    lat: point.lat,
    lon: point.lon,
    landType: landType[i]!,
    elevation: dem.z[i]!,
    slope: terrain.slopeDegrees[i]!,
    aspect: asp < 0 ? null : asp,
    twi: terrain.twi[i]!,
    toWater: isFinite(dWater[i]!) ? dWater[i]! : null,
    toEdge: isFinite(dEdge[i]!) ? dEdge[i]! : null,
    treeSpecies: treeSpecies[i]!,
  }

  const mLat = metresPerDegreeLat()
  const mLon = metresPerDegreeLon(point.lat)
  const h = computeHabitat({
    sample,
    species: sp,
    soilTemp: fruiting.meanSoilTemp,
    gbifSupport: observationSupport(observations, point.lat, point.lon, mLat, mLon),
    ownSupport: observationSupport(findsAsObservations(finds, speciesId), point.lat, point.lon, mLat, mLon),
  })

  return {
    point,
    sample,
    habitat: h.score,
    parts: h.parts,
    fruiting,
    season,
    chance: chance(h.score, fruiting.index, season),
    weather,
    learning,
    fromScan: false,
    landCoverMissing,
  }
}
