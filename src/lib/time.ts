/** Time, daylight and the age of data. */

import type { WeatherDay } from './types.ts'

export function clockTime(iso: string): string {
  // Open-Meteo delivers local time without a zone suffix.
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '–'
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** "2 h 15 min" or "40 min". */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

export type Daylight = {
  sunrise: Date | null
  sunset: Date | null
  /** Milliseconds left until sunset, negative once the sun has gone down. */
  msLeft: number | null
  /** A ready-made sentence to display. */
  text: string | null
  /**
   * The same thing on a line shared with other content — the map legend. The
   * clock time is enough while there is plenty of day left; in the final hour
   * it is the remaining time that matters, and then that is shown instead.
   */
  short: string | null
}

/**
 * How much daylight remains. Knowing there are forty minutes left until dusk
 * is the difference between a pleasant walk and looking for the car by the
 * light of your phone.
 */
export function daylight(day: WeatherDay | undefined, now = new Date()): Daylight {
  const empty = { sunrise: null, sunset: null, msLeft: null, text: null, short: null }
  if (!day?.sunset) return empty
  const sunset = new Date(day.sunset)
  const sunrise = day.sunrise ? new Date(day.sunrise) : null
  if (isNaN(sunset.getTime())) return empty

  const msLeft = sunset.getTime() - now.getTime()
  let text: string
  let short: string
  if (msLeft > 0) {
    text = `${duration(msLeft)} till skymning (${clockTime(day.sunset)})`
    short =
      msLeft <= 3600e3
        ? `${duration(msLeft)} till skymning`
        : `Ljust till ${clockTime(day.sunset)}`
  } else if (sunrise && now < sunrise) {
    text = `Soluppgång ${clockTime(day.sunrise!)}`
    short = text
  } else {
    text = `Solen gick ned ${clockTime(day.sunset)}`
    short = `Mörkt sedan ${clockTime(day.sunset)}`
  }
  return { sunrise, sunset, msLeft, text, short }
}

/** "för 3 timmar sedan", to show how fresh a scan is. */
export function timeAgo(time: number, now = Date.now()): string {
  const min = Math.round((now - time) / 60000)
  if (min < 2) return 'nyss'
  if (min < 60) return `för ${min} min sedan`
  const h = Math.round(min / 60)
  if (h < 24) return `för ${h} ${h === 1 ? 'timme' : 'timmar'} sedan`
  const d = Math.round(h / 24)
  return `för ${d} dygn sedan`
}
