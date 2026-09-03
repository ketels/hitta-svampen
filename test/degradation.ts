import './shim.ts'
import 'fake-indexeddb/auto'
import { scan } from '../src/model/scan.ts'
import { CENTER } from './location.ts'

// Simulate both land cover sources being down by blocking just those hosts.
const realFetch = globalThis.fetch
globalThis.fetch = ((url: string | URL | Request, ...rest: unknown[]) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('naturvardsverket') || u.includes('openfreemap')) return Promise.reject(new TypeError('Failed to fetch'))
  return realFetch(url as never, ...(rest as []))
}) as typeof fetch

const s = await scan({ center: CENTER, radiusM: 800, species: 'chanterelle', finds: [] })

let failures = 0
const ok = (n: string, v: boolean, e = '') => { console.log(`${v?'  ok  ':' FAIL '} ${n}${e?'   '+e:''}`); if(!v) failures++ }

ok('skanningen kraschar inte utan kartdata', s.cells.length > 500, `${s.cells.length} celler`)
ok('flaggan sätts', s.landCoverMissing === true)
ok('alla celler blir okänd marktyp', s.cells.every(c => c.habitat.landType === 'unknown'))
ok('terrängen ger fortfarande variation', new Set(s.cells.map(c => c.score.toFixed(2))).size > 15,
   `${new Set(s.cells.map(c => c.score.toFixed(2))).size} nivåer`)
const v = s.cells.map(c => c.score).sort((a, b) => a - b)
ok('poängen är rimliga', v[0]! > 0.1 && v[v.length-1]! < 0.95,
   `${(v[0]!*100).toFixed(0)}–${(v[v.length-1]!*100).toFixed(0)}%`)

console.log(failures ? `\n${failures} test misslyckades` : '\nDegraderingen fungerar och flaggas')
process.exit(failures ? 1 : 0)
