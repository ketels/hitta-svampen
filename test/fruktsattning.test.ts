import { beraknaFruktsattning, sasongsfaktor } from '../src/model/fruktsattning.ts'
import { art } from '../src/data/arter.ts'
import type { VaderDag } from '../src/lib/types.ts'

let fel = 0
const ok = (namn: string, v: boolean, extra = '') => {
  console.log(`${v ? '  ok  ' : ' FAIL '} ${namn}${extra ? '   ' + extra : ''}`)
  if (!v) fel++
}

const kantarell = art('kantarell')
const trattis = art('trattkantarell')

/** Bygg 60 dygn fram till `slutdatum`. `regn(alder)` = mm den dagen. */
function serie(
  slutdatum: string,
  regn: (dagarBakat: number) => number,
  fukt: (dagarBakat: number) => number,
  temp: number,
  minTemp: (dagarBakat: number) => number = () => 10,
  ytfukt: (dagarBakat: number) => number = fukt,
): VaderDag[] {
  const ut: VaderDag[] = []
  const slut = new Date(slutdatum + 'T12:00:00Z')
  for (let alder = 59; alder >= 0; alder--) {
    const d = new Date(slut.getTime() - alder * 864e5)
    ut.push({
      datum: d.toISOString().slice(0, 10),
      nederbord: regn(alder),
      tempMax: temp + 5,
      tempMin: minTemp(alder),
      markfukt: fukt(alder),
      ytfukt: ytfukt(alder),
      marktemp: temp,
    })
  }
  return ut
}

console.log('\n— Kantarell, olika vädersituationer (mitten av augusti) —')

// A. Total torka
{
  const s = serie('2026-08-15', () => 0, () => 0.10, 19)
  const f = beraknaFruktsattning(s, kantarell, '2026-08-15')
  ok('torka ger nära noll', f.index < 0.08, `index=${f.index.toFixed(3)}`)
}

// B. Klassiskt bra: rejält regn för ~16 dygn sen, marken fuktig sen dess
{
  const s = serie(
    '2026-08-15',
    (a) => (a >= 14 && a <= 19 ? 12 : a % 6 === 0 ? 2 : 0),
    (a) => (a > 22 ? 0.20 : 0.30),
    16,
  )
  const f = beraknaFruktsattning(s, kantarell, '2026-08-15')
  ok('idealt regnfönster ger högt index', f.index > 0.72, `index=${f.index.toFixed(3)}`)
  ok('  regn i fönstret registrerat', f.regnIFonster > 2, `${f.regnIFonster.toFixed(2)} mm/dygn`)
}

// C. Skyfall igår efter lång torka — mycelet hinner inte reagera
{
  const s = serie('2026-08-15', (a) => (a <= 1 ? 45 : 0), (a) => (a <= 1 ? 0.34 : 0.11), 19)
  const f = beraknaFruktsattning(s, kantarell, '2026-08-15')
  ok('skyfall igår ger fortfarande lågt index', f.index < 0.3, `index=${f.index.toFixed(3)}`)
  ok('  men 7-dygnsregnet syns', f.regn7 >= 45, `${f.regn7.toFixed(0)} mm`)
}

// D. Vattensjukt — för blött
{
  const s = serie('2026-08-15', () => 22, () => 0.47, 16)
  const f = beraknaFruktsattning(s, kantarell, '2026-08-15')
  ok('vattensjuk mark straffas', f.markfukt < 0.15, `markfukt-poäng=${f.markfukt.toFixed(3)}`)
}

// E. För kall mark (kantarell i november)
{
  const s = serie('2026-11-10', (a) => (a >= 12 && a <= 18 ? 10 : 1), () => 0.31, 4)
  const f = beraknaFruktsattning(s, kantarell, '2026-11-10')
  ok('kall mark stänger kantarellen', f.marktemp < 0.05, `marktemp-poäng=${f.marktemp.toFixed(3)}`)
}

// F. Frost dödar kantarellen men inte trattkantarellen
{
  const s = serie(
    '2026-10-12',
    (a) => (a >= 12 && a <= 18 ? 10 : 1),
    () => 0.32,
    9,
    (a) => (a >= 3 && a <= 5 ? -5 : 3),
  )
  const fk = beraknaFruktsattning(s, kantarell, '2026-10-12')
  const ft = beraknaFruktsattning(s, trattis, '2026-10-12')
  ok('hård frost slår ut kantarellen', fk.frostfaktor < 0.2, `frostfaktor=${fk.frostfaktor.toFixed(2)}`)
  ok('trattkantarellen klarar frosten', ft.frostfaktor === 1, `frostfaktor=${ft.frostfaktor.toFixed(2)}`)
  ok('  och får bra index i oktober', ft.index > 0.6, `index=${ft.index.toFixed(3)}`)
}

// G. Torkstraff
{
  const bra = serie('2026-08-15', (a) => (a >= 14 && a <= 19 ? 12 : 0), () => 0.30, 16)
  const efterTorka = serie(
    '2026-08-15',
    (a) => (a >= 14 && a <= 19 ? 12 : 0),
    (a) => (a > 20 ? 0.08 : 0.30),
    16,
  )
  const f1 = beraknaFruktsattning(bra, kantarell, '2026-08-15')
  const f2 = beraknaFruktsattning(efterTorka, kantarell, '2026-08-15')
  ok('lång torka innan sänker indexet', f2.index < f1.index * 0.92,
     `${f1.index.toFixed(3)} -> ${f2.index.toFixed(3)}`)
}

// H. Ytfukten modulerar kring initieringen, [0.85, 1.15]: blöt yta LYFTER
//    över initieringens nivå (färskt regn ger omedelbar effekt), torr yta
//    hämmar pågående utveckling utan att döda den.
{
  const regn = (a: number) => (a >= 14 && a <= 19 ? 12 : a % 6 === 0 ? 2 : 0)
  const blot = serie('2026-08-15', regn, () => 0.30, 16)
  const torrYta = serie('2026-08-15', regn, () => 0.30, 16, undefined, (a) => (a <= 4 ? 0.10 : 0.30))
  const fB = beraknaFruktsattning(blot, kantarell, '2026-08-15')
  const fT = beraknaFruktsattning(torrYta, kantarell, '2026-08-15')
  const initB = 0.45 * fB.regnDriv + 0.55 * fB.markfukt
  const initT = 0.45 * fT.regnDriv + 0.55 * fT.markfukt
  ok('blöt yta lyfter vattnet ÖVER initieringen', fB.vatten > initB * 1.05,
     `initiering=${initB.toFixed(3)} -> vatten=${fB.vatten.toFixed(3)}`)
  ok('  torr yta trycker det under', fT.vatten < initT * 0.95,
     `initiering=${initT.toFixed(3)} -> vatten=${fT.vatten.toFixed(3)}`)
  ok('  torr yta sänker indexet mot blöt', fT.index < fB.index * 0.85,
     `${fB.index.toFixed(3)} -> ${fT.index.toFixed(3)}`)
  ok('  men svängrummet är begränsat', fT.index > fB.index * 0.7,
     `kvot=${(fT.index / fB.index).toFixed(2)}`)
}

// I. Blöt yta men noll initiering — färskt regn trollar inte fram svamp ur torka
{
  const s = serie('2026-08-15', () => 0, () => 0.10, 19, undefined, (a) => (a <= 1 ? 0.35 : 0.10))
  const f = beraknaFruktsattning(s, kantarell, '2026-08-15')
  ok('blöt yta utan initiering ger nära noll', f.index < 0.08, `index=${f.index.toFixed(3)}`)
}

console.log('\n— Säsongskurva, kantarell på 59°N —')
const sasongProv: [string, string][] = [
  ['2026-04-01', 'noll'], ['2026-06-10', 'noll'], ['2026-07-05', 'stigande'],
  ['2026-08-20', 'topp'], ['2026-09-10', 'topp'], ['2026-10-10', 'fallande'],
  ['2026-11-15', 'noll'],
]
for (const [dat, vantat] of sasongProv) {
  const v = sasongsfaktor(kantarell, new Date(dat + 'T12:00:00'), 59)
  const beskr = v === 0 ? 'noll' : v >= 0.99 ? 'topp' : v > 0.4 ? 'stigande/fallande' : 'kant'
  const passar = vantat === 'noll' ? v === 0 : vantat === 'topp' ? v >= 0.99 : v > 0 && v < 1
  ok(`${dat} -> ${v.toFixed(2)} (${beskr})`, passar)
}

// Latitud: norrut startar säsongen senare
{
  const syd = sasongsfaktor(kantarell, new Date('2026-07-05T12:00:00'), 56)
  const norr = sasongsfaktor(kantarell, new Date('2026-07-05T12:00:00'), 66)
  ok('säsongen startar senare norrut', syd > norr, `56°N=${syd.toFixed(2)} 66°N=${norr.toFixed(2)}`)
}

console.log(fel ? `\n${fel} test misslyckades` : '\nAlla väder-/säsongstester gröna')
process.exit(fel ? 1 : 0)
