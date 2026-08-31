/**
 * Personalisation — the app learns your forest.
 *
 * The model's starting values are taken from the literature and apply to
 * Sweden at large. But your patch of woods is not Sweden at large. If your
 * chanterelles stand in wetter ground than the textbook says, the model should
 * follow them there. We therefore shift the species' optimum towards your own
 * finds with shrinkage: after ten finds your experience weighs roughly as much
 * as the starting value, and less before that. A single find must not upend
 * the whole model.
 */

import type { Find, LandType, Species, SpeciesId } from '../lib/types.ts'

/** After this many finds your data weighs as much as the starting value. */
const SHRINKAGE = 10

export type Learning = {
  count: number
  /** How much weight your own data has been given, 0–1. */
  strength: number
  /** Short remarks in Swedish, shown in the UI. */
  remarks: string[]
}

export type AdaptedSpecies = { species: Species; learning: Learning }

const FOREST_TYPES: LandType[] = ['coniferous', 'deciduous', 'mixed', 'forest', 'unknown']

export function adaptSpecies(base: Species, allFinds: Find[]): AdaptedSpecies {
  const finds = allFinds.filter(
    (f) => f.species === base.id && f.habitat && FOREST_TYPES.includes(f.habitat.landType),
  )
  const n = finds.length
  const remarks: string[] = []
  if (n === 0) return { species: base, learning: { count: 0, strength: 0, remarks: [] } }

  const strength = n / (n + SHRINKAGE)
  const sp: Species = {
    ...base,
    leafType: { ...base.leafType },
    soilMoisture: { ...base.soilMoisture },
  }

  const blend = (prior: number, observed: number) => prior + (observed - prior) * strength

  /* --- Soil moisture: move the optimum towards where you actually find them --- */
  const twis = finds.map((f) => f.habitat!.twi).filter(isFinite)
  if (twis.length >= 2) {
    const mean = twis.reduce((a, b) => a + b, 0) / twis.length
    const spread = Math.sqrt(
      twis.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, twis.length - 1),
    )
    sp.twiOpt = blend(base.twiOpt, mean)
    // If your finds are spread out widely the species is less fussy than we
    // thought.
    if (isFinite(spread) && spread > 0.4) {
      sp.twiWidth = blend(base.twiWidth, Math.max(1.2, Math.min(5, spread * 1.3)))
    }
    const shift = sp.twiOpt - base.twiOpt
    if (Math.abs(shift) > 0.6) {
      remarks.push(
        shift > 0
          ? `Dina ${base.name.toLowerCase()}er står blötare än normalt — modellen har följt med dit`
          : `Dina ${base.name.toLowerCase()}er står torrare än normalt — modellen har följt med dit`,
      )
    }
  }

  /* --- Forest type: which kind of forest do you actually find them in? --- */
  const counts: Record<string, number> = {}
  for (const f of finds) counts[f.habitat!.landType] = (counts[f.habitat!.landType] ?? 0) + 1
  const clear = (counts['coniferous'] ?? 0) + (counts['deciduous'] ?? 0) + (counts['mixed'] ?? 0)
  if (clear >= 3) {
    const share = (m: LandType) => (counts[m] ?? 0) / clear
    // Normalise against the most common one so we keep the 0–1 scale.
    const obs = {
      needleleaved: share('coniferous'),
      broadleaved: share('deciduous'),
      mixed: share('mixed'),
    }
    const max = Math.max(obs.needleleaved, obs.broadleaved, obs.mixed, 1e-6)
    // Keep a floor so a forest type you have not yet searched is not zeroed out.
    sp.leafType = {
      needleleaved: Math.max(0.25, blend(base.leafType.needleleaved, obs.needleleaved / max)),
      broadleaved: Math.max(0.25, blend(base.leafType.broadleaved, obs.broadleaved / max)),
      mixed: Math.max(0.25, blend(base.leafType.mixed, obs.mixed / max)),
    }
    const commonest = (['coniferous', 'deciduous', 'mixed'] as const).reduce((a, b) =>
      (counts[a] ?? 0) >= (counts[b] ?? 0) ? a : b,
    )
    remarks.push(
      `Flest av dina fynd står i ${
        { coniferous: 'barrskog', deciduous: 'lövskog', mixed: 'blandskog' }[commonest]
      }`,
    )
  }

  /* --- Season: when in the year do you find them? --- */
  const dayNumbers = finds.map((f) => {
    const d = new Date(f.time)
    return (
      Math.floor(
        (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) /
          864e5,
      ) + 1
    )
  })
  if (dayNumbers.length >= 4) {
    const earliest = Math.min(...dayNumbers)
    const latest = Math.max(...dayNumbers)
    if (earliest < base.season.start) {
      sp.season = { ...sp.season, start: Math.round(blend(base.season.start, earliest - 7)) }
      remarks.push('Du har hittat arten tidigare på året än normalt')
    }
    if (latest > base.season.end) {
      sp.season = { ...sp.season, end: Math.round(blend(base.season.end, latest + 7)) }
      remarks.push('Du har hittat arten senare på året än normalt')
    }
  }

  if (n < 3) remarks.push(`Bara ${n} fynd än — spara fler så blir modellen vassare`)

  return { species: sp, learning: { count: n, strength, remarks } }
}

/** A summary of what the app has learned, for the settings view. */
export function learningOverview(
  speciesList: Species[],
  finds: Find[],
): { id: SpeciesId; name: string; count: number; strength: number; remarks: string[] }[] {
  return speciesList
    .map((s) => {
      const { learning } = adaptSpecies(s, finds)
      return { id: s.id, name: s.name, ...learning }
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
}
