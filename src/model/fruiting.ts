/**
 * Fruiting model: from weather history to "will there be mushrooms out there?"
 *
 * The core idea is that new fruiting is driven by a moist time window a couple
 * of weeks back: precipitation is weighted with a per-species lag kernel (the
 * chanterelle's centre of mass sits around sixteen days) and combined with soil
 * moisture at mycelium depth. On top of that sits a fast channel — surface
 * moisture at 3–9 cm — which decides how well fruit bodies already developing
 * are doing right now: fresh rain has an immediate but bounded effect, and can
 * never conjure mushrooms out of drought. Soil temperature modulates the rate,
 * and everything shuts off when the season ends or the frost arrives.
 */

import type { Species, WeatherDay } from '../lib/types.ts'

/** Smooth bell curve that is 1 at `opt` and 0 outside [min, max]. */
export function bell(v: number, min: number, opt: number, max: number): number {
  if (!isFinite(v)) return 0
  if (v <= min || v >= max) return 0
  const x = v < opt ? (v - min) / (opt - min) : (max - v) / (max - opt)
  return x * x * (3 - 2 * x)
}

/** Saturating curve: 0 at 0, ~0.63 at `scale`, approaching 1. */
const saturating = (v: number, scale: number) => 1 - Math.exp(-Math.max(0, v) / scale)

/**
 * The lag kernel's weight for rain that fell `age` days before the target date.
 * A skewed bell peaking at the species' `peak`: a wider leading edge so that
 * rain 4–10 days back weighs heavily, a narrower trailing edge so the tail
 * beyond ~25 days decays quickly. The asymmetry is a model constant — we have
 * no per-species evidence for differing skew. The rain chart draws its gold
 * gradient with the same function, so the picture shows exactly what the model
 * computes.
 */
export function kernelWeight(age: number, lag: { peak: number; width: number }): number {
  const sigma = age < lag.peak ? lag.width * 1.15 : lag.width * 0.65
  return Math.exp(-0.5 * ((age - lag.peak) / sigma) ** 2)
}

/** Beyond this age the kernel weight is negligible (< ~1 %). */
export function kernelMaxAge(lag: { peak: number; width: number }): number {
  return Math.ceil(lag.peak + 3 * 0.65 * lag.width)
}

/** Canopy interception: this many mm of each rainy day never reach the ground
    (they stick in the crowns and evaporate). The deduction makes the driver
    event-sensitive — a proper downpour stands almost untouched while a month
    of drizzle nearly vanishes — without requiring per-species parameters. */
const RAIN_INTERCEPTION = 1.0

/** A notional reference soil ("typical Swedish forest ground") that the
    species' absolute moisture thresholds are interpreted against when
    translated into relative extractable water (REW, 0 = wilting point,
    1 = field capacity). It corresponds to no real site — real sites' p2–p98
    spans are narrower than the species' threshold spans, which is precisely
    the miscalibration normalisation fixes, so anchoring to a real site is
    mathematically impossible. The pair is instead calibrated against three
    full mushroom seasons (Jul–Oct 2023–2025) at six sites: the long-run
    median sits neutral against the absolute path (+0.006) while the spread
    between sites is nearly halved (0.174 → 0.096). The lower bound of 0.12
    keeps even the driest-tuned species' min threshold strictly above REW 0. */
const REF_WP = 0.12
const REF_FC = 0.48
const rewThresholds = (m: { min: number; opt: number; max: number }) => ({
  min: (m.min - REF_WP) / (REF_FC - REF_WP),
  opt: (m.opt - REF_WP) / (REF_FC - REF_WP),
  max: (m.max - REF_WP) / (REF_FC - REF_WP),
})

/** The rain driver's saturation scale (weighted mm/day, after interception).
    Lowered from 2.3 — calibrated JOINTLY with RAIN_INTERCEPTION against six
    Swedish sites (31 days each, n=186) so that the index's aggregate median
    sits neutral (+0.003) against the model before the skewed kernel.
    Calibrated separately, the constants chase each other's tails. */
const RAIN_SCALE = 1.8

export type Fruiting = {
  /** Final index 0–1. */
  index: number
  /** Combined water availability — the hardest constraint. Can reach ~1.15
      when a wet surface lifts above the initiation ceiling; the index is
      clamped to 1. */
  water: number
  /** Which factor is holding fruiting back right now. */
  limiter: 'water' | 'temperature' | 'frost' | 'drought' | 'none'
  rainDrive: number
  soilMoisture: number
  /** The surface moisture score 0–1 — the fast channel modulating the present. */
  surfaceMoisture: number
  soilTemp: number
  frostFactor: number
  droughtFactor: number
  /** Precipitation weighted by the species' lag kernel, mm/day, after the
      canopy interception deduction. This is the number that drives. */
  rainInWindow: number
  rain7: number
  rain14: number
  rain30: number
  meanSoilMoisture: number
  /** Raw surface moisture 3–9 cm (m³/m³), mean over the last two days. */
  meanSurfaceMoisture: number
  meanSoilTemp: number
  /** Days since the last day with at least 5 mm. */
  daysSinceRain: number | null
  /** True when moisture was scored in REW space against the site's climatology. */
  normalized: boolean
  /** The deep moisture's ten-day mean in REW (0 = the site's driest, 1 = its
      wettest). Null when the model is running on absolute values. */
  meanDeepRew: number | null
  /** The surface moisture's two-day mean in the same REW space. */
  meanSurfaceRew: number | null
  /** Short explanations in Swedish, shown in the UI. */
  notes: string[]
}

/**
 * Computes the fruiting index for a given date, given a contiguous series of
 * weather days (history + forecast) sorted chronologically.
 */
export function computeFruiting(
  days: WeatherDay[],
  sp: Species,
  targetDate: string,
): Fruiting {
  const targetIdx = days.findIndex((d) => d.date === targetDate)
  const i = targetIdx >= 0 ? targetIdx : days.length - 1
  const upTo = i + 1 // days up to and including the target date

  /* --- 1. Rain drive: precipitation weighted by the species' lag kernel --- */
  let weightedRain = 0
  let weightSum = 0
  const maxAge = kernelMaxAge(sp.rainLag)
  for (let age = 0; age <= maxAge; age++) {
    const j = i - age
    if (j < 0) continue
    const w = kernelWeight(age, sp.rainLag)
    weightSum += w
    weightedRain += Math.max(0, (days[j]!.precipitation || 0) - RAIN_INTERCEPTION) * w
  }
  const rainInWindow = weightSum > 0 ? weightedRain / weightSum : 0
  const rainDrive = saturating(rainInWindow, RAIN_SCALE)

  /* --- 2. Moisture space: REW against the site's climatology when present ---
     With a climatology, relative extractable water is compared against the
     species' thresholds translated into the same space — then "dry" means dry
     for THAT ground, whatever the soil type. Without a climatology, absolute
     m³/m³ is used as before. */
  const normalized = days[i]!.soilMoistureRew !== undefined
  const thr = normalized ? rewThresholds(sp.soilMoisture) : sp.soilMoisture
  const deepOf = (d: WeatherDay) => (normalized ? d.soilMoistureRew! : d.soilMoisture) || 0
  const surfaceOf = (d: WeatherDay) =>
    (normalized
      ? (d.surfaceMoistureRew ?? d.soilMoistureRew!)
      : (d.surfaceMoisture ?? d.soilMoisture)) || 0
  /* The floor's decay scale is 0.03 m³/m³; in REW space, the corresponding
     fraction. */
  const floorScale = normalized ? 0.03 / (REF_FC - REF_WP) : 0.03

  /* --- 2a. Soil moisture at mycelium depth, mean over ten days ---
     The sluggish ten-day mean is deliberate: 9–27 cm is the initiation signal
     and must not jerk at yesterday's cloudburst. On the low side the bell gets
     a soft floor rather than a cliff at zero — exactly at the species' minimum
     the ground is marginal, not impossible — and the floor blends into the
     bell so that rising moisture always shows in the score. That applies only
     to the dry side; waterlogged ground is still zero. */
  const moistureWindow = days.slice(Math.max(0, i - 9), upTo)
  const meanSoilMoisture =
    moistureWindow.reduce((s, d) => s + (d.soilMoisture || 0), 0) / Math.max(1, moistureWindow.length)
  const meanDeep =
    moistureWindow.reduce((s, d) => s + deepOf(d), 0) / Math.max(1, moistureWindow.length)
  const moistureBell = bell(meanDeep, thr.min, thr.opt, thr.max)
  const soilMoisture =
    meanDeep > thr.opt
      ? moistureBell
      : meanDeep >= thr.min
        ? 0.15 + 0.85 * moistureBell
        : 0.15 * Math.exp(-(thr.min - meanDeep) / floorScale)

  /* --- 2b. Surface moisture 3–9 cm, mean over two days — the fast channel ---
     The surface layer responds to rain within hours, so a short window is
     right here. In REW space the surface is measured against its own
     climatology (0–7 cm), which removes the miscentring of borrowing the deep
     layer's thresholds outright. Older saved series lack the fields; the deep
     moisture then stands in. */
  const surfaceWindow = days.slice(Math.max(0, i - 1), upTo)
  const meanSurfaceMoisture =
    surfaceWindow.reduce((s, d) => s + (d.surfaceMoisture ?? d.soilMoisture), 0) /
    Math.max(1, surfaceWindow.length)
  const meanSurface =
    surfaceWindow.reduce((s, d) => s + surfaceOf(d), 0) / Math.max(1, surfaceWindow.length)
  const surfaceMoisture = Math.max(0, Math.min(1, (meanSurface - thr.min) / (thr.opt - thr.min)))

  /* --- 3. Soil temperature at 6 cm, mean over a week --- */
  const tempWindow = days.slice(Math.max(0, i - 6), upTo)
  const meanSoilTemp =
    tempWindow.reduce((s, d) => s + (d.soilTemp || 0), 0) / Math.max(1, tempWindow.length)
  const soilTemp = bell(meanSoilTemp, sp.soilTemp.min, sp.soilTemp.opt, sp.soilTemp.max)

  /* --- 4. Frost: cold-sensitive species stop after the first hard night frost --- */
  let frostFactor = 1
  if (!sp.frostHardy) {
    const last21 = days.slice(Math.max(0, i - 20), upTo)
    const hardFrost = last21.filter((d) => d.tempMin <= -3).length
    const lightFrost = last21.filter((d) => d.tempMin <= -1).length
    if (hardFrost > 0) frostFactor = Math.max(0.05, 0.35 ** hardFrost)
    else if (lightFrost > 1) frostFactor = 0.75
  } else {
    const veryHard = days.slice(Math.max(0, i - 10), upTo).filter((d) => d.tempMin <= -8).length
    if (veryHard > 0) frostFactor = 0.3
  }

  /* --- 5. Drought: after a long dry spell the mycelium needs extra time --- */
  const droughtWindow = days.slice(Math.max(0, i - 34), Math.max(0, i - 14))
  const dryDays = droughtWindow.filter((d) => deepOf(d) < thr.min).length
  const droughtFactor =
    droughtWindow.length === 0
      ? 1
      : Math.max(0.55, 1 - (dryDays / droughtWindow.length) * 0.45)

  /* --- Combining, by the law of the minimum ---
     Water and warmth are both necessary, not interchangeable. A bone-dry
     forest yields no mushrooms however warm the ground is, so the factors are
     multiplied rather than averaged. The exponents make water the hardest
     constraint and let temperature modulate the rate.

     Initiation (lagged rain + deep moisture) sets the level; surface moisture
     modulates around it, centred so that a typical surface is neutral. A wet
     surface lifts by up to 15 % — fresh rain therefore has an immediate effect
     on fruit bodies under development — and a dried-out surface costs 15 %.
     Without initiation there is nothing to lift: a cloudburst on dry ground
     stays near zero. */
  const initiation = 0.45 * rainDrive + 0.55 * soilMoisture
  const water = initiation * (0.85 + 0.3 * surfaceMoisture)
  const index = Math.max(
    0,
    Math.min(1, Math.pow(water, 0.9) * Math.pow(soilTemp, 0.6) * frostFactor * droughtFactor),
  )

  const sumRain = (n: number) =>
    days.slice(Math.max(0, i - n + 1), upTo).reduce((s, d) => s + (d.precipitation || 0), 0)

  let daysSinceRain: number | null = null
  for (let age = 0; age <= 60; age++) {
    const j = i - age
    if (j < 0) break
    if ((days[j]!.precipitation || 0) >= 5) {
      daysSinceRain = age
      break
    }
  }

  const notes: string[] = []
  /* The thresholds are expressed in rainDrive (0–1), not raw mm/day — then the
     text follows automatically when the deduction or saturation scale is
     recalibrated. */
  if (rainDrive > 0.7) notes.push('Rejält med regn i det fönster arten reagerar på')
  else if (rainDrive > 0.4) notes.push('Hyfsat med regn i rätt tidsfönster')
  else if (rainDrive < 0.15) notes.push('För lite regn för två–tre veckor sen')
  else notes.push('Knappt med regn där kärnan väger tungt')

  if (soilMoisture > 0.7) notes.push('Markfukten ligger mitt i artens optimum')
  else if (meanDeep < thr.min) notes.push('Marken är för torr på mycelets djup')
  else if (meanDeep > thr.max) notes.push('Marken är vattensjuk')
  else notes.push('Markfukten är godtagbar men inte optimal')

  if (surfaceMoisture > 0.7 && daysSinceRain !== null && daysSinceRain <= 2)
    notes.push('Färskt regn håller ytan fuktig — bra för fruktkroppar under utveckling')
  else if (surfaceMoisture < 0.35 && initiation > 0.3)
    notes.push('Ytan har torkat upp — färskt regn skulle ge snabb effekt')

  if (soilTemp > 0.7) notes.push(`Marktemperaturen ${meanSoilTemp.toFixed(1)}° är precis rätt`)
  else if (meanSoilTemp < sp.soilTemp.min)
    notes.push(`Marken är för kall (${meanSoilTemp.toFixed(1)}°)`)
  else if (meanSoilTemp > sp.soilTemp.max)
    notes.push(`Marken är för varm (${meanSoilTemp.toFixed(1)}°)`)

  if (frostFactor < 0.5) notes.push('Frosten har tagit säsongen för den här arten')
  if (droughtFactor < 0.8) notes.push('Lång torka innan regnet — mycelet behöver längre tid')

  let limiter: Fruiting['limiter'] = 'none'
  {
    const candidates: [Fruiting['limiter'], number][] = [
      ['water', water],
      ['temperature', soilTemp],
      ['frost', frostFactor],
      ['drought', droughtFactor],
    ]
    candidates.sort((a, b) => a[1] - b[1])
    if (candidates[0]![1] < 0.75) limiter = candidates[0]![0]
  }

  return {
    index,
    water,
    limiter,
    rainDrive,
    soilMoisture,
    surfaceMoisture,
    soilTemp,
    frostFactor,
    droughtFactor,
    rainInWindow,
    rain7: sumRain(7),
    rain14: sumRain(14),
    rain30: sumRain(30),
    meanSoilMoisture,
    meanSurfaceMoisture,
    meanSoilTemp,
    daysSinceRain,
    normalized,
    meanDeepRew: normalized ? meanDeep : null,
    meanSurfaceRew: normalized ? meanSurface : null,
    notes,
  }
}

/**
 * Season curve: a trapezoid over day-of-year, shifted by latitude since the
 * season starts later and ends earlier the further north you are.
 */
export function seasonFactor(sp: Species, date: Date, lat: number): number {
  const dayNumber =
    Math.floor(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        Date.UTC(date.getFullYear(), 0, 1)) /
        864e5,
    ) + 1
  const shift = lat - 59
  const s = sp.season.start + shift * 1.5
  const ps = sp.season.peakStart + shift * 1.5
  const pe = sp.season.peakEnd - shift * 2.5
  const e = sp.season.end - shift * 2.5

  if (dayNumber <= s || dayNumber >= e) return 0
  if (dayNumber >= ps && dayNumber <= pe) return 1
  if (dayNumber < ps) {
    const x = (dayNumber - s) / Math.max(1, ps - s)
    return x * x * (3 - 2 * x)
  }
  const x = (e - dayNumber) / Math.max(1, e - pe)
  return x * x * (3 - 2 * x)
}

export function seasonText(sp: Species, date: Date, lat: number): string {
  const f = seasonFactor(sp, date, lat)
  if (f >= 0.95) return 'högsäsong'
  if (f >= 0.6) return 'i säsong'
  if (f >= 0.25) return 'tidigt respektive sent i säsongen'
  if (f > 0) return 'utanför bästa säsongen'
  return 'inte i säsong'
}

/** A day-by-day forecast, to find the best day to head out. */
export type DayForecast = {
  date: string
  index: number
  season: number
  chance: number
  precipitation: number
  tempMax: number
}

export function forecastAhead(
  days: WeatherDay[],
  sp: Species,
  lat: number,
  fromIndex: number,
  dayCount: number,
): DayForecast[] {
  const out: DayForecast[] = []
  for (let k = 0; k < dayCount; k++) {
    const i = fromIndex + k
    if (i >= days.length) break
    const day = days[i]!
    const f = computeFruiting(days, sp, day.date)
    const s = seasonFactor(sp, new Date(day.date + 'T12:00:00'), lat)
    out.push({
      date: day.date,
      index: f.index,
      season: s,
      chance: f.index * s,
      precipitation: day.precipitation,
      tempMax: day.tempMax,
    })
  }
  return out
}
