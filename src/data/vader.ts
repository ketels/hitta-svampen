/**
 * Väderdata från Open-Meteo (ERA5 + ICON/ECMWF).
 * Fritt, utan nyckel, med CORS. Ett anrop ger 60 dygn bakåt och 16 framåt,
 * inklusive markfukt på 9–27 cm — precis det djup mycelet lever på — och
 * 3–9 cm, ytskiktet där fruktkroppar under utveckling känner av färskt regn.
 *
 * Höjddata hämtas inte här utan som terrängkakel, se `hojdkakel.ts`.
 */

import { cacheLas, cacheSkriv, cacheLasGammal } from '../lib/db.ts'
import { hamtaKlimatologi, tillRew } from './klimatologi.ts'
import type { VaderDag } from '../lib/types.ts'

const BAS = 'https://api.open-meteo.com/v1'

export const DAGAR_BAKAT = 60
export const DAGAR_FRAMAT = 16

export type Vaderserie = {
  serie: VaderDag[]
  /** Index i `serie` för dagens datum. */
  idag: number
  lat: number
  lon: number
  hojd: number
  /** True om datan kom från cache utan färsk nätkontakt. */
  gammal: boolean
}

/** Väderrutan är grov — runda av så vi återanvänder cachen i hela området. */
const vaderNyckel = (lat: number, lon: number) =>
  `vader:${lat.toFixed(2)}:${lon.toFixed(2)}`

function dygnsmedel(
  tider: string[],
  varden: (number | null)[],
  dagar: string[],
): Map<string, number> {
  const summa = new Map<string, [number, number]>()
  for (let i = 0; i < tider.length; i++) {
    const v = varden[i]
    if (v === null || v === undefined) continue
    const dag = tider[i]!.slice(0, 10)
    const nu = summa.get(dag) ?? [0, 0]
    nu[0] += v
    nu[1] += 1
    summa.set(dag, nu)
  }
  const ut = new Map<string, number>()
  for (const d of dagar) {
    const s = summa.get(d)
    ut.set(d, s && s[1] > 0 ? s[0] / s[1] : NaN)
  }
  return ut
}

/** Fyller i luckor genom linjär interpolation så modellen slipper NaN. */
function laga(varden: number[]): number[] {
  const ut = [...varden]
  const n = ut.length
  let forsta = ut.findIndex((v) => isFinite(v))
  if (forsta < 0) return ut.map(() => 0)
  for (let i = 0; i < forsta; i++) ut[i] = ut[forsta]!
  let sista = n - 1
  while (sista >= 0 && !isFinite(ut[sista]!)) sista--
  for (let i = sista + 1; i < n; i++) ut[i] = ut[sista]!
  for (let i = forsta; i <= sista; i++) {
    if (isFinite(ut[i]!)) continue
    let j = i
    while (j <= sista && !isFinite(ut[j]!)) j++
    const a = ut[i - 1]!
    const b = ut[j]!
    for (let k = i; k < j; k++) ut[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1)
    i = j
  }
  return ut
}

export async function hamtaVader(lat: number, lon: number): Promise<Vaderserie> {
  const nyckel = vaderNyckel(lat, lon)
  const cachad = await cacheLas<Vaderserie>(nyckel)
  if (cachad) return cachad

  /* Klimatologin hämtas parallellt med vädret. Utan den räknar modellen i
     absoluta fuktvärden precis som före normaliseringen. */
  const klimatLofte = hamtaKlimatologi(lat, lon).catch(() => null)

  const url =
    `${BAS}/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&hourly=soil_moisture_9_to_27cm,soil_moisture_3_to_9cm,soil_temperature_6cm` +
    `&past_days=${DAGAR_BAKAT}&forecast_days=${DAGAR_FRAMAT}&timezone=auto`

  try {
    const svar = await fetch(url)
    if (!svar.ok) throw new Error(`Open-Meteo svarade ${svar.status}`)
    const j = (await svar.json()) as {
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

    const dagar = j.daily.time
    const fukt = dygnsmedel(j.hourly.time, j.hourly.soil_moisture_9_to_27cm, dagar)
    const ytfukt = dygnsmedel(j.hourly.time, j.hourly.soil_moisture_3_to_9cm, dagar)
    const temp = dygnsmedel(j.hourly.time, j.hourly.soil_temperature_6cm, dagar)
    const fuktL = laga(dagar.map((d) => fukt.get(d) ?? NaN))
    const ytfuktL = laga(dagar.map((d) => ytfukt.get(d) ?? NaN))
    const tempL = laga(dagar.map((d) => temp.get(d) ?? NaN))

    const serie: VaderDag[] = dagar.map((d, i) => ({
      datum: d,
      nederbord: j.daily.precipitation_sum[i] ?? 0,
      tempMax: j.daily.temperature_2m_max[i] ?? 0,
      tempMin: j.daily.temperature_2m_min[i] ?? 0,
      markfukt: fuktL[i]!,
      ytfukt: ytfuktL[i]!,
      marktemp: tempL[i]!,
      soluppgang: j.daily.sunrise[i] ?? null,
      solnedgang: j.daily.sunset[i] ?? null,
    }))

    /* REW-fälten sätts allt-eller-inget: modellens initiering och modulator
       måste räkna i samma rymd, så en delvis ifylld serie vore värre än
       ingen. Guarden är isFinite, inte nullish — 0 är en giltig REW. */
    const klimat = await klimatLofte
    if (klimat) {
      const djupRew = serie.map((d) => tillRew(d.markfukt, klimat.djup))
      const ytRew = serie.map((d) => tillRew(d.ytfukt ?? d.markfukt, klimat.yta))
      if (djupRew.every(isFinite) && ytRew.every(isFinite)) {
        serie.forEach((d, k) => {
          d.markfuktRew = djupRew[k]!
          d.ytfuktRew = ytRew[k]!
        })
      }
    }

    const idagStr = nuDatum()
    let idag = serie.findIndex((d) => d.datum === idagStr)
    if (idag < 0) idag = Math.min(DAGAR_BAKAT, serie.length - 1)

    const res: Vaderserie = {
      serie,
      idag,
      lat: j.latitude,
      lon: j.longitude,
      hojd: j.elevation,
      gammal: false,
    }
    // Tre timmar räcker — prognosen uppdateras inte oftare än så.
    await cacheSkriv(nyckel, res, 3 * 3600e3)
    return res
  } catch (e) {
    const gammal = await cacheLasGammal<Vaderserie>(nyckel)
    if (gammal) return { ...gammal, gammal: true }
    throw e
  }
}

/** Dagens datum i lokal tid som YYYY-MM-DD. */
export function nuDatum(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}
