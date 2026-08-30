import './shim.ts'
import 'fake-indexeddb/auto'
import { Hojdmosaik, meterPerPixel } from '../src/data/hojdkakel.ts'

let fel = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v?'  ok  ':' FAIL '} ${n}${e?'   '+e:''}`); if(!v) fel++ }

// Kända upplösningar (256 px-kakel).
ok('z0 vid ekvatorn ≈ 156 543 m/px', Math.abs(meterPerPixel(0, 0) - 156543) < 1, meterPerPixel(0,0).toFixed(0))
ok('z13 vid 60°N ≈ 9.6 m/px', Math.abs(meterPerPixel(59.77, 13) - 9.62) < 0.1, meterPerPixel(59.77,13).toFixed(2))
ok('z14 vid 60°N ≈ 4.8 m/px', Math.abs(meterPerPixel(59.77, 14) - 4.81) < 0.1, meterPerPixel(59.77,14).toFixed(2))

// Zoomvalet ska landa på det finaste kakel som räcker.
const box = { south: 59.755, north: 59.785, west: 17.634, east: 17.682 }
for (const [mal, vantad] of [[15, 13], [6, 14], [40, 11], [200, 9]] as [number, number][]) {
  const m = await Hojdmosaik.ladda(box, mal)
  ok(`mål ${mal} m/px → zoom ${vantad}`, m.zoom === vantad, `fick zoom ${m.zoom} (${m.upplosningM.toFixed(1)} m/px, ${m.antalKakel} kakel)`)
}

// Höjdvärdena ska stämma med verkligheten.
const m = await Hojdmosaik.ladda(box, 12)
const lunsen = m.hojd(59.7697, 17.6581)
ok('Lunsen ligger på 50–75 m', lunsen > 50 && lunsen < 75, `${lunsen.toFixed(1)} m`)

// Finare kakel ska ge mer detalj — mät variationen längs en linje.
const grovt = await Hojdmosaik.ladda(box, 300)
let varGrov = 0, varFin = 0
let fg = grovt.hojd(59.760, 17.640), ff = m.hojd(59.760, 17.640)
for (let i = 1; i <= 200; i++) {
  const lat = 59.760 + (i / 200) * 0.02
  const g = grovt.hojd(lat, 17.640), f = m.hojd(lat, 17.640)
  varGrov += Math.abs(g - fg); varFin += Math.abs(f - ff)
  fg = g; ff = f
}
ok('finare kakel ger mer terrängdetalj', varFin > varGrov * 1.5,
   `zoom ${grovt.zoom}: ${varGrov.toFixed(1)} m total variation, zoom ${m.zoom}: ${varFin.toFixed(1)} m`)

console.log(fel ? `\n${fel} test misslyckades` : '\nHöjdkakel-tester gröna')
process.exit(fel ? 1 : 0)
