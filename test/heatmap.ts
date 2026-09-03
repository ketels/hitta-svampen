import './shim.ts'
import 'fake-indexeddb/auto'
import { scan } from '../src/model/scan.ts'
import { CENTER } from './location.ts'

/** Mirrors the colouring in MapCanvas.tsx so we can measure how much lights up. */
const s = await scan({
  center: CENTER, radiusM: 1200, species: 'chanterelle', finds: [],
})
const v = s.cells.map((c) => c.score).sort((a, b) => a - b)
const q = (p: number) => v[Math.floor(p * (v.length - 1))]!
const low = q(0.72), high = q(0.99)
const span = Math.max(0.04, high - low)
const THRESHOLD = 0.06

let visible = 0
const buckets = new Array(5).fill(0)
for (const c of s.cells) {
  const rel = Math.max(0, Math.min(1, (c.score - low) / span))
  if (rel <= THRESHOLD) continue
  visible++
  buckets[Math.min(4, Math.floor(((rel - THRESHOLD) / (1 - THRESHOLD)) * 5))]++
}
console.log(`ankare: lag=${(low*100).toFixed(0)}%  hog=${(high*100).toFixed(0)}%  spann=${(span*100).toFixed(0)}`)
console.log(`synliga celler: ${visible} av ${s.cells.length} (${((visible/s.cells.length)*100).toFixed(1)}%)`)
console.log('fördelning över den synliga rampen (svag → glödande):')
for (let i = 0; i < 5; i++) {
  console.log(`  ${i*20}–${i*20+19}%  ${'█'.repeat(Math.round((buckets[i]/Math.max(1,visible))*50)).padEnd(50)} ${((buckets[i]/Math.max(1,visible))*100).toFixed(0)}%`)
}
