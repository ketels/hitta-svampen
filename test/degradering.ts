import './shim.ts'
import 'fake-indexeddb/auto'
import { skanna } from '../src/model/skanning.ts'

// Simulera att Overpass är nere genom att blockera just den värden.
const riktigFetch = globalThis.fetch
globalThis.fetch = ((url: string | URL | Request, ...rest: unknown[]) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('overpass')) return Promise.reject(new TypeError('Failed to fetch'))
  return riktigFetch(url as never, ...(rest as []))
}) as typeof fetch

const s = await skanna({ centrum: { lat: 59.7697, lon: 17.6581 }, radieM: 800, art: 'kantarell', fynd: [] })

let fel = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v?'  ok  ':' FAIL '} ${n}${e?'   '+e:''}`); if(!v) fel++ }

ok('skanningen kraschar inte utan OSM', s.celler.length > 500, `${s.celler.length} celler`)
ok('flaggan sätts', s.landtackeSaknas === true)
ok('alla celler blir okänd marktyp', s.celler.every(c => c.habitat.marktyp === 'okant'))
ok('terrängen ger fortfarande variation', new Set(s.celler.map(c => c.poang.toFixed(2))).size > 15,
   `${new Set(s.celler.map(c => c.poang.toFixed(2))).size} nivåer`)
const v = s.celler.map(c=>c.poang).sort((a,b)=>a-b)
ok('poängen är rimliga', v[0]! > 0.1 && v[v.length-1]! < 0.95,
   `${(v[0]!*100).toFixed(0)}–${(v[v.length-1]!*100).toFixed(0)}%`)

console.log(fel ? `\n${fel} test misslyckades` : '\nDegraderingen fungerar och flaggas')
process.exit(fel ? 1 : 0)
