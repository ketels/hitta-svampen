import { computeFruiting, kernelWeight, seasonFactor } from '../src/model/fruiting.ts'
import { species } from '../src/data/species.ts'
import type { WeatherDay } from '../src/lib/types.ts'

let failures = 0
const ok = (name: string, v: boolean, extra = '') => {
  console.log(`${v ? '  ok  ' : ' FAIL '} ${name}${extra ? '   ' + extra : ''}`)
  if (!v) failures++
}

const chanterelle = species('chanterelle')
const funnel = species('funnel-chanterelle')

/** Build 60 days up to `endDate`. `rain(age)` = mm on that day. */
function series(
  endDate: string,
  rain: (daysBack: number) => number,
  moisture: (daysBack: number) => number,
  temp: number,
  minTemp: (daysBack: number) => number = () => 10,
  surfaceMoisture: (daysBack: number) => number = moisture,
): WeatherDay[] {
  const out: WeatherDay[] = []
  const end = new Date(endDate + 'T12:00:00Z')
  for (let age = 59; age >= 0; age--) {
    const d = new Date(end.getTime() - age * 864e5)
    out.push({
      date: d.toISOString().slice(0, 10),
      precipitation: rain(age),
      tempMax: temp + 5,
      tempMin: minTemp(age),
      soilMoisture: moisture(age),
      surfaceMoisture: surfaceMoisture(age),
      soilTemp: temp,
    })
  }
  return out
}

console.log('\n— Kantarell, olika vädersituationer (mitten av augusti) —')

// A. Total drought
{
  const s = series('2026-08-15', () => 0, () => 0.10, 19)
  const f = computeFruiting(s, chanterelle, '2026-08-15')
  ok('torka ger nära noll', f.index < 0.08, `index=${f.index.toFixed(3)}`)
}

// B. The classic good case: proper rain ~16 days ago, ground moist since
{
  const s = series(
    '2026-08-15',
    (a) => (a >= 14 && a <= 19 ? 12 : a % 6 === 0 ? 2 : 0),
    (a) => (a > 22 ? 0.20 : 0.30),
    16,
  )
  const f = computeFruiting(s, chanterelle, '2026-08-15')
  ok('idealt regnfönster ger högt index', f.index > 0.72, `index=${f.index.toFixed(3)}`)
  ok('  regn i fönstret registrerat', f.rainInWindow > 2, `${f.rainInWindow.toFixed(2)} mm/dygn`)
}

// C. Cloudburst yesterday after a long drought — the mycelium cannot react yet
{
  const s = series('2026-08-15', (a) => (a <= 1 ? 45 : 0), (a) => (a <= 1 ? 0.34 : 0.11), 19)
  const f = computeFruiting(s, chanterelle, '2026-08-15')
  ok('skyfall igår ger fortfarande lågt index', f.index < 0.3, `index=${f.index.toFixed(3)}`)
  ok('  men 7-dygnsregnet syns', f.rain7 >= 45, `${f.rain7.toFixed(0)} mm`)
}

// D. Waterlogged — too wet
{
  const s = series('2026-08-15', () => 22, () => 0.47, 16)
  const f = computeFruiting(s, chanterelle, '2026-08-15')
  ok('vattensjuk mark straffas', f.soilMoisture < 0.15, `markfukt-poäng=${f.soilMoisture.toFixed(3)}`)
}

// E. Ground too cold (chanterelle in November)
{
  const s = series('2026-11-10', (a) => (a >= 12 && a <= 18 ? 10 : 1), () => 0.31, 4)
  const f = computeFruiting(s, chanterelle, '2026-11-10')
  ok('kall mark stänger kantarellen', f.soilTemp < 0.05, `marktemp-poäng=${f.soilTemp.toFixed(3)}`)
}

// F. Frost kills the chanterelle but not the funnel chanterelle
{
  const s = series(
    '2026-10-12',
    (a) => (a >= 12 && a <= 18 ? 10 : 1),
    () => 0.32,
    9,
    (a) => (a >= 3 && a <= 5 ? -5 : 3),
  )
  const fc = computeFruiting(s, chanterelle, '2026-10-12')
  const ff = computeFruiting(s, funnel, '2026-10-12')
  ok('hård frost slår ut kantarellen', fc.frostFactor < 0.2, `frostfaktor=${fc.frostFactor.toFixed(2)}`)
  ok('trattkantarellen klarar frosten', ff.frostFactor === 1, `frostfaktor=${ff.frostFactor.toFixed(2)}`)
  ok('  och får bra index i oktober', ff.index > 0.6, `index=${ff.index.toFixed(3)}`)
}

// G. Drought penalty
{
  const good = series('2026-08-15', (a) => (a >= 14 && a <= 19 ? 12 : 0), () => 0.30, 16)
  const afterDrought = series(
    '2026-08-15',
    (a) => (a >= 14 && a <= 19 ? 12 : 0),
    (a) => (a > 20 ? 0.08 : 0.30),
    16,
  )
  const f1 = computeFruiting(good, chanterelle, '2026-08-15')
  const f2 = computeFruiting(afterDrought, chanterelle, '2026-08-15')
  ok('lång torka innan sänker indexet', f2.index < f1.index * 0.92,
     `${f1.index.toFixed(3)} -> ${f2.index.toFixed(3)}`)
}

// H. Surface moisture modulates around initiation, [0.85, 1.15]: a wet surface
//    LIFTS above the initiation level (fresh rain has an immediate effect), a
//    dry one holds back ongoing development without killing it.
{
  const rain = (a: number) => (a >= 14 && a <= 19 ? 12 : a % 6 === 0 ? 2 : 0)
  const wet = series('2026-08-15', rain, () => 0.30, 16)
  const drySurface = series('2026-08-15', rain, () => 0.30, 16, undefined, (a) => (a <= 4 ? 0.10 : 0.30))
  const fW = computeFruiting(wet, chanterelle, '2026-08-15')
  const fD = computeFruiting(drySurface, chanterelle, '2026-08-15')
  const initW = 0.45 * fW.rainDrive + 0.55 * fW.soilMoisture
  const initD = 0.45 * fD.rainDrive + 0.55 * fD.soilMoisture
  ok('blöt yta lyfter vattnet ÖVER initieringen', fW.water > initW * 1.05,
     `initiering=${initW.toFixed(3)} -> vatten=${fW.water.toFixed(3)}`)
  ok('  torr yta trycker det under', fD.water < initD * 0.95,
     `initiering=${initD.toFixed(3)} -> vatten=${fD.water.toFixed(3)}`)
  ok('  torr yta sänker indexet mot blöt', fD.index < fW.index * 0.85,
     `${fW.index.toFixed(3)} -> ${fD.index.toFixed(3)}`)
  ok('  men svängrummet är begränsat', fD.index > fW.index * 0.7,
     `kvot=${(fD.index / fW.index).toFixed(2)}`)
}

// I. Wet surface but zero initiation — fresh rain conjures nothing out of drought
{
  const s = series('2026-08-15', () => 0, () => 0.10, 19, undefined, (a) => (a <= 1 ? 0.35 : 0.10))
  const f = computeFruiting(s, chanterelle, '2026-08-15')
  ok('blöt yta utan initiering ger nära noll', f.index < 0.08, `index=${f.index.toFixed(3)}`)
}

// J. Skewed kernel and event sensitivity: the leading edge weighs more than the
//    trailing one at the same distance from the peak, and a single proper rain
//    in the right window is enough for good drive.
{
  const w7 = kernelWeight(7, chanterelle.rainLag)
  const w25 = kernelWeight(25, chanterelle.rainLag)
  ok('kärnan är framtung', w7 > w25 * 1.5, `w(7)=${w7.toFixed(2)} w(25)=${w25.toFixed(2)}`)
  const s = series('2026-08-15', (a) => (a === 16 ? 36 : 0), () => 0.25, 16)
  const f = computeFruiting(s, chanterelle, '2026-08-15')
  ok('ett enskilt 36 mm-regn i fönstret driver ordentligt', f.rainDrive > 0.6,
     `regnDriv=${f.rainDrive.toFixed(2)}`)
}

/** Fill in REW fields against a given climatology, as weather.ts does. */
function withClimatology(
  s: WeatherDay[],
  deep: { wp: number; fc: number },
  surface: { wp: number; fc: number } = deep,
): WeatherDay[] {
  const rew = (v: number, l: { wp: number; fc: number }) =>
    Math.min(1.05, (v - l.wp) / (l.fc - l.wp))
  return s.map((d) => ({
    ...d,
    soilMoistureRew: rew(d.soilMoisture, deep),
    surfaceMoistureRew: rew(d.surfaceMoisture ?? d.soilMoisture, surface),
  }))
}

// K. REW space against the reference soil (wp 0.12, fc 0.48) is exactly
//    equivalent to the absolute path — the figure does not jump when the
//    climatology loads for a site resembling the reference.
{
  const abs = series('2026-08-15', (a) => (a >= 14 && a <= 19 ? 6 : 0), () => 0.22, 12)
  const rew = withClimatology(abs, { wp: 0.12, fc: 0.48 })
  const fA = computeFruiting(abs, chanterelle, '2026-08-15')
  const fR = computeFruiting(rew, chanterelle, '2026-08-15')
  ok('referensklimat ger samma index som absolutvägen',
     Math.abs(fA.index - fR.index) < 1e-9 && fA.index > 0.1 && fA.index < 0.9,
     `abs=${fA.index.toFixed(4)} rew=${fR.index.toFixed(4)}`)
  ok('  och flaggar normaliserad', fR.normalized && !fA.normalized)
}

// L. Sandy pine heath: an absolute 0.16 m³/m³ is exactly the chanterelle's
//    absolute minimum — but for ground whose own span is 0.05–0.25, 0.16 is in
//    the middle of the extractable water. Normalised, the same weather should
//    give a good moisture score.
{
  const rain = (a: number) => (a >= 14 && a <= 19 ? 12 : 0)
  const abs = series('2026-08-15', rain, () => 0.16, 15)
  const pineHeath = withClimatology(abs, { wp: 0.05, fc: 0.25 })
  const fAbs = computeFruiting(abs, chanterelle, '2026-08-15')
  const fNorm = computeFruiting(pineHeath, chanterelle, '2026-08-15')
  ok('tallmon får god fuktpoäng normaliserat', fNorm.soilMoisture > 0.8,
     `markfukt-poäng ${fAbs.soilMoisture.toFixed(2)} (absolut) -> ${fNorm.soilMoisture.toFixed(2)} (REW)`)
  ok('  och klart högre index än absolutvägen', fNorm.index > fAbs.index * 1.5,
     `${fAbs.index.toFixed(3)} -> ${fNorm.index.toFixed(3)}`)
}

// M. Extreme drought below the site's p2 gives a negative REW and a score that
//    keeps falling — no plateau at REW 0.
{
  const rain = (a: number) => (a >= 14 && a <= 19 ? 12 : 0)
  const atP2 = withClimatology(series('2026-08-15', rain, () => 0.2, 15), { wp: 0.2, fc: 0.4 })
  const belowP2 = withClimatology(series('2026-08-15', rain, () => 0.1, 15), { wp: 0.2, fc: 0.4 })
  const f0 = computeFruiting(atP2, chanterelle, '2026-08-15')
  const fU = computeFruiting(belowP2, chanterelle, '2026-08-15')
  ok('torka under p2 fortsätter sänka poängen', fU.soilMoisture < f0.soilMoisture * 0.3,
     `markfukt-poäng ${f0.soilMoisture.toFixed(3)} (REW 0) -> ${fU.soilMoisture.toFixed(3)} (REW -0.5)`)
  ok('  och REW-medlen exponeras för UI:t',
     f0.meanDeepRew === 0 && fU.meanDeepRew !== null && fU.meanDeepRew < 0,
     `meanDeepRew=${fU.meanDeepRew?.toFixed(2)}`)
}

console.log('\n— Säsongskurva, kantarell på 59°N —')
const seasonSamples: [string, string][] = [
  ['2026-04-01', 'noll'], ['2026-06-10', 'noll'], ['2026-07-05', 'stigande'],
  ['2026-08-20', 'topp'], ['2026-09-10', 'topp'], ['2026-10-10', 'fallande'],
  ['2026-11-15', 'noll'],
]
for (const [date, expected] of seasonSamples) {
  const v = seasonFactor(chanterelle, new Date(date + 'T12:00:00'), 59)
  const described = v === 0 ? 'noll' : v >= 0.99 ? 'topp' : v > 0.4 ? 'stigande/fallande' : 'kant'
  const matches = expected === 'noll' ? v === 0 : expected === 'topp' ? v >= 0.99 : v > 0 && v < 1
  ok(`${date} -> ${v.toFixed(2)} (${described})`, matches)
}

// Latitude: the season starts later further north
{
  const south = seasonFactor(chanterelle, new Date('2026-07-05T12:00:00'), 56)
  const north = seasonFactor(chanterelle, new Date('2026-07-05T12:00:00'), 66)
  ok('säsongen startar senare norrut', south > north, `56°N=${south.toFixed(2)} 66°N=${north.toFixed(2)}`)
}

console.log(failures ? `\n${failures} test misslyckades` : '\nAlla väder-/säsongstester gröna')
process.exit(failures ? 1 : 0)
