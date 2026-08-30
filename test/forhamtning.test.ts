import 'fake-indexeddb/auto'
import { hamtaLandtacke } from '../src/data/overpass.ts'

let fel = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v?'  ok  ':' FAIL '} ${n}${e?'   '+e:''}`); if(!v) fel++ }

// Låtsas-Overpass: räknar anrop och svarar med en skogsyta.
let anrop = 0
const svar = JSON.stringify({
  elements: [
    { type: 'way', id: 1, tags: { landuse: 'forest', leaf_type: 'mixed' },
      geometry: [
        { lat: 57.65, lon: 12.25 }, { lat: 57.71, lon: 12.25 },
        { lat: 57.71, lon: 12.31 }, { lat: 57.65, lon: 12.31 },
        { lat: 57.65, lon: 12.25 },
      ] },
    { type: 'way', id: 2, tags: { highway: 'path' },
      geometry: [{ lat: 57.67, lon: 12.27 }, { lat: 57.69, lon: 12.29 }] },
  ],
})
globalThis.fetch = (async () => {
  anrop++
  return new Response(svar, { status: 200, headers: { 'Content-Type': 'application/json' } })
}) as typeof fetch

// 1. Förhämta en stor trakt (som nedladdningen gör).
const stor = { south: 57.6508, west: 12.2264, north: 57.7092, east: 12.3336 }
await hamtaLandtacke(stor)
ok('förhämtningen gjorde ett nätanrop', anrop === 1, `${anrop} anrop`)

// 2. En skanning mitt i den ska inte gå ut på nätet.
const inuti = { south: 57.6700, west: 12.2700, north: 57.6900, east: 12.2900 }
const a = await hamtaLandtacke(inuti)
ok('skanning inuti träffar cachen', anrop === 1, `${anrop} anrop totalt`)
ok('  och får faktiskt data', a.ytor.length === 1 && a.stigar.length === 1,
   `${a.ytor.length} ytor, ${a.stigar.length} stigar`)

// 3. En skanning som sticker ut utanför måste hämta nytt.
const utanfor = { south: 57.7000, west: 12.2700, north: 57.7500, east: 12.2900 }
await hamtaLandtacke(utanfor)
ok('skanning utanför hämtar nytt', anrop === 2, `${anrop} anrop totalt`)

// 4. Exakt samma ruta igen — vanlig cacheträff.
await hamtaLandtacke(inuti)
ok('upprepad skanning ger inget nytt anrop', anrop === 2, `${anrop} anrop totalt`)

// 5. Kanterna: en ruta som precis tangerar den förhämtade ska räknas som inuti.
const kant = { south: stor.south, west: stor.west, north: stor.north, east: stor.east }
await hamtaLandtacke(kant)
ok('identisk ruta räknas som täckt', anrop === 2, `${anrop} anrop totalt`)

console.log(fel ? `\n${fel} test misslyckades` : '\nFörhämtningen träffar som den ska')
process.exit(fel ? 1 : 0)
