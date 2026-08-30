import './shim.ts'
import 'fake-indexeddb/auto'
import { skanna } from '../src/model/skanning.ts'

/** Speglar färgläggningen i Karta.tsx för att kunna mäta hur mycket som lyser. */
const s = await skanna({
  centrum: { lat: 59.7697, lon: 17.6581 }, radieM: 1200, art: 'kantarell', fynd: [],
})
const v = s.celler.map((c) => c.poang).sort((a, b) => a - b)
const q = (p: number) => v[Math.floor(p * (v.length - 1))]!
const lag = q(0.72), hog = q(0.99)
const spann = Math.max(0.04, hog - lag)
const TROSKEL = 0.06

let synliga = 0
const hinkar = new Array(5).fill(0)
for (const c of s.celler) {
  const rel = Math.max(0, Math.min(1, (c.poang - lag) / spann))
  if (rel <= TROSKEL) continue
  synliga++
  hinkar[Math.min(4, Math.floor(((rel - TROSKEL) / (1 - TROSKEL)) * 5))]++
}
console.log(`ankare: lag=${(lag*100).toFixed(0)}%  hog=${(hog*100).toFixed(0)}%  spann=${(spann*100).toFixed(0)}`)
console.log(`synliga celler: ${synliga} av ${s.celler.length} (${((synliga/s.celler.length)*100).toFixed(1)}%)`)
console.log('fördelning över den synliga rampen (svag → glödande):')
for (let i = 0; i < 5; i++) {
  console.log(`  ${i*20}–${i*20+19}%  ${'█'.repeat(Math.round((hinkar[i]/Math.max(1,synliga))*50)).padEnd(50)} ${((hinkar[i]/Math.max(1,synliga))*100).toFixed(0)}%`)
}
