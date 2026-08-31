/**
 * Fills in habitat and weather data for a saved find after the fact.
 *
 * The point is never to leave anyone standing in the rain waiting for the
 * network. The find is saved immediately with a coordinate and a time; terrain
 * and weather are filled in when possible, and if a scan already covers the
 * spot it happens instantly.
 */

import { saveFind } from '../lib/db.ts'
import type { Find } from '../lib/types.ts'
import { assessPoint, assessFromScan, type Scan } from './scan.ts'

export async function enrichFind(
  find: Find,
  all: Find[],
  scan: Scan | null,
): Promise<Find | null> {
  try {
    const assessment =
      (scan && scan.species === find.species
        ? assessFromScan(scan, { lat: find.lat, lon: find.lon }, all)
        : null) ?? (await assessPoint({ lat: find.lat, lon: find.lon }, find.species, all))

    const enriched: Find = {
      ...find,
      habitat: { ...assessment.sample, lat: find.lat, lon: find.lon },
      weather: {
        rain7: assessment.fruiting.rain7,
        rain14: assessment.fruiting.rain14,
        rain30: assessment.fruiting.rain30,
        soilMoisture: assessment.fruiting.meanSoilMoisture,
        soilTemp: assessment.fruiting.meanSoilTemp,
        index: assessment.fruiting.index,
      },
    }
    await saveFind(enriched)
    return enriched
  } catch {
    // A find without habitat data is still a find. We try again the next time
    // the user opens it.
    return null
  }
}

/** How many finds we fill in per run. The services are free. */
const MAX_PER_RUN = 8
const PAUSE_MS = 2500

/**
 * Fills in, after the fact, the finds that lack habitat data — saved offline,
 * imported from another phone, or from a time when the network misbehaved.
 * Runs calmly in the background, one find at a time, and gives up quietly when
 * there is no connection.
 */
export async function enrichStragglers(
  all: Find[],
  scan: Scan | null,
  signal: AbortSignal,
  onDone: () => void,
): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  const pending = all.filter((f) => !f.habitat).slice(0, MAX_PER_RUN)
  if (pending.length === 0) return 0

  let succeeded = 0
  for (const f of pending) {
    if (signal.aborted) break
    const enriched = await enrichFind(f, all, scan)
    if (enriched) succeeded++
    else break // The net is down or the service is tired — try again next time.
    await new Promise((r) => setTimeout(r, PAUSE_MS))
  }
  if (succeeded > 0 && !signal.aborted) onDone()
  return succeeded
}
