/**
 * Terrain analysis on a digital elevation model (DEM).
 *
 * Chanterelles care about three things in the ground: how steep it is, which
 * way the slope faces, and how much water collects. The first two are simple
 * derivatives. The third needs real hydrology — we fill sinks, compute D8 flow
 * directions and accumulate catchment area, exactly as in GIS. The result is
 * TWI (topographic wetness index), the same measure SLU's soil moisture maps
 * are built on.
 */

import { metresPerDegreeLat, metresPerDegreeLon } from './geo.ts'
import type { BBox } from './types.ts'

export type DEM = {
  rows: number
  cols: number
  /** Row 0 is the northernmost. */
  box: BBox
  /** Approximate cell size in metres (square approximation). */
  cellM: number
  /** Cell size in metres along x and y respectively. */
  cellX: number
  cellY: number
  z: Float32Array
}

export function createDEM(box: BBox, rows: number, cols: number, z: Float32Array): DEM {
  const midLat = (box.south + box.north) / 2
  const cellY = ((box.north - box.south) / (rows - 1)) * metresPerDegreeLat()
  const cellX = ((box.east - box.west) / (cols - 1)) * metresPerDegreeLon(midLat)
  return { rows, cols, box, z, cellX, cellY, cellM: Math.sqrt(cellX * cellY) }
}

/** Lat/lon of the cell's centre point. */
export function cellCoord(dem: DEM, r: number, c: number) {
  const lat = dem.box.north - (r / (dem.rows - 1)) * (dem.box.north - dem.box.south)
  const lon = dem.box.west + (c / (dem.cols - 1)) * (dem.box.east - dem.box.west)
  return { lat, lon }
}

/** Nearest cell index for a coordinate (clamped to the grid). */
export function coordCell(dem: DEM, lat: number, lon: number) {
  const fr = ((dem.box.north - lat) / (dem.box.north - dem.box.south)) * (dem.rows - 1)
  const fc = ((lon - dem.box.west) / (dem.box.east - dem.box.west)) * (dem.cols - 1)
  return {
    r: Math.max(0, Math.min(dem.rows - 1, Math.round(fr))),
    c: Math.max(0, Math.min(dem.cols - 1, Math.round(fc))),
    fr,
    fc,
  }
}

const idx = (dem: DEM, r: number, c: number) => r * dem.cols + c

/** Bilinear elevation lookup between cells. */
export function elevationAt(dem: DEM, lat: number, lon: number): number {
  const { fr, fc } = coordCell(dem, lat, lon)
  const r0 = Math.max(0, Math.min(dem.rows - 2, Math.floor(fr)))
  const c0 = Math.max(0, Math.min(dem.cols - 2, Math.floor(fc)))
  const tr = Math.max(0, Math.min(1, fr - r0))
  const tc = Math.max(0, Math.min(1, fc - c0))
  const z00 = dem.z[idx(dem, r0, c0)]!
  const z01 = dem.z[idx(dem, r0, c0 + 1)]!
  const z10 = dem.z[idx(dem, r0 + 1, c0)]!
  const z11 = dem.z[idx(dem, r0 + 1, c0 + 1)]!
  return (
    z00 * (1 - tr) * (1 - tc) +
    z01 * (1 - tr) * tc +
    z10 * tr * (1 - tc) +
    z11 * tr * tc
  )
}

/**
 * Slope (degrees) and aspect (degrees from north) using Horn's method — a
 * weighted 3×3 window, more robust to noise than a plain difference.
 */
export function slope(dem: DEM, r: number, c: number): { degrees: number; aspect: number | null } {
  const g = (dr: number, dc: number) => {
    const rr = Math.max(0, Math.min(dem.rows - 1, r + dr))
    const cc = Math.max(0, Math.min(dem.cols - 1, c + dc))
    return dem.z[idx(dem, rr, cc)]!
  }
  // a b c / d e f / g h i  (row -1 is north)
  const a = g(-1, -1), b = g(-1, 0), c2 = g(-1, 1)
  const d = g(0, -1), f = g(0, 1)
  const gg = g(1, -1), h = g(1, 0), i = g(1, 1)

  const dzdx = (c2 + 2 * f + i - (a + 2 * d + gg)) / (8 * dem.cellX)
  // y grows southward in the grid, so flip the sign to get "up = north"
  const dzdy = (gg + 2 * h + i - (a + 2 * b + c2)) / (8 * dem.cellY)

  const slopeRad = Math.atan(Math.hypot(dzdx, dzdy))
  const degrees = (slopeRad * 180) / Math.PI
  if (degrees < 0.15) return { degrees, aspect: null }

  // The direction the slope faces (downhill).
  let asp = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI
  asp = (90 - asp + 360) % 360
  return { degrees, aspect: asp }
}

/* ---------- Hydrology ---------- */

/** Minimal binary heap for priority-flood. */
class Heap {
  private a: number[] = []
  private p: number[] = []
  get size() {
    return this.a.length
  }
  push(v: number, pri: number) {
    this.a.push(v)
    this.p.push(pri)
    let i = this.a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.p[parent]! <= this.p[i]!) break
      this.swap(i, parent)
      i = parent
    }
  }
  pop(): number {
    const top = this.a[0]!
    const lastV = this.a.pop()!
    const lastP = this.p.pop()!
    if (this.a.length) {
      this.a[0] = lastV
      this.p[0] = lastP
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.a.length && this.p[l]! < this.p[m]!) m = l
        if (r < this.a.length && this.p[r]! < this.p[m]!) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
  private swap(i: number, j: number) {
    ;[this.a[i], this.a[j]] = [this.a[j]!, this.a[i]!]
    ;[this.p[i], this.p[j]] = [this.p[j]!, this.p[i]!]
  }
}

/**
 * Fills sinks with priority-flood (Barnes et al. 2014) so that every cell has
 * a path out to the edge. Without it all flow gets stuck in small holes in the
 * elevation data.
 */
export function fillSinks(dem: DEM): Float32Array {
  const n = dem.rows * dem.cols
  const z = new Float32Array(dem.z)
  const done = new Uint8Array(n)
  const heap = new Heap()

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      if (r === 0 || c === 0 || r === dem.rows - 1 || c === dem.cols - 1) {
        const i = idx(dem, r, c)
        done[i] = 1
        heap.push(i, z[i]!)
      }
    }
  }

  const neighbours = [-1, 0, 1]
  while (heap.size) {
    const i = heap.pop()
    const r = (i / dem.cols) | 0
    const c = i % dem.cols
    for (const dr of neighbours) {
      for (const dc of neighbours) {
        if (dr === 0 && dc === 0) continue
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || cc < 0 || rr >= dem.rows || cc >= dem.cols) continue
        const j = idx(dem, rr, cc)
        if (done[j]) continue
        done[j] = 1
        // A minimal gradient so water keeps moving across filled-in flats.
        if (z[j]! <= z[i]!) z[j] = z[i]! + 1e-4
        heap.push(j, z[j]!)
      }
    }
  }
  return z
}

/**
 * D8 flow accumulation: how many cells drain through each cell. Returns the
 * number of upstream cells including itself.
 */
export function flowAccumulation(dem: DEM, zFilled: Float32Array): Float32Array {
  const n = dem.rows * dem.cols
  const acc = new Float32Array(n).fill(1)
  const receiver = new Int32Array(n).fill(-1)

  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const i = idx(dem, r, c)
      let bestSlope = 0
      let best = -1
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || cc < 0 || rr >= dem.rows || cc >= dem.cols) continue
          const j = idx(dem, rr, cc)
          const dist = Math.hypot(dc * dem.cellX, dr * dem.cellY)
          const s = (zFilled[i]! - zFilled[j]!) / dist
          if (s > bestSlope) {
            bestSlope = s
            best = j
          }
        }
      }
      receiver[i] = best
    }
  }

  // Process from the highest cell to the lowest — then each cell's upstream
  // flow is fully summed before it passes anything on.
  const order = Array.from({ length: n }, (_, i) => i)
  order.sort((a, b) => zFilled[b]! - zFilled[a]!)
  for (const i of order) {
    const m = receiver[i]!
    if (m >= 0) acc[m] += acc[i]!
  }
  return acc
}

/**
 * Topographic Wetness Index: ln(upslope area per contour width / slope).
 * Low values = dry ridge. High values = wet hollow or stream bed.
 * The chanterelle wants to sit somewhere in the middle — moist but drained.
 */
export function computeTWI(dem: DEM): Float32Array {
  const zF = fillSinks(dem)
  const acc = flowAccumulation(dem, zF)
  const n = dem.rows * dem.cols
  const twi = new Float32Array(n)
  const cellArea = dem.cellX * dem.cellY
  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const i = idx(dem, r, c)
      const { degrees } = slope(dem, r, c)
      const tanB = Math.max(Math.tan((degrees * Math.PI) / 180), 0.0015)
      const a = (acc[i]! * cellArea) / dem.cellM
      twi[i] = Math.log(a / tanB)
    }
  }
  return twi
}

/** Every derived terrain measure in one pass, so hydrology runs only once. */
export type Terrain = {
  dem: DEM
  twi: Float32Array
  slopeDegrees: Float32Array
  aspect: Float32Array
}

export function analyseTerrain(dem: DEM): Terrain {
  const n = dem.rows * dem.cols
  const slopeDegrees = new Float32Array(n)
  const aspect = new Float32Array(n).fill(-1)
  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const i = idx(dem, r, c)
      const l = slope(dem, r, c)
      slopeDegrees[i] = l.degrees
      aspect[i] = l.aspect ?? -1
    }
  }
  return { dem, twi: computeTWI(dem), slopeDegrees, aspect }
}
