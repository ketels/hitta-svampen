/**
 * Verified mushroom records from GBIF — in Sweden mostly Artportalen, that is
 * reports from real mushroom pickers and mycologists.
 *
 * These points are not a treasure map: many are old, rounded off, or reported
 * from a car park near the actual find. But they do say something important —
 * that the species really does occur in this forest. We use them as support
 * for the habitat model, not as ground truth.
 */

import { cacheRead, cacheWrite, cacheReadStale } from '../lib/db.ts'
import { GBIF_KEYS } from './species.ts'
import type { BBox, SpeciesId } from '../lib/types.ts'

const BASE = 'https://api.gbif.org/v1/occurrence/search'

export type Observation = {
  lat: number
  lon: number
  species: SpeciesId
  year: number | null
  month: number | null
  /** Coordinate uncertainty in metres. Often missing. */
  uncertainty: number | null
  place: string | null
}

const KEY_TO_SPECIES = new Map<number, SpeciesId>(
  Object.entries(GBIF_KEYS).map(([k, v]) => [v as number, k as SpeciesId]),
)

export async function fetchObservations(
  box: BBox,
  speciesIds: SpeciesId[],
  signal?: AbortSignal,
): Promise<Observation[]> {
  const keys = speciesIds.map((s) => GBIF_KEYS[s]).filter((n): n is number => !!n)
  if (keys.length === 0) return []

  const cacheKey = `gbif:${box.south.toFixed(3)},${box.west.toFixed(3)},${box.north.toFixed(
    3,
  )},${box.east.toFixed(3)}:${keys.sort().join('_')}`
  const cached = await cacheRead<Observation[]>(cacheKey)
  if (cached) return cached

  const p = new URLSearchParams()
  for (const n of keys) p.append('taxonKey', String(n))
  p.set('decimalLatitude', `${box.south.toFixed(5)},${box.north.toFixed(5)}`)
  p.set('decimalLongitude', `${box.west.toFixed(5)},${box.east.toFixed(5)}`)
  p.set('hasCoordinate', 'true')
  p.set('hasGeospatialIssue', 'false')
  p.set('limit', '300')

  try {
    const out: Observation[] = []
    // At most three pages — 900 records is plenty to shape a surface.
    for (let page = 0; page < 3; page++) {
      p.set('offset', String(page * 300))
      const res = await fetch(`${BASE}?${p}`, { signal })
      if (!res.ok) throw new Error(`GBIF svarade ${res.status}`)
      const j = (await res.json()) as {
        endOfRecords: boolean
        results: {
          decimalLatitude: number
          decimalLongitude: number
          taxonKey?: number
          acceptedTaxonKey?: number
          speciesKey?: number
          year?: number
          month?: number
          coordinateUncertaintyInMeters?: number
          locality?: string
        }[]
      }
      for (const r of j.results) {
        const id =
          KEY_TO_SPECIES.get(r.speciesKey ?? -1) ??
          KEY_TO_SPECIES.get(r.acceptedTaxonKey ?? -1) ??
          KEY_TO_SPECIES.get(r.taxonKey ?? -1)
        if (!id) continue
        out.push({
          lat: r.decimalLatitude,
          lon: r.decimalLongitude,
          species: id,
          year: r.year ?? null,
          month: r.month ?? null,
          uncertainty: r.coordinateUncertaintyInMeters ?? null,
          place: r.locality ?? null,
        })
      }
      if (j.endOfRecords || j.results.length < 300) break
    }
    // GBIF rarely updates old records. A month is reasonable.
    await cacheWrite(cacheKey, out, 30 * 24 * 3600e3)
    return out
  } catch (e) {
    const stale = await cacheReadStale<Observation[]>(cacheKey)
    if (stale) return stale
    throw e
  }
}

/**
 * How well do known finds support this point?
 *
 * Each observation contributes a bell whose width is set by its own coordinate
 * uncertainty — a record given to within 25 metres says a lot about that
 * particular hillside, one given to within 5 kilometres only says the species
 * occurs in the area. Old records weigh slightly less, but mycelium lives for
 * decades so we do not forget them.
 */
export function observationSupport(
  obs: Observation[],
  lat: number,
  lon: number,
  metersPerLat: number,
  metersPerLon: number,
): number {
  let sum = 0
  const thisYear = new Date().getFullYear()
  for (const o of obs) {
    const sigma = Math.min(1200, Math.max(120, o.uncertainty ?? 350))
    const reach = sigma * 2.5
    const dy = (o.lat - lat) * metersPerLat
    if (dy > reach || dy < -reach) continue
    const dx = (o.lon - lon) * metersPerLon
    if (dx > reach || dx < -reach) continue
    const d = Math.hypot(dx, dy)
    if (d > reach) continue
    const nearness = Math.exp(-0.5 * (d / sigma) ** 2)
    // A record with 5 km of uncertainty must not weigh as much as one with 25 m.
    const precision = Math.min(1, 300 / sigma)
    const age = o.year ? Math.max(0, thisYear - o.year) : 25
    const freshness = 0.55 + 0.45 * Math.exp(-age / 30)
    sum += nearness * precision * freshness
  }
  // Saturating: ten good records are not ten times better than one.
  return 1 - Math.exp(-sum / 1.6)
}
