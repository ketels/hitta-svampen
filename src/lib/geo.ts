/** Geometry, distances and terrain maths. Everything in WGS84 unless stated. */

import type { BBox, LatLng } from './types.ts'

export const EARTH_RADIUS = 6371008.8

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Distance in metres between two points (haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat)
  const la2 = rad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Bearing in degrees from north, a → b. */
export function bearing(a: LatLng, b: LatLng): number {
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat)
  const la2 = rad(b.lat)
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Point `m` metres away in the direction `bearingDeg` degrees. */
export function move(p: LatLng, m: number, bearingDeg: number): LatLng {
  const d = m / EARTH_RADIUS
  const br = rad(bearingDeg)
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

/** Metres per degree of longitude at the given latitude. */
export function metresPerDegreeLon(lat: number): number {
  return (Math.PI / 180) * EARTH_RADIUS * Math.cos(rad(lat))
}

export function metresPerDegreeLat(): number {
  return (Math.PI / 180) * EARTH_RADIUS
}

/** Square bounding box around a point with the given radius in metres. */
export function bboxAround(c: LatLng, radiusM: number): BBox {
  const dLat = radiusM / metresPerDegreeLat()
  const dLon = radiusM / metresPerDegreeLon(c.lat)
  return {
    south: c.lat - dLat,
    north: c.lat + dLat,
    west: c.lon - dLon,
    east: c.lon + dLon,
  }
}

/* ---------- Point in polygon ---------- */

/**
 * Ray casting — is the point inside the ring?
 *
 * Takes lat and lon separately rather than an object. Called once per grid
 * cell and polygon during a scan, so millions of times, and then one saved
 * object allocation per call is worth the uglier signature.
 */
export function inPolygon(lat: number, lon: number, ring: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.lon
    const yi = ring[i]!.lat
    const xj = ring[j]!.lon
    const yj = ring[j]!.lat
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Quick bounding box for a ring, to avoid expensive polygon tests. */
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

/* ---------- Formatting ---------- */

/** Degrees/minutes — the format most map apps and outdoor folk use. */
export function formatCoord(lat: number, lon: number): string {
  const part = (v: number, pos: string, neg: string) => {
    const h = v >= 0 ? pos : neg
    const a = Math.abs(v)
    const g = Math.floor(a)
    const m = (a - g) * 60
    return `${g}°${m.toFixed(3)}'${h}`
  }
  return `${part(lat, 'N', 'S')} ${part(lon, 'E', 'W')}`
}

export function formatDistance(m: number): string {
  if (!isFinite(m)) return '–'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

/** Compass points in Swedish (O = öster/east, V = väster/west). */
const COMPASS = [
  'N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO',
  'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV',
]

export function compass(degrees: number): string {
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]!
}

/** Swedish pluralisation: `plural(1, 'ruta', 'rutor')` → "1 ruta". */
export function plural(n: number, singular: string, many: string): string {
  return `${n.toLocaleString('sv-SE')} ${n === 1 ? singular : many}`
}
