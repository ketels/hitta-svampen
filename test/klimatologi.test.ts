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
 * Körs med: node --experimental-strip-types test/klimatologi.test.ts
 */

let fel = 0
const ok = (namn: string, v: boolean, extra = '') => {
  console.log(`${v ? '  ok  ' : ' FAIL '} ${namn}${extra ? '   ' + extra : ''}`)
  if (!v) fel++
}

const PLATSER: [string, number, number][] = [
  ['Uppsala-skog', 59.77, 17.66],
  ['Växjö', 56.88, 14.81],
  ['Jokkmokk', 66.6, 19.83],
]

const dygnsmedel = (tider: string[], varden: (number | null)[]) => {
  const per = new Map<string, [number, number]>()
  for (let i = 0; i < tider.length; i++) {
    const v = varden[i]
    if (v == null) continue
    const d = tider[i]!.slice(0, 10)
    const nu = per.get(d) ?? [0, 0]
    nu[0] += v
    nu[1] += 1
    per.set(d, nu)
  }
  return per
}

console.log('\n— Arkiv vs prognos: markfuktsnivåerna måste vara kommensurabla —')
for (const [namn, lat, lon] of PLATSER) {
  const prognos = (await (
    await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=soil_moisture_9_to_27cm,soil_moisture_3_to_9cm&past_days=60&forecast_days=1&timezone=auto`,
    )
  ).json()) as { hourly: { time: string[]; soil_moisture_9_to_27cm: (number | null)[]; soil_moisture_3_to_9cm: (number | null)[] } }
  const slut = new Date(Date.now() - 5 * 864e5)
  const start = new Date(Date.now() - 60 * 864e5)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const arkiv = (await (
    await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${iso(start)}&end_date=${iso(slut)}` +
        `&daily=soil_moisture_7_to_28cm_mean,soil_moisture_0_to_7cm_mean&timezone=auto`,
    )
  ).json()) as { daily: { time: string[]; soil_moisture_7_to_28cm_mean: (number | null)[]; soil_moisture_0_to_7cm_mean: (number | null)[] } }

  const pDjup = dygnsmedel(prognos.hourly.time, prognos.hourly.soil_moisture_9_to_27cm)
  const pYta = dygnsmedel(prognos.hourly.time, prognos.hourly.soil_moisture_3_to_9cm)
  let dDjup = 0
  let dYta = 0
  let n = 0
  for (let i = 0; i < arkiv.daily.time.length; i++) {
    const d = arkiv.daily.time[i]!
    const aD = arkiv.daily.soil_moisture_7_to_28cm_mean[i]
    const aY = arkiv.daily.soil_moisture_0_to_7cm_mean[i]
    const pD = pDjup.get(d)
    const pY = pYta.get(d)
    if (aD == null || aY == null || !pD || !pY) continue
    dDjup += pD[0] / pD[1] - aD
    dYta += pY[0] / pY[1] - aY
    n++
  }
  ok(`${namn}: överlappande dygn`, n > 30, `n=${n}`)
  const offDjup = Math.abs(dDjup / n)
  const offYta = Math.abs(dYta / n)
  ok(`  djuplager inom 0.03`, offDjup < 0.03, `offset=${offDjup.toFixed(3)}`)
  ok(`  ytlager inom 0.03`, offYta < 0.03, `offset=${offYta.toFixed(3)}`)
  await new Promise((r) => setTimeout(r, 900))
}

console.log(fel ? `\n${fel} test misslyckades` : '\nKlimatologitester gröna')
process.exit(fel ? 1 : 0)
