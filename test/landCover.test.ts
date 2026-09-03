import './shim.ts'
import 'fake-indexeddb/auto'
import {
  EDITIONS, LAND_TYPE_NAME, classByCode, fetchLandCover,
} from '../src/data/landCover.ts'
import { fetchVectorFeatures } from '../src/data/vectorTiles.ts'
import { bboxAround } from '../src/lib/geo.ts'
import { CENTER } from './location.ts'

/* Runs against the live services: Naturvårdsverket's land cover WMS and
   OpenFreeMap's vector tiles. Checks that the colour tables still match the
   service's legend — the one thing that could silently rot — and that a real
   patch of forest comes back looking like forest. */

let failures = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v ? '  ok  ' : ' FAIL '} ${n}${e ? '   ' + e : ''}`); if (!v) failures++ }

const WMS = 'https://geodata.naturvardsverket.se/inspire/lc-nmd/ows'

type LegendEntry = { label: string; quantity: string; color: string }

console.log('=== Legenden ===')
for (const ed of EDITIONS) {
  const url = `${WMS}?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${ed.wmsLayer}&format=application/json`
  const j = (await (await fetch(url)).json()) as {
    Legend: { rules: { symbolizers: { Raster: { colormap: { entries: LegendEntry[] } } }[] }[] }[]
  }
  const entries = j.Legend[0]!.rules[0]!.symbolizers[0]!.Raster.colormap.entries
  let unknownCodes = 0
  let colourMismatch = 0
  const missingColours: string[] = []
  for (const e of entries) {
    const code = Number(e.quantity)
    const hex = e.color.toUpperCase()
    const cls = classByCode(code)
    if (!cls) { unknownCodes++; continue }
    const ours = ed.legend[hex]
    if (ours === undefined) { missingColours.push(`${hex}=${code}`); continue }
    // Two legend entries may share a colour; then they must at least agree on
    // what kind of ground it is, or the pixel reading would be ambiguous.
    if (ours !== code && classByCode(ours)?.landType !== cls.landType) colourMismatch++
  }
  ok(`${ed.wmsLayer}: alla ${entries.length} klasser är kända`, unknownCodes === 0, `${unknownCodes} okända`)
  ok(`  alla legendfärger finns i tabellen`, missingColours.length === 0, missingColours.join(' '))
  ok(`  ingen färg pekar på fel sorts mark`, colourMismatch === 0, `${colourMismatch} krockar`)
  const extra = Object.keys(ed.legend).filter((h) => !entries.some((e) => e.color.toUpperCase() === h))
  ok(`  tabellen har inga färger som legenden saknar`, extra.length === 0, extra.join(' '))
}

console.log('\n=== Testplatsen ===')
const box = bboxAround(CENTER, 1000)
const t0 = Date.now()
const lc = await fetchLandCover(box, undefined, (d, t) => process.stdout.write(`\r  rutor ${d}/${t}   `))
console.log(`\n  hämtat på ${((Date.now() - t0) / 1000).toFixed(1)} s`)

ok('marktäckedatan kom fram', lc.source === 'nmd' && lc.raster !== null, lc.source)
ok('varje ruta i området har data', lc.raster?.tilesWithData === lc.raster?.tilesWanted,
   `${lc.raster?.tilesWithData} av ${lc.raster?.tilesWanted}`)

const N = 60
const counts = new Map<string, number>()
let withTrees = 0
let noData = 0
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const lat = box.north - (r / (N - 1)) * (box.north - box.south)
    const lon = box.west + (c / (N - 1)) * (box.east - box.west)
    const k = lc.raster!.sample(lat, lon)
    if (!k) { noData++; continue }
    counts.set(k.landType, (counts.get(k.landType) ?? 0) + 1)
    if (k.treeSpecies.length) withTrees++
  }
}
console.log('  Marktyper:')
for (const [t, n] of [...counts].sort((a, b) => b[1] - a[1]))
  console.log(`    ${LAND_TYPE_NAME[t as keyof typeof LAND_TYPE_NAME].padEnd(20)} ${((n / (N * N)) * 100).toFixed(1)}%`)
const forest = (counts.get('coniferous') ?? 0) + (counts.get('mixed') ?? 0) + (counts.get('deciduous') ?? 0)
ok('mest skog, som det ska vara på testplatsen', forest > N * N * 0.5, `${((forest / (N * N)) * 100).toFixed(0)}%`)
ok('trädslag följer med', withTrees > N * N * 0.5)
ok('inga hål i datan', noData === 0, `${noData} tomma`)
ok('okänd mark förekommer inte', !counts.has('unknown'))

console.log('\n=== Stigar och vattendrag ===')
const t1 = Date.now()
const v = await fetchVectorFeatures(box)
console.log(`  ${v.tilesLoaded}/${v.tilesWanted} rutor på ${((Date.now() - t1) / 1000).toFixed(1)} s`)
ok('alla vektorrutor kom fram', v.tilesLoaded === v.tilesWanted)
ok('det finns stigar på testplatsen', v.paths.length >= 10, `${v.paths.length} stigar`)
ok('och något vattendrag', v.waterways.length >= 1, `${v.waterways.length} vattendrag`)
ok('och ytor som reserv', v.areas.length >= 1, `${v.areas.length} ytor`)
ok('skanningen fick med sig stigarna', !lc.linesMissing && lc.paths.length === v.paths.length)

console.log(failures ? `\n${failures} test misslyckades` : '\nMarktäckedatan och vektorrutorna fungerar')
process.exit(failures ? 1 : 0)
