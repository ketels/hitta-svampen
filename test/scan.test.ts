import './shim.ts'
import 'fake-indexeddb/auto'
import { scan, bestPlaces, chanceForCell } from '../src/model/scan.ts'
import { LAND_TYPE_NAME } from '../src/data/landCover.ts'
import { compass, formatCoord } from '../src/lib/geo.ts'
import { CENTER } from './location.ts'

const t0 = Date.now()
let lastStep = ''
const s = await scan({
  center: CENTER,
  radiusM: 1000,
  species: 'chanterelle',
  finds: [],
  progress: (step, share) => {
    if (step !== lastStep) { console.log(`  ${share.toFixed(0).padStart(3)}%  ${step}`); lastStep = step }
  },
})
const seconds = ((Date.now() - t0) / 1000).toFixed(1)

let failures = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v ? '  ok  ' : ' FAIL '} ${n}${e ? '   ' + e : ''}`); if (!v) failures++ }

console.log(`\n=== Skanning klar på ${seconds} s ===`)
console.log(`Rutnät ${s.rows}×${s.cols}, cellstorlek ${s.cellM.toFixed(0)} m, ${s.cells.length} celler inom radien`)

ok('rimligt antal celler', s.cells.length > 4000 && s.cells.length < 30000, `${s.cells.length}`)
ok('alla poäng inom 0–1', s.cells.every((c) => c.score >= 0 && c.score <= 1))
ok('poängen varierar', new Set(s.cells.map((c) => c.score.toFixed(2))).size > 20,
   `${new Set(s.cells.map((c) => c.score.toFixed(2))).size} olika nivåer`)
ok('höjddata ser vettig ut', s.cells.every((c) => c.habitat.elevation > -10 && c.habitat.elevation < 600))
ok('TWI är finit överallt', s.cells.every((c) => isFinite(c.habitat.twi)))

const types = new Map<string, number>()
for (const c of s.cells) types.set(c.habitat.landType, (types.get(c.habitat.landType) ?? 0) + 1)
console.log('\nMarktyper i området:')
for (const [t, n] of [...types].sort((a, b) => b[1] - a[1]))
  console.log(`  ${LAND_TYPE_NAME[t as keyof typeof LAND_TYPE_NAME].padEnd(20)} ${((n / s.cells.length) * 100).toFixed(1)}%`)
ok('marktäckedatan gav faktiskt skogsdata', (types.get('forest') ?? 0) + (types.get('coniferous') ?? 0) +
   (types.get('mixed') ?? 0) + (types.get('deciduous') ?? 0) > s.cells.length * 0.15)

console.log(`\nVäder: regn 7d=${s.fruiting.rain7.toFixed(0)}mm  14d=${s.fruiting.rain14.toFixed(0)}mm  30d=${s.fruiting.rain30.toFixed(0)}mm`)
console.log(`  viktat regn i fönstret ${s.fruiting.rainInWindow.toFixed(2)} mm/dygn`)
console.log(`  markfukt ${s.fruiting.meanSoilMoisture.toFixed(3)} m³/m³   marktemp ${s.fruiting.meanSoilTemp.toFixed(1)}°C`)
console.log(`  fruktsättningsindex ${(s.fruiting.index * 100).toFixed(0)}%   säsong ${(s.season * 100).toFixed(0)}%`)
console.log(`  begränsande faktor: ${s.fruiting.limiter}`)
for (const n of s.fruiting.notes) console.log(`   · ${n}`)

console.log(`\nRapporterade kantarellfynd i rutan: ${s.observations.length}`)

const top = bestPlaces(s, 5)
console.log('\n=== Fem bästa ställena ===')
for (const [k, c] of top.entries()) {
  const h = c.habitat
  console.log(`${k + 1}. ${formatCoord(c.lat, c.lon)}`)
  console.log(`   habitat ${(c.score * 100).toFixed(0)}%  →  chans idag ${chanceForCell(s, c).toFixed(0)}%`)
  console.log(`   ${LAND_TYPE_NAME[h.landType]}, ${h.elevation.toFixed(0)} möh, lutning ${h.slope.toFixed(1)}° mot ${h.aspect === null ? 'platt' : compass(h.aspect)}`)
  console.log(`   våtindex ${h.twi.toFixed(1)}, ${h.toWater === null ? 'inget vatten nära' : Math.round(h.toWater) + ' m till vatten'}, ${h.toEdge === null ? 'ingen kant nära' : Math.round(h.toEdge) + ' m till stig/bryn'}`)
}
ok('bästa stället är bättre än medel', top[0]!.score > s.cells.reduce((a, c) => a + c.score, 0) / s.cells.length + 0.08)
ok('topplistan är utspridd', top.length >= 3, `${top.length} förslag`)

const worst = [...s.cells].sort((a, b) => a.score - b.score)[0]!
console.log(`\nSämsta cellen: ${(worst.score * 100).toFixed(0)}% — ${LAND_TYPE_NAME[worst.habitat.landType]}`)
ok('modellen dömer ut dålig mark', worst.score < top[0]!.score * 0.7,
   `${(worst.score * 100).toFixed(0)}% mot ${(top[0]!.score * 100).toFixed(0)}%`)

console.log(failures ? `\n${failures} test misslyckades` : '\nHela kedjan fungerar mot skarp data')
process.exit(failures ? 1 : 0)
