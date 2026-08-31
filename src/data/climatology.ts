/**
 * Soil moisture climatology from Open-Meteo's ERA5 archive: 15 years of daily
 * soil moisture for the location, boiled down to wilting-point and
 * field-capacity proxies (p2 and p98 respectively over May–October).
 *
 * The point: absolute m³/m³ thresholds are soil-type dependent — a sandy pine
 * heath never reaches the same moisture levels as a clayey spruce forest, no
 * matter how good the mushroom ground is. With the site's own climatology the
 * model can work in relative extractable water (REW) instead: 0 = the site's
 * driest state, 1 = its wettest.
 *
 * May–October, not the full year: ERA5 reports liquid soil water, which drops
 * when the ground freezes — a full-year percentile in the north would measure
 * winter rather than the driest summer state.
 */

import { cacheRead, cacheWrite, cacheReadStale } from '../lib/db.ts'

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'
const YEARS_BACK = 15

export type Climatology = {
  /** Wilting-point and field-capacity proxy for the mycelium depth (7–28 cm). */
  deep: { wp: number; fc: number }
  /** The same for the surface layer (0–7 cm). */
  surface: { wp: number; fc: number }
}

/** Relative extractable water: 0 at the site's driest (p2), 1 at its wettest
    (p98). No lower clamp — extreme drought below p2 gives a negative REW so
    that the bell floor's exponential tail keeps decaying instead of flattening
    out. */
export function toRew(value: number, layer: { wp: number; fc: number }): number {
  const span = layer.fc - layer.wp
  if (!(span > 0.02)) return NaN // degenerate climatology — let the caller fall back
  return Math.min(1.05, (value - layer.wp) / span)
}

const climateKey = (lat: number, lon: number) =>
  `climatology:${lat.toFixed(2)}:${lon.toFixed(2)}`

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
}

/**
 * Fetches (or reads from cache) the site's climatology. Returns null when the
 * archive cannot be reached and nothing is cached — the model then works in
 * absolute values, exactly as it did before normalisation.
 */
export async function fetchClimatology(lat: number, lon: number): Promise<Climatology | null> {
  const key = climateKey(lat, lon)
  const cached = await cacheRead<Climatology>(key)
  if (cached) return cached

  const end = new Date(Date.now() - 3 * 864e5)
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - YEARS_BACK)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const url =
    `${ARCHIVE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&start_date=${iso(start)}&end_date=${iso(end)}` +
    `&daily=soil_moisture_7_to_28cm_mean,soil_moisture_0_to_7cm_mean&timezone=auto`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`arkivet svarade ${res.status}`)
    const j = (await res.json()) as {
      daily: {
        time: string[]
        soil_moisture_7_to_28cm_mean: (number | null)[]
        soil_moisture_0_to_7cm_mean: (number | null)[]
      }
    }
    const deep: number[] = []
    const surface: number[] = []
    for (let i = 0; i < j.daily.time.length; i++) {
      const month = Number(j.daily.time[i]!.slice(5, 7))
      if (month < 5 || month > 10) continue
      const d = j.daily.soil_moisture_7_to_28cm_mean[i]
      const s = j.daily.soil_moisture_0_to_7cm_mean[i]
      if (d != null && isFinite(d)) deep.push(d)
      if (s != null && isFinite(s)) surface.push(s)
    }
    // ~2700 season days over 15 years; under 500 the archive is broken here.
    if (deep.length < 500 || surface.length < 500) throw new Error('för tunn klimatologi')
    deep.sort((a, b) => a - b)
    surface.sort((a, b) => a - b)
    const result: Climatology = {
      deep: { wp: percentile(deep, 2), fc: percentile(deep, 98) },
      surface: { wp: percentile(surface, 2), fc: percentile(surface, 98) },
    }
    // A climatology does not change in a month.
    await cacheWrite(key, result, 30 * 864e5)
    return result
  } catch {
    return cacheReadStale<Climatology>(key)
  }
}
