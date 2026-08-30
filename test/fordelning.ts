import './shim.ts'
import 'fake-indexeddb/auto'
import { skanna } from '../src/model/skanning.ts'
import { MARKTYP_NAMN } from '../src/data/overpass.ts'

const s = await skanna({
  centrum: { lat: 59.7697, lon: 17.6581 },
  radieM: 1200, art: 'kantarell', fynd: [],
})

const v = s.celler.map((c) => c.poang).sort((a, b) => a - b)
const q = (p: number) => v[Math.floor(p * (v.length - 1))]!
console.log(`\n${v.length} celler`)
console.log('kvantiler:', [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98]
  .map((p) => `p${(p * 100).toFixed(0)}=${(q(p) * 100).toFixed(0)}`).join('  '))
console.log(`min=${(v[0]!*100).toFixed(0)}  max=${(v[v.length-1]!*100).toFixed(0)}`)

console.log('\nHistogram över habitatpoäng:')
const hink = new Array(10).fill(0)
for (const x of v) hink[Math.min(9, Math.floor(x * 10))]++
for (let i = 0; i < 10; i++) {
  const andel = hink[i] / v.length
  console.log(`  ${i * 10}–${i * 10 + 9}%  ${'█'.repeat(Math.round(andel * 60)).padEnd(60)} ${(andel * 100).toFixed(1)}%`)
}

console.log('\nMedelpoäng per marktyp:')
const per = new Map<string, number[]>()
for (const c of s.celler) {
  const l = per.get(c.habitat.marktyp) ?? []
  l.push(c.poang)
  per.set(c.habitat.marktyp, l)
}
for (const [t, l] of [...per].sort((a, b) => b[1].length - a[1].length)) {
  const m = l.reduce((a, b) => a + b, 0) / l.length
  const lo = Math.min(...l), hi = Math.max(...l)
  console.log(`  ${MARKTYP_NAMN[t as never].padEnd(18)} n=${String(l.length).padStart(5)}  medel=${(m*100).toFixed(0)}%  spann ${(lo*100).toFixed(0)}–${(hi*100).toFixed(0)}%`)
}

// Hur mycket varierar poängen inom bara blandskogen? Det avgör om kartan
// säger något användbart när man väl står i rätt sorts skog.
const bland = s.celler.filter((c) => c.habitat.marktyp === 'blandskog').map((c) => c.poang).sort((a,b)=>a-b)
if (bland.length > 20) {
  const bq = (p: number) => bland[Math.floor(p * (bland.length - 1))]!
  console.log(`\nInom blandskogen: p10=${(bq(0.1)*100).toFixed(0)}%  median=${(bq(0.5)*100).toFixed(0)}%  p90=${(bq(0.9)*100).toFixed(0)}%  spridning=${((bq(0.9)-bq(0.1))*100).toFixed(0)} poäng`)
}
