/** Geometri, avstånd och terrängmatte. Allt i WGS84 om inget annat sägs. */

import type { BBox, LatLng } from './types.ts'

export const JORDRADIE = 6371008.8

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Avstånd i meter mellan två punkter (haversine). */
export function avstand(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat)
  const la2 = rad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * JORDRADIE * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Bäring i grader från norr, a → b. */
export function baring(a: LatLng, b: LatLng): number {
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat)
  const la2 = rad(b.lat)
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Punkt på `m` meters avstånd i riktning `bearing` grader. */
export function flytta(p: LatLng, m: number, bearing: number): LatLng {
  const d = m / JORDRADIE
  const br = rad(bearing)
  const la1 = rad(p.lat)
  const lo1 = rad(p.lon)
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br),
  )
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2),
    )
  return { lat: deg(la2), lon: ((deg(lo2) + 540) % 360) - 180 }
}

/** Meter per grad longitud på given latitud. */
export function meterPerGradLon(lat: number): number {
  return (Math.PI / 180) * JORDRADIE * Math.cos(rad(lat))
}

export function meterPerGradLat(): number {
  return (Math.PI / 180) * JORDRADIE
}

/** Kvadratisk bbox runt en punkt med given radie i meter. */
export function bboxRunt(c: LatLng, radieM: number): BBox {
  const dLat = radieM / meterPerGradLat()
  const dLon = radieM / meterPerGradLon(c.lat)
  return {
    south: c.lat - dLat,
    north: c.lat + dLat,
    west: c.lon - dLon,
    east: c.lon + dLon,
  }
}

/* ---------- Punkt mot polygon ---------- */

/**
 * Ray casting — ligger punkten inuti ringen?
 *
 * Tar lat och lon var för sig i stället för ett objekt. Anropas en gång per
 * rutnätscell och polygon under en skanning, alltså miljontals gånger, och då
 * är en sparad objektallokering per anrop värd den fulare signaturen.
 */
export function iPolygon(lat: number, lon: number, ring: LatLng[]): boolean {
  let inne = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.lon
    const yi = ring[i]!.lat
    const xj = ring[j]!.lon
    const yj = ring[j]!.lat
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inne = !inne
    }
  }
  return inne
}

/** Snabb bbox för en ring, för att slippa dyra polygontester. */
export function ringBBox(ring: LatLng[]): BBox {
  let s = Infinity,
    n = -Infinity,
    w = Infinity,
    e = -Infinity
  for (const p of ring) {
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon
    if (p.lon > e) e = p.lon
  }
  return { south: s, north: n, west: w, east: e }
}

/* ---------- Formatering ---------- */

/** Grader/minuter — formatet de flesta kartappar och friluftsfolk använder. */
export function formateraKoord(lat: number, lon: number): string {
  const del = (v: number, pos: string, neg: string) => {
    const h = v >= 0 ? pos : neg
    const a = Math.abs(v)
    const g = Math.floor(a)
    const m = (a - g) * 60
    return `${g}°${m.toFixed(3)}'${h}`
  }
  return `${del(lat, 'N', 'S')} ${del(lon, 'E', 'W')}`
}

export function formateraAvstand(m: number): string {
  if (!isFinite(m)) return '–'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

const KOMPASS = [
  'N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO',
  'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV',
]

export function kompass(grader: number): string {
  return KOMPASS[Math.round((((grader % 360) + 360) % 360) / 22.5) % 16]!
}

/** Svensk pluralisering: `antal(1, 'ruta', 'rutor')` → "1 ruta". */
export function antal(n: number, ental: string, flertal: string): string {
  return `${n.toLocaleString('sv-SE')} ${n === 1 ? ental : flertal}`
}
