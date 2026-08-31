/**
 * Markfuktsklimatologi från Open-Meteos ERA5-arkiv: 15 år av dagliga
 * markfuktsvärden för platsen, kokta till vissningsgräns- och
 * fältkapacitetsproxies (p2 respektive p98 över maj–oktober).
 *
 * Poängen: absoluta m³/m³-trösklar är jordartsberoende — en sandig tallmo
 * når aldrig samma fuktnivåer som en lerig granskog, hur bra svampmarken än
 * är. Med platsens egen klimatologi kan modellen räkna i relativt uttagbart
 * vatten (REW) i stället: 0 = platsens torraste läge, 1 = dess blötaste.
 *
 * Maj–oktober, inte helår: ERA5 redovisar flytande markvatten, som sjunker
 * vid tjäle — en helårspercentil i norr skulle mäta vintern, inte det
 * torraste sommarläget.
 */

import { cacheLas, cacheSkriv, cacheLasGammal } from '../lib/db.ts'

const ARKIV = 'https://archive-api.open-meteo.com/v1/archive'
const AR_BAKAT = 15

export type Klimatologi = {
  /** Vissningsgräns- och fältkapacitetsproxy för mycelets djup (7–28 cm). */
  djup: { wp: number; fc: number }
  /** Samma för ytskiktet (0–7 cm). */
  yta: { wp: number; fc: number }
}

/** Relativt uttagbart vatten: 0 vid platsens torraste (p2), 1 vid dess
    blötaste (p98). Ingen nedre clamp — extremtorka under p2 ger negativ REW
    så att klockgolvets exponentialsvans fortsätter avta i stället för att
    plana ut. */
export function tillRew(varde: number, lager: { wp: number; fc: number }): number {
  const span = lager.fc - lager.wp
  if (!(span > 0.02)) return NaN // degenererad klimatologi — låt anroparen falla tillbaka
  return Math.min(1.05, (varde - lager.wp) / span)
}

const klimatNyckel = (lat: number, lon: number) =>
  `klimatologi:${lat.toFixed(2)}:${lon.toFixed(2)}`

function percentil(sorterad: number[], p: number): number {
  return sorterad[Math.min(sorterad.length - 1, Math.floor((p / 100) * sorterad.length))]!
}

/**
 * Hämtar (eller läser ur cache) platsens klimatologi. Returnerar null när
 * arkivet inte går att nå och inget cachat finns — modellen räknar då i
 * absoluta värden precis som före normaliseringen.
 */
export async function hamtaKlimatologi(lat: number, lon: number): Promise<Klimatologi | null> {
  const nyckel = klimatNyckel(lat, lon)
  const cachad = await cacheLas<Klimatologi>(nyckel)
  if (cachad) return cachad

  const slut = new Date(Date.now() - 3 * 864e5)
  const start = new Date(slut)
  start.setFullYear(start.getFullYear() - AR_BAKAT)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const url =
    `${ARKIV}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&start_date=${iso(start)}&end_date=${iso(slut)}` +
    `&daily=soil_moisture_7_to_28cm_mean,soil_moisture_0_to_7cm_mean&timezone=auto`

  try {
    const svar = await fetch(url)
    if (!svar.ok) throw new Error(`arkivet svarade ${svar.status}`)
    const j = (await svar.json()) as {
      daily: {
        time: string[]
        soil_moisture_7_to_28cm_mean: (number | null)[]
        soil_moisture_0_to_7cm_mean: (number | null)[]
      }
    }
    const djup: number[] = []
    const yta: number[] = []
    for (let i = 0; i < j.daily.time.length; i++) {
      const man = Number(j.daily.time[i]!.slice(5, 7))
      if (man < 5 || man > 10) continue
      const d = j.daily.soil_moisture_7_to_28cm_mean[i]
      const y = j.daily.soil_moisture_0_to_7cm_mean[i]
      if (d != null && isFinite(d)) djup.push(d)
      if (y != null && isFinite(y)) yta.push(y)
    }
    // ~2700 säsongsdygn på 15 år; under 500 är arkivet trasigt för punkten.
    if (djup.length < 500 || yta.length < 500) throw new Error('för tunn klimatologi')
    djup.sort((a, b) => a - b)
    yta.sort((a, b) => a - b)
    const res: Klimatologi = {
      djup: { wp: percentil(djup, 2), fc: percentil(djup, 98) },
      yta: { wp: percentil(yta, 2), fc: percentil(yta, 98) },
    }
    // Klimatologi ändrar sig inte på en månad.
    await cacheSkriv(nyckel, res, 30 * 864e5)
    return res
  } catch {
    return cacheLasGammal<Klimatologi>(nyckel)
  }
}
