/**
 * Live-test mot Open-Meteo: klimatologin (ERA5-arkivet) och väderserien
 * (prognosendpointen) är olika modeller för olika djuplager. REW-mappningen
 * lägger arkivets percentiler på prognosens värden och förutsätter därför
 * att nivåerna är kommensurabla. Det här testet larmar om en framtida
 * modelluppgradering hos Open-Meteo tyst bryter den förutsättningen.
 *
 * Uppmätt offset vid införandet (aug 2026): 0.000–0.012 på djuplagret,
 * 0.004–0.028 på ytlagret.
 *
 * Körs med: node --experimental-strip-types test/climatology.test.ts
 */

let failures = 0
const ok = (name: string, v: boolean, extra = '') => {
  console.log(`${v ? '  ok  ' : ' FAIL '} ${name}${extra ? '   ' + extra : ''}`)
  if (!v) failures++
}

const PLACES: [string, number, number][] = [
  ['Uppsala-skog', 59.77, 17.66],
  ['Växjö', 56.88, 14.81],
  ['Jokkmokk', 66.6, 19.83],
]

const dailyMean = (times: string[], values: (number | null)[]) => {
  const per = new Map<string, [number, number]>()
  for (let i = 0; i < times.length; i++) {
    const v = values[i]
    if (v == null) continue
    const d = times[i]!.slice(0, 10)
    const cur = per.get(d) ?? [0, 0]
    cur[0] += v
    cur[1] += 1
    per.set(d, cur)
  }
  return per
}

console.log('\n— Arkiv vs prognos: markfuktsnivåerna måste vara kommensurabla —')
for (const [name, lat, lon] of PLACES) {
  const forecast = (await (
    await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=soil_moisture_9_to_27cm,soil_moisture_3_to_9cm&past_days=60&forecast_days=1&timezone=auto`,
    )
  ).json()) as { hourly: { time: string[]; soil_moisture_9_to_27cm: (number | null)[]; soil_moisture_3_to_9cm: (number | null)[] } }
  const end = new Date(Date.now() - 5 * 864e5)
  const start = new Date(Date.now() - 60 * 864e5)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const archive = (await (
    await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${iso(start)}&end_date=${iso(end)}` +
        `&daily=soil_moisture_7_to_28cm_mean,soil_moisture_0_to_7cm_mean&timezone=auto`,
    )
  ).json()) as { daily: { time: string[]; soil_moisture_7_to_28cm_mean: (number | null)[]; soil_moisture_0_to_7cm_mean: (number | null)[] } }

  const fDeep = dailyMean(forecast.hourly.time, forecast.hourly.soil_moisture_9_to_27cm)
  const fSurface = dailyMean(forecast.hourly.time, forecast.hourly.soil_moisture_3_to_9cm)
  let deltaDeep = 0
  let deltaSurface = 0
  let n = 0
  for (let i = 0; i < archive.daily.time.length; i++) {
    const d = archive.daily.time[i]!
    const aDeep = archive.daily.soil_moisture_7_to_28cm_mean[i]
    const aSurface = archive.daily.soil_moisture_0_to_7cm_mean[i]
    const pDeep = fDeep.get(d)
    const pSurface = fSurface.get(d)
    if (aDeep == null || aSurface == null || !pDeep || !pSurface) continue
    deltaDeep += pDeep[0] / pDeep[1] - aDeep
    deltaSurface += pSurface[0] / pSurface[1] - aSurface
    n++
  }
  ok(`${name}: överlappande dygn`, n > 30, `n=${n}`)
  const offsetDeep = Math.abs(deltaDeep / n)
  const offsetSurface = Math.abs(deltaSurface / n)
  ok(`  djuplager inom 0.03`, offsetDeep < 0.03, `offset=${offsetDeep.toFixed(3)}`)
  ok(`  ytlager inom 0.03`, offsetSurface < 0.03, `offset=${offsetSurface.toFixed(3)}`)
  await new Promise((r) => setTimeout(r, 900))
}

console.log(failures ? `\n${failures} test misslyckades` : '\nKlimatologitester gröna')
process.exit(failures ? 1 : 0)
