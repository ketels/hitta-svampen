import './shim.ts'
import 'fake-indexeddb/auto'
import { ElevationMosaic, metresPerPixel } from '../src/data/elevationTiles.ts'
import { CENTER, boxAround } from './location.ts'

let failures = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v?'  ok  ':' FAIL '} ${n}${e?'   '+e:''}`); if(!v) failures++ }

// Known resolutions (256 px tiles).
ok('z0 vid ekvatorn ≈ 156 543 m/px', Math.abs(metresPerPixel(0, 0) - 156543) < 1, metresPerPixel(0,0).toFixed(0))
ok('z13 vid 60°N ≈ 9.6 m/px', Math.abs(metresPerPixel(60, 13) - 9.56) < 0.1, metresPerPixel(60,13).toFixed(2))
ok('z14 vid 60°N ≈ 4.8 m/px', Math.abs(metresPerPixel(60, 14) - 4.78) < 0.1, metresPerPixel(60,14).toFixed(2))

// The zoom choice should land on the finest tile that suffices.
const box = boxAround(0.015, 0.024)
for (const [target, expected] of [[15, 13], [6, 14], [40, 12], [200, 9]] as [number, number][]) {
  const m = await ElevationMosaic.load(box, target)
  ok(`mål ${target} m/px → zoom ${expected}`, m.zoom === expected,
     `fick zoom ${m.zoom} (${m.resolutionM.toFixed(1)} m/px, ${m.tileCount} kakel)`)
}

// The elevation values should match reality.
const m = await ElevationMosaic.load(box, 12)
const here = m.elevation(CENTER.lat, CENTER.lon)
ok('testplatsen ligger på 55–90 m', here > 55 && here < 90, `${here.toFixed(1)} m`)

// Finer tiles should give more detail — measure the variation along a line.
const coarse = await ElevationMosaic.load(box, 300)
let varCoarse = 0, varFine = 0
const transectLon = box.west + 0.006, transectSouth = box.south + 0.005
let prevCoarse = coarse.elevation(transectSouth, transectLon), prevFine = m.elevation(transectSouth, transectLon)
for (let i = 1; i <= 200; i++) {
  const lat = transectSouth + (i / 200) * 0.02
  const c = coarse.elevation(lat, transectLon), f = m.elevation(lat, transectLon)
  varCoarse += Math.abs(c - prevCoarse); varFine += Math.abs(f - prevFine)
  prevCoarse = c; prevFine = f
}
ok('finare kakel ger mer terrängdetalj', varFine > varCoarse * 1.5,
   `zoom ${coarse.zoom}: ${varCoarse.toFixed(1)} m total variation, zoom ${m.zoom}: ${varFine.toFixed(1)} m`)

console.log(failures ? `\n${failures} test misslyckades` : '\nHöjdkakel-tester gröna')
process.exit(failures ? 1 : 0)
