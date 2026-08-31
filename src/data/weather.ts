/**
 * Weather data from Open-Meteo (ERA5 + ICON/ECMWF).
 * Free, no key, with CORS. One call gives 60 days back and 16 forward,
 * including soil moisture at 9–27 cm — exactly the depth the mycelium lives
 * at — and 3–9 cm, the surface layer where developing fruit bodies feel fresh
 * rain.
 *
 * Elevation is not fetched here but as terrain tiles, see `elevationTiles.ts`.
 */

import { cacheRead, cacheWrite, cacheReadStale } from '../lib/db.ts'
import { fetchClimatology, toRew } from './climatology.ts'
import type { WeatherDay } from '../lib/types.ts'

const BASE = 'https://api.open-meteo.com/v1'

export const DAYS_BACK = 60
export const DAYS_FORWARD = 16

export type WeatherSeries = {
  days: WeatherDay[]
  /** Index in `days` for today's date. */
  today: number
  lat: number
  lon: number
  elevation: number
  /** True if the data came from cache without fresh network contact. */
  stale: boolean
}

/** The weather grid is coarse — round off so we reuse the cache across an area. */
const weatherKey = (lat: number, lon: number) =>
  `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`

function dailyMean(
  times: string[],
  values: (number | null)[],
  days: string[],
): Map<string, number> {
  const sums = new Map<string, [number, number]>()
  for (let i = 0; i < times.length; i++) {
    const v = values[i]
    if (v === null || v === undefined) continue
    const day = times[i]!.slice(0, 10)
    const cur = sums.get(day) ?? [0, 0]
    cur[0] += v
    cur[1] += 1
    sums.set(day, cur)
  }
  const out = new Map<string, number>()
  for (const d of days) {
    const s = sums.get(d)
    out.set(d, s && s[1] > 0 ? s[0] / s[1] : NaN)
  }
  return out
}

/** Fills gaps by linear interpolation so the model never sees a NaN. */
function fillGaps(values: number[]): number[] {
  const out = [...values]
  const n = out.length
  const first = out.findIndex((v) => isFinite(v))
  if (first < 0) return out.map(() => 0)
  for (let i = 0; i < first; i++) out[i] = out[first]!
  let last = n - 1
  while (last >= 0 && !isFinite(out[last]!)) last--
  for (let i = last + 1; i < n; i++) out[i] = out[last]!
  for (let i = first; i <= last; i++) {
    if (isFinite(out[i]!)) continue
    let j = i
    while (j <= last && !isFinite(out[j]!)) j++
    const a = out[i - 1]!
    const b = out[j]!
    for (let k = i; k < j; k++) out[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1)
    i = j
  }
  return out
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherSeries> {
  const key = weatherKey(lat, lon)
  const cached = await cacheRead<WeatherSeries>(key)
  if (cached) return cached

  /* The climatology is fetched in parallel with the weather. Without it the
     model works in absolute moisture values, just as before normalisation. */
  const climatePromise = fetchClimatology(lat, lon).catch(() => null)

  const url =
    `${BASE}/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&hourly=soil_moisture_9_to_27cm,soil_moisture_3_to_9cm,soil_temperature_6cm` +
    `&past_days=${DAYS_BACK}&forecast_days=${DAYS_FORWARD}&timezone=auto`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Open-Meteo svarade ${res.status}`)
    const j = (await res.json()) as {
      elevation: number
      latitude: number
      longitude: number
      daily: {
        time: string[]
        precipitation_sum: (number | null)[]
        temperature_2m_max: (number | null)[]
        temperature_2m_min: (number | null)[]
        sunrise: (string | null)[]
        sunset: (string | null)[]
      }
      hourly: {
        time: string[]
        soil_moisture_9_to_27cm: (number | null)[]
        soil_moisture_3_to_9cm: (number | null)[]
        soil_temperature_6cm: (number | null)[]
      }
    }

    const dates = j.daily.time
    const deep = dailyMean(j.hourly.time, j.hourly.soil_moisture_9_to_27cm, dates)
    const surface = dailyMean(j.hourly.time, j.hourly.soil_moisture_3_to_9cm, dates)
    const temp = dailyMean(j.hourly.time, j.hourly.soil_temperature_6cm, dates)
    const deepFilled = fillGaps(dates.map((d) => deep.get(d) ?? NaN))
    const surfaceFilled = fillGaps(dates.map((d) => surface.get(d) ?? NaN))
    const tempFilled = fillGaps(dates.map((d) => temp.get(d) ?? NaN))

    const days: WeatherDay[] = dates.map((d, i) => ({
      date: d,
      precipitation: j.daily.precipitation_sum[i] ?? 0,
      tempMax: j.daily.temperature_2m_max[i] ?? 0,
      tempMin: j.daily.temperature_2m_min[i] ?? 0,
      soilMoisture: deepFilled[i]!,
      surfaceMoisture: surfaceFilled[i]!,
      soilTemp: tempFilled[i]!,
      sunrise: j.daily.sunrise[i] ?? null,
      sunset: j.daily.sunset[i] ?? null,
    }))

    /* The REW fields are set all or nothing: the model's initiation and its
       modulator must work in the same space, so a partly filled series would
       be worse than none. The guard is isFinite, not nullish — 0 is a valid
       REW. */
    const climate = await climatePromise
    if (climate) {
      const deepRew = days.map((d) => toRew(d.soilMoisture, climate.deep))
      const surfaceRew = days.map((d) =>
        toRew(d.surfaceMoisture ?? d.soilMoisture, climate.surface),
      )
      if (deepRew.every(isFinite) && surfaceRew.every(isFinite)) {
        days.forEach((d, k) => {
          d.soilMoistureRew = deepRew[k]!
          d.surfaceMoistureRew = surfaceRew[k]!
        })
      }
    }

    const todayStr = currentDate()
    let today = days.findIndex((d) => d.date === todayStr)
    if (today < 0) today = Math.min(DAYS_BACK, days.length - 1)

    const result: WeatherSeries = {
      days,
      today,
      lat: j.latitude,
      lon: j.longitude,
      elevation: j.elevation,
      stale: false,
    }
    // Three hours is enough — the forecast is not updated more often than that.
    await cacheWrite(key, result, 3 * 3600e3)
    return result
  } catch (e) {
    const stale = await cacheReadStale<WeatherSeries>(key)
    if (stale) return { ...stale, stale: true }
    throw e
  }
}

/** Today's date in local time as YYYY-MM-DD. */
export function currentDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}
