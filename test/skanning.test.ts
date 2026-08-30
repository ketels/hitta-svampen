import './shim.ts'
import 'fake-indexeddb/auto'
import { skanna, bastaStallen, chansForCell } from '../src/model/skanning.ts'
import { MARKTYP_NAMN } from '../src/data/overpass.ts'
import { kompass, formateraKoord } from '../src/lib/geo.ts'

// Lunsen söder om Uppsala — riktig kantarellskog med blandad terräng.
const CENTRUM = { lat: 59.7697, lon: 17.6581 }

const t0 = Date.now()
let sisteSteg = ''
const s = await skanna({
  centrum: CENTRUM,
  radieM: 1000,
  art: 'kantarell',
  fynd: [],
  framsteg: (steg, andel) => {
    if (steg !== sisteSteg) { console.log(`  ${andel.toFixed(0).padStart(3)}%  ${steg}`); sisteSteg = steg }
  },
})
const sek = ((Date.now() - t0) / 1000).toFixed(1)

let fel = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v ? '  ok  ' : ' FAIL '} ${n}${e ? '   ' + e : ''}`); if (!v) fel++ }

console.log(`\n=== Skanning klar på ${sek} s ===`)
console.log(`Rutnät ${s.rader}×${s.kolumner}, cellstorlek ${s.cellM.toFixed(0)} m, ${s.celler.length} celler inom radien`)

ok('rimligt antal celler', s.celler.length > 4000 && s.celler.length < 30000, `${s.celler.length}`)
ok('alla poäng inom 0–1', s.celler.every((c) => c.poang >= 0 && c.poang <= 1))
ok('poängen varierar', new Set(s.celler.map((c) => c.poang.toFixed(2))).size > 20,
   `${new Set(s.celler.map((c) => c.poang.toFixed(2))).size} olika nivåer`)
ok('höjddata ser vettig ut', s.celler.every((c) => c.habitat.hojd > -10 && c.habitat.hojd < 600))
ok('TWI är finit överallt', s.celler.every((c) => isFinite(c.habitat.twi)))

const typer = new Map<string, number>()
for (const c of s.celler) typer.set(c.habitat.marktyp, (typer.get(c.habitat.marktyp) ?? 0) + 1)
console.log('\nMarktyper i området:')
for (const [t, n] of [...typer].sort((a, b) => b[1] - a[1]))
  console.log(`  ${MARKTYP_NAMN[t as keyof typeof MARKTYP_NAMN].padEnd(20)} ${((n / s.celler.length) * 100).toFixed(1)}%`)
ok('OSM gav faktiskt skogsdata', (typer.get('skog') ?? 0) + (typer.get('barrskog') ?? 0) +
   (typer.get('blandskog') ?? 0) + (typer.get('lovskog') ?? 0) > s.celler.length * 0.15)

console.log(`\nVäder: regn 7d=${s.fruktsattning.regn7.toFixed(0)}mm  14d=${s.fruktsattning.regn14.toFixed(0)}mm  30d=${s.fruktsattning.regn30.toFixed(0)}mm`)
console.log(`  viktat regn i fönstret ${s.fruktsattning.regnIFonster.toFixed(2)} mm/dygn`)
console.log(`  markfukt ${s.fruktsattning.medelMarkfukt.toFixed(3)} m³/m³   marktemp ${s.fruktsattning.medelMarktemp.toFixed(1)}°C`)
console.log(`  fruktsättningsindex ${(s.fruktsattning.index * 100).toFixed(0)}%   säsong ${(s.sasong * 100).toFixed(0)}%`)
console.log(`  begränsande faktor: ${s.fruktsattning.begransning}`)
for (const f of s.fruktsattning.forklaring) console.log(`   · ${f}`)

console.log(`\nRapporterade kantarellfynd i rutan: ${s.observationer.length}`)

const topp = bastaStallen(s, 5)
console.log('\n=== Fem bästa ställena ===')
for (const [k, c] of topp.entries()) {
  const h = c.habitat
  console.log(`${k + 1}. ${formateraKoord(c.lat, c.lon)}`)
  console.log(`   habitat ${(c.poang * 100).toFixed(0)}%  →  chans idag ${chansForCell(s, c).toFixed(0)}%`)
  console.log(`   ${MARKTYP_NAMN[h.marktyp]}, ${h.hojd.toFixed(0)} möh, lutning ${h.lutning.toFixed(1)}° mot ${h.vaderstreck === null ? 'platt' : kompass(h.vaderstreck)}`)
  console.log(`   våtindex ${h.twi.toFixed(1)}, ${h.tillVatten === null ? 'inget vatten nära' : Math.round(h.tillVatten) + ' m till vatten'}, ${h.tillKant === null ? 'ingen kant nära' : Math.round(h.tillKant) + ' m till stig/bryn'}`)
}
ok('bästa stället är bättre än medel', topp[0]!.poang > s.celler.reduce((a, c) => a + c.poang, 0) / s.celler.length + 0.08)
ok('topplistan är utspridd', topp.length >= 3, `${topp.length} förslag`)

const varsta = [...s.celler].sort((a, b) => a.poang - b.poang)[0]!
console.log(`\nSämsta cellen: ${(varsta.poang * 100).toFixed(0)}% — ${MARKTYP_NAMN[varsta.habitat.marktyp]}`)
ok('modellen dömer ut dålig mark', varsta.poang < topp[0]!.poang * 0.7,
   `${(varsta.poang * 100).toFixed(0)}% mot ${(topp[0]!.poang * 100).toFixed(0)}%`)

console.log(fel ? `\n${fel} test misslyckades` : '\nHela kedjan fungerar mot skarp data')
process.exit(fel ? 1 : 0)
