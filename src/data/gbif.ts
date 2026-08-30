/**
 * Verifierade svampfynd från GBIF — i Sverige mestadels Artportalen, alltså
 * rapporter från riktiga svampplockare och mykologer.
 *
 * De här punkterna är inte en skattkarta: många är gamla, avrundade eller
 * rapporterade från en parkering i närheten av fyndet. Men de säger något
 * viktigt ändå — att arten faktiskt förekommer i den här skogen. Vi använder
 * dem som stöd för habitatmodellen, inte som facit.
 */

import { cacheLas, cacheSkriv, cacheLasGammal } from '../lib/db.ts'
import { GBIF_NYCKLAR } from './arter.ts'
import type { BBox, SpeciesId } from '../lib/types.ts'

const BAS = 'https://api.gbif.org/v1/occurrence/search'

export type Observation = {
  lat: number
  lon: number
  art: SpeciesId
  ar: number | null
  manad: number | null
  /** Koordinatosäkerhet i meter. Saknas ofta. */
  osakerhet: number | null
  plats: string | null
}

const NYCKEL_TILL_ART = new Map<number, SpeciesId>(
  Object.entries(GBIF_NYCKLAR).map(([k, v]) => [v as number, k as SpeciesId]),
)

export async function hamtaObservationer(
  box: BBox,
  arter: SpeciesId[],
  signal?: AbortSignal,
): Promise<Observation[]> {
  const nycklar = arter.map((a) => GBIF_NYCKLAR[a]).filter((n): n is number => !!n)
  if (nycklar.length === 0) return []

  const nyckel = `gbif:${box.south.toFixed(3)},${box.west.toFixed(3)},${box.north.toFixed(
    3,
  )},${box.east.toFixed(3)}:${nycklar.sort().join('_')}`
  const cachad = await cacheLas<Observation[]>(nyckel)
  if (cachad) return cachad

  const p = new URLSearchParams()
  for (const n of nycklar) p.append('taxonKey', String(n))
  p.set('decimalLatitude', `${box.south.toFixed(5)},${box.north.toFixed(5)}`)
  p.set('decimalLongitude', `${box.west.toFixed(5)},${box.east.toFixed(5)}`)
  p.set('hasCoordinate', 'true')
  p.set('hasGeospatialIssue', 'false')
  p.set('limit', '300')

  try {
    const ut: Observation[] = []
    // Max tre sidor — 900 fynd är gott och väl nog för att forma en yta.
    for (let sida = 0; sida < 3; sida++) {
      p.set('offset', String(sida * 300))
      const svar = await fetch(`${BAS}?${p}`, { signal })
      if (!svar.ok) throw new Error(`GBIF svarade ${svar.status}`)
      const j = (await svar.json()) as {
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
        const art =
          NYCKEL_TILL_ART.get(r.speciesKey ?? -1) ??
          NYCKEL_TILL_ART.get(r.acceptedTaxonKey ?? -1) ??
          NYCKEL_TILL_ART.get(r.taxonKey ?? -1)
        if (!art) continue
        ut.push({
          lat: r.decimalLatitude,
          lon: r.decimalLongitude,
          art,
          ar: r.year ?? null,
          manad: r.month ?? null,
          osakerhet: r.coordinateUncertaintyInMeters ?? null,
          plats: r.locality ?? null,
        })
      }
      if (j.endOfRecords || j.results.length < 300) break
    }
    // GBIF uppdateras sällan för gamla fynd. En månad är rimligt.
    await cacheSkriv(nyckel, ut, 30 * 24 * 3600e3)
    return ut
  } catch (e) {
    const gammal = await cacheLasGammal<Observation[]>(nyckel)
    if (gammal) return gammal
    throw e
  }
}

/**
 * Hur väl stöttar kända fynd den här punkten?
 *
 * Varje observation bidrar med en klocka vars bredd sätts av dess egen
 * koordinatosäkerhet — ett fynd angivet på 25 meter när säger mycket om just
 * den kullen, ett angivet på 5 kilometer säger bara att arten finns i trakten.
 * Gamla fynd väger lite mindre, men mycel lever i decennier så vi glömmer
 * dem inte.
 */
export function observationsstod(
  obs: Observation[],
  lat: number,
  lon: number,
  metersPerLat: number,
  metersPerLon: number,
): number {
  let summa = 0
  const iAr = new Date().getFullYear()
  for (const o of obs) {
    const sigma = Math.min(1200, Math.max(120, o.osakerhet ?? 350))
    const rackvidd = sigma * 2.5
    const dy = (o.lat - lat) * metersPerLat
    if (dy > rackvidd || dy < -rackvidd) continue
    const dx = (o.lon - lon) * metersPerLon
    if (dx > rackvidd || dx < -rackvidd) continue
    const d = Math.hypot(dx, dy)
    if (d > rackvidd) continue
    const narhet = Math.exp(-0.5 * (d / sigma) ** 2)
    // Ett fynd på 5 km osäkerhet ska inte väga lika tungt som ett på 25 m.
    const precision = Math.min(1, 300 / sigma)
    const alder = o.ar ? Math.max(0, iAr - o.ar) : 25
    const farskhet = 0.55 + 0.45 * Math.exp(-alder / 30)
    summa += narhet * precision * farskhet
  }
  // Mättande: tio bra fynd är inte tio gånger bättre än ett.
  return 1 - Math.exp(-summa / 1.6)
}
