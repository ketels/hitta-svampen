import './shim.ts'
import 'fake-indexeddb/auto'
import { PNG } from 'pngjs'
import { fetchLandCover, prefetchLandCover, classify, EDITIONS } from '../src/data/landCover.ts'
import { tilesCovering } from '../src/data/vectorTiles.ts'
import { yToLat, xToLon } from '../src/data/elevationTiles.ts'
import { boxAround } from './location.ts'

let failures = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v ? '  ok  ' : ' FAIL '} ${n}${e ? '   ' + e : ''}`); if (!v) failures++ }

/* A fake land cover service. The 2018 edition paints every tile pine forest
   (#6E8C05, class 111); the 2023 edition paints the top half spruce (#2D5F00,
   class 112) and leaves the bottom half transparent. Merged, the top half
   should be spruce and the bottom pine. The vector tile host is down. */
function tile(fill: (row: number) => [number, number, number, number] | null): Buffer {
  const png = new PNG({ width: 256, height: 256 })
  for (let y = 0; y < 256; y++) {
    const c = fill(y)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4
      if (!c) continue
      png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = c[3]
    }
  }
  return PNG.sync.write(png)
}
const pine2018 = tile(() => [0x6e, 0x8c, 0x05, 255])
const spruceTop2023 = tile((y) => (y < 128 ? [0x2d, 0x5f, 0x00, 255] : null))

const calls = { nmd23: 0, nmd18: 0, vector: 0 }
globalThis.fetch = (async (input: string | URL | Request) => {
  const u = String(input instanceof Request ? input.url : input)
  if (u.includes('naturvardsverket')) {
    const newer = u.includes('Bas_2.0')
    if (newer) calls.nmd23++
    else calls.nmd18++
    return new Response(new Uint8Array(newer ? spruceTop2023 : pine2018), {
      status: 200, headers: { 'Content-Type': 'image/png' },
    })
  }
  calls.vector++
  return new Response('nere', { status: 503 })
}) as typeof fetch

const nmdCalls = () => calls.nmd23 + calls.nmd18

// 1. Prefetch a large area (as the download does).
const large = boxAround(0.0292, 0.0536)
const wanted = tilesCovering(large, 13).length
const res = await prefetchLandCover(large, new AbortController().signal, () => {})
ok('förhämtningen hämtade varje ruta i båda utgåvorna', nmdCalls() === wanted * 2,
   `${nmdCalls()} anrop för ${wanted} rutor`)
ok('  och rapporterar dem som hämtade', res.fetched >= wanted, `${res.fetched} hämtade, ${res.failed} misslyckade`)
ok('  vektorrutorna räknas som misslyckade när värden är nere', res.failed > 0 && calls.vector > 0)

// 2. A scan in the middle of it must not go to the land cover service.
const before = nmdCalls()
const inside = boxAround(0.01, 0.01)
const lc = await fetchLandCover(inside)
ok('skanning inuti träffar cachen', nmdCalls() === before, `${nmdCalls() - before} nya anrop`)
ok('  och får marktäckedata', lc.source === 'nmd' && lc.raster !== null, lc.source)
ok('  utan stigar, eftersom vektorvärden är nere', lc.linesMissing && lc.paths.length === 0)

// 3. The two editions are merged: newer on top, older where the newer is blank.
const t = tilesCovering(inside, 13)[0]!
const lon = xToLon(t.x + 0.5, 13)
const upper = lc.raster!.sample(yToLat(t.y + 0.25, 13), lon)
const lower = lc.raster!.sample(yToLat(t.y + 0.75, 13), lon)
ok('övre halvan läser 2023-utgåvan (gran)', upper?.code === 112, `kod ${upper?.code}`)
ok('nedre halvan faller tillbaka på 2018 (tall)', lower?.code === 111, `kod ${lower?.code}`)
ok('  och båda är barrskog med rätt trädslag',
   upper?.landType === 'coniferous' && lower?.landType === 'coniferous' &&
   upper?.treeSpecies.includes('spruce') === true && lower?.treeSpecies.includes('pine') === true)

// 4. A scan reaching outside fetches only the tiles it lacks.
const outside = { ...boxAround(0.01, 0.01), north: large.north + 0.04 }
const need = tilesCovering(outside, 13).filter((a) => !tilesCovering(large, 13).some((b) => a.x === b.x && a.y === b.y)).length
const mark = nmdCalls()
await fetchLandCover(outside)
ok('skanning utanför hämtar bara de nya rutorna', nmdCalls() - mark === need * 2,
   `${nmdCalls() - mark} anrop för ${need} nya rutor`)

// 5. Exactly the same box again — an ordinary cache hit.
const mark2 = nmdCalls()
await fetchLandCover(inside)
ok('upprepad skanning ger inget nytt anrop', nmdCalls() === mark2)

// 6. The colour reading itself: legend colours map, anything else is no data.
const px = new Uint8ClampedArray(256 * 256 * 4)
px.set([0x6e, 0x8c, 0x05, 255], 0)          // pine
px.set([0x12, 0x34, 0x56, 255], 4)          // not in the legend
px.set([0x6e, 0x8c, 0x05, 0], 8)            // transparent
const classes = classify(px, EDITIONS[1]!)
ok('legendfärg blir en klass', classes[0] !== 0)
ok('okänd färg blir ingen data', classes[1] === 0)
ok('genomskinlig pixel blir ingen data', classes[2] === 0)

console.log(failures ? `\n${failures} test misslyckades` : '\nFörhämtningen träffar som den ska')
process.exit(failures ? 1 : 0)
