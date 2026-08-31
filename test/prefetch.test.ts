import 'fake-indexeddb/auto'
import { fetchLandCover } from '../src/data/overpass.ts'

let failures = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v?'  ok  ':' FAIL '} ${n}${e?'   '+e:''}`); if(!v) failures++ }

// Fake Overpass: counts calls and answers with one forest area.
let calls = 0
const response = JSON.stringify({
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
  calls++
  return new Response(response, { status: 200, headers: { 'Content-Type': 'application/json' } })
}) as typeof fetch

// 1. Prefetch a large area (as the download does).
const large = { south: 57.6508, west: 12.2264, north: 57.7092, east: 12.3336 }
await fetchLandCover(large)
ok('förhämtningen gjorde ett nätanrop', calls === 1, `${calls} anrop`)

// 2. A scan in the middle of it must not go to the network.
const inside = { south: 57.6700, west: 12.2700, north: 57.6900, east: 12.2900 }
const a = await fetchLandCover(inside)
ok('skanning inuti träffar cachen', calls === 1, `${calls} anrop totalt`)
ok('  och får faktiskt data', a.areas.length === 1 && a.paths.length === 1,
   `${a.areas.length} ytor, ${a.paths.length} stigar`)

// 3. A scan reaching outside must fetch anew.
const outside = { south: 57.7000, west: 12.2700, north: 57.7500, east: 12.2900 }
await fetchLandCover(outside)
ok('skanning utanför hämtar nytt', calls === 2, `${calls} anrop totalt`)

// 4. Exactly the same box again — an ordinary cache hit.
await fetchLandCover(inside)
ok('upprepad skanning ger inget nytt anrop', calls === 2, `${calls} anrop totalt`)

// 5. The edges: a box exactly touching the prefetched one counts as inside.
const edge = { south: large.south, west: large.west, north: large.north, east: large.east }
await fetchLandCover(edge)
ok('identisk ruta räknas som täckt', calls === 2, `${calls} anrop totalt`)

console.log(failures ? `\n${failures} test misslyckades` : '\nFörhämtningen träffar som den ska')
process.exit(failures ? 1 : 0)
