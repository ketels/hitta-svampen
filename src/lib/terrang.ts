/**
 * Terränganalys på en höjdmodell (DEM).
 *
 * Kantareller bryr sig om tre saker i marken: hur brant det är, åt vilket håll
 * lutningen pekar, och hur mycket vatten som samlas. De två första är enkel
 * derivata. Den tredje kräver riktig hydrologi — vi fyller sänkor, räknar ut
 * D8-flödesriktningar och ackumulerar avrinningsområde, precis som i GIS.
 * Resultatet är TWI (topographic wetness index), samma mått som SLU:s
 * markfuktighetskartor bygger på.
 */

import { meterPerGradLat, meterPerGradLon } from './geo.ts'
import type { BBox } from './types.ts'

export type DEM = {
  rader: number
  kolumner: number
  /** Rad 0 ligger längst norrut. */
  box: BBox
  /** Ungefärlig cellstorlek i meter (kvadratisk approximation). */
  cellM: number
  /** Cellstorlek i meter i x- respektive y-led. */
  cellX: number
  cellY: number
  z: Float32Array
}

export function skapaDEM(box: BBox, rader: number, kolumner: number, z: Float32Array): DEM {
  const midLat = (box.south + box.north) / 2
  const cellY = ((box.north - box.south) / (rader - 1)) * meterPerGradLat()
  const cellX = ((box.east - box.west) / (kolumner - 1)) * meterPerGradLon(midLat)
  return { rader, kolumner, box, z, cellX, cellY, cellM: Math.sqrt(cellX * cellY) }
}

/** Lat/lon för cellens mittpunkt. */
export function cellKoord(dem: DEM, r: number, c: number) {
  const lat =
    dem.box.north - (r / (dem.rader - 1)) * (dem.box.north - dem.box.south)
  const lon = dem.box.west + (c / (dem.kolumner - 1)) * (dem.box.east - dem.box.west)
  return { lat, lon }
}

/** Närmaste cellindex för en koordinat (klippt till griden). */
export function koordCell(dem: DEM, lat: number, lon: number) {
  const fr = ((dem.box.north - lat) / (dem.box.north - dem.box.south)) * (dem.rader - 1)
  const fc = ((lon - dem.box.west) / (dem.box.east - dem.box.west)) * (dem.kolumner - 1)
  return {
    r: Math.max(0, Math.min(dem.rader - 1, Math.round(fr))),
    c: Math.max(0, Math.min(dem.kolumner - 1, Math.round(fc))),
    fr,
    fc,
  }
}

const idx = (dem: DEM, r: number, c: number) => r * dem.kolumner + c

/** Bilinjär höjdavläsning mellan cellerna. */
export function hojdVid(dem: DEM, lat: number, lon: number): number {
  const { fr, fc } = koordCell(dem, lat, lon)
  const r0 = Math.max(0, Math.min(dem.rader - 2, Math.floor(fr)))
  const c0 = Math.max(0, Math.min(dem.kolumner - 2, Math.floor(fc)))
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
 * Lutning (grader) och väderstreck (grader från norr) med Horns metod —
 * ett viktat 3×3-fönster, robustare mot brus än enkel differens.
 */
export function lutning(dem: DEM, r: number, c: number): { grader: number; vaderstreck: number | null } {
  const g = (dr: number, dc: number) => {
    const rr = Math.max(0, Math.min(dem.rader - 1, r + dr))
    const cc = Math.max(0, Math.min(dem.kolumner - 1, c + dc))
    return dem.z[idx(dem, rr, cc)]!
  }
  // a b c / d e f / g h i  (rad -1 är norr)
  const a = g(-1, -1), b = g(-1, 0), cc2 = g(-1, 1)
  const d = g(0, -1), f = g(0, 1)
  const gg = g(1, -1), h = g(1, 0), i = g(1, 1)

  const dzdx = (cc2 + 2 * f + i - (a + 2 * d + gg)) / (8 * dem.cellX)
  // y växer söderut i griden, så vänd tecknet för att få "uppåt = norr"
  const dzdy = (gg + 2 * h + i - (a + 2 * b + cc2)) / (8 * dem.cellY)

  const lutRad = Math.atan(Math.hypot(dzdx, dzdy))
  const grader = (lutRad * 180) / Math.PI
  if (grader < 0.15) return { grader, vaderstreck: null }

  // Väderstrecket lutningen pekar mot (nedför).
  let asp = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI
  asp = (90 - asp + 360) % 360
  return { grader, vaderstreck: asp }
}

/* ---------- Hydrologi ---------- */

/** Minimal binärheap för priority-flood. */
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
      const par = (i - 1) >> 1
      if (this.p[par]! <= this.p[i]!) break
      this.swap(i, par)
      i = par
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
 * Fyller sänkor med priority-flood (Barnes m.fl. 2014) så att varje cell har
 * en väg ut till kanten. Utan det här fastnar allt flöde i småhål i höjddatan.
 */
export function fyllSankor(dem: DEM): Float32Array {
  const n = dem.rader * dem.kolumner
  const z = new Float32Array(dem.z)
  const klar = new Uint8Array(n)
  const heap = new Heap()

  for (let r = 0; r < dem.rader; r++) {
    for (let c = 0; c < dem.kolumner; c++) {
      if (r === 0 || c === 0 || r === dem.rader - 1 || c === dem.kolumner - 1) {
        const i = idx(dem, r, c)
        klar[i] = 1
        heap.push(i, z[i]!)
      }
    }
  }

  const grannar = [-1, 0, 1]
  while (heap.size) {
    const i = heap.pop()
    const r = (i / dem.kolumner) | 0
    const c = i % dem.kolumner
    for (const dr of grannar) {
      for (const dc of grannar) {
        if (dr === 0 && dc === 0) continue
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || cc < 0 || rr >= dem.rader || cc >= dem.kolumner) continue
        const j = idx(dem, rr, cc)
        if (klar[j]) continue
        klar[j] = 1
        // Minimal lutning så vattnet fortsätter röra sig genom utfyllda plan.
        if (z[j]! <= z[i]!) z[j] = z[i]! + 1e-4
        heap.push(j, z[j]!)
      }
    }
  }
  return z
}

/**
 * D8-flödesackumulering: hur många celler som rinner genom varje cell.
 * Returnerar antal uppströms celler inklusive sig själv.
 */
export function flodesackumulering(dem: DEM, zFylld: Float32Array): Float32Array {
  const n = dem.rader * dem.kolumner
  const acc = new Float32Array(n).fill(1)
  const mottagare = new Int32Array(n).fill(-1)

  for (let r = 0; r < dem.rader; r++) {
    for (let c = 0; c < dem.kolumner; c++) {
      const i = idx(dem, r, c)
      let bastLut = 0
      let bast = -1
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || cc < 0 || rr >= dem.rader || cc >= dem.kolumner) continue
          const j = idx(dem, rr, cc)
          const avst = Math.hypot(dc * dem.cellX, dr * dem.cellY)
          const lut = (zFylld[i]! - zFylld[j]!) / avst
          if (lut > bastLut) {
            bastLut = lut
            bast = j
          }
        }
      }
      mottagare[i] = bast
    }
  }

  // Bearbeta från högsta till lägsta cell — då är varje cells uppströmsflöde
  // färdigsummerat innan den skickar vidare.
  const ordning = Array.from({ length: n }, (_, i) => i)
  ordning.sort((a, b) => zFylld[b]! - zFylld[a]!)
  for (const i of ordning) {
    const m = mottagare[i]!
    if (m >= 0) acc[m] += acc[i]!
  }
  return acc
}

/**
 * Topographic Wetness Index: ln(uppströmsarea per konturbredd / lutning).
 * Låga värden = torr ås. Höga värden = blöt svacka eller bäckfåra.
 * Kantarellen vill ligga någonstans i mitten — fuktigt men dränerat.
 */
export function beraknaTWI(dem: DEM): Float32Array {
  const zF = fyllSankor(dem)
  const acc = flodesackumulering(dem, zF)
  const n = dem.rader * dem.kolumner
  const twi = new Float32Array(n)
  const cellArea = dem.cellX * dem.cellY
  for (let r = 0; r < dem.rader; r++) {
    for (let c = 0; c < dem.kolumner; c++) {
      const i = idx(dem, r, c)
      const { grader } = lutning(dem, r, c)
      const tanB = Math.max(Math.tan((grader * Math.PI) / 180), 0.0015)
      const a = (acc[i]! * cellArea) / dem.cellM
      twi[i] = Math.log(a / tanB)
    }
  }
  return twi
}

/** Alla härledda terrängmått i ett svep, så vi bara räknar hydrologin en gång. */
export type Terrang = {
  dem: DEM
  twi: Float32Array
  lutningGrader: Float32Array
  vaderstreck: Float32Array
}

export function analyseraTerrang(dem: DEM): Terrang {
  const n = dem.rader * dem.kolumner
  const lutningGrader = new Float32Array(n)
  const vaderstreck = new Float32Array(n).fill(-1)
  for (let r = 0; r < dem.rader; r++) {
    for (let c = 0; c < dem.kolumner; c++) {
      const i = idx(dem, r, c)
      const l = lutning(dem, r, c)
      lutningGrader[i] = l.grader
      vaderstreck[i] = l.vaderstreck ?? -1
    }
  }
  return { dem, twi: beraknaTWI(dem), lutningGrader, vaderstreck }
}
