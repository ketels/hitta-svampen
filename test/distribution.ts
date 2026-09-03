import './shim.ts'
import 'fake-indexeddb/auto'
import { scan } from '../src/model/scan.ts'
import { LAND_TYPE_NAME } from '../src/data/landCover.ts'

const s = await scan({
  center: { lat: 59.7697, lon: 17.6581 },
  radiusM: 1200, species: 'chanterelle', finds: [],
})

const v = s.cells.map((c) => c.score).sort((a, b) => a - b)
const q = (p: number) => v[Math.floor(p * (v.length - 1))]!
console.log(`\n${v.length} celler`)
console.log('kvantiler:', [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98]
  .map((p) => `p${(p * 100).toFixed(0)}=${(q(p) * 100).toFixed(0)}`).join('  '))
console.log(`min=${(v[0]!*100).toFixed(0)}  max=${(v[v.length-1]!*100).toFixed(0)}`)

console.log('\nHistogram över habitatpoäng:')
const buckets = new Array(10).fill(0)
for (const x of v) buckets[Math.min(9, Math.floor(x * 10))]++
for (let i = 0; i < 10; i++) {
  const share = buckets[i] / v.length
  console.log(`  ${i * 10}–${i * 10 + 9}%  ${'█'.repeat(Math.round(share * 60)).padEnd(60)} ${(share * 100).toFixed(1)}%`)
}

console.log('\nMedelpoäng per marktyp:')
const per = new Map<string, number[]>()
for (const c of s.cells) {
  const l = per.get(c.habitat.landType) ?? []
  l.push(c.score)
  per.set(c.habitat.landType, l)
}
for (const [t, l] of [...per].sort((a, b) => b[1].length - a[1].length)) {
  const mean = l.reduce((a, b) => a + b, 0) / l.length
  const lo = Math.min(...l), hi = Math.max(...l)
  console.log(`  ${LAND_TYPE_NAME[t as never].padEnd(18)} n=${String(l.length).padStart(5)}  medel=${(mean*100).toFixed(0)}%  spann ${(lo*100).toFixed(0)}–${(hi*100).toFixed(0)}%`)
}

// How much does the score vary within the mixed forest alone? That decides
// whether the map says anything useful once you are in the right kind of forest.
const mixed = s.cells.filter((c) => c.habitat.landType === 'mixed').map((c) => c.score).sort((a,b)=>a-b)
if (mixed.length > 20) {
  const mq = (p: number) => mixed[Math.floor(p * (mixed.length - 1))]!
  console.log(`\nInom blandskogen: p10=${(mq(0.1)*100).toFixed(0)}%  median=${(mq(0.5)*100).toFixed(0)}%  p90=${(mq(0.9)*100).toFixed(0)}%  spridning=${((mq(0.9)-mq(0.1))*100).toFixed(0)} poäng`)
}
