import 'fake-indexeddb/auto'
import { hamtaLandtacke, MARKTYP_NAMN } from '../src/data/overpass.ts'
const t0 = Date.now()
try {
  const lt = await hamtaLandtacke({ south: 57.66, north: 57.70, west: 12.25, east: 12.32 })
  const c = new Map<string, number>()
  for (const y of lt.ytor) c.set(y.marktyp, (c.get(y.marktyp) ?? 0) + 1)
  console.log(`  hämtat på ${((Date.now() - t0) / 1000).toFixed(1)} s — ${lt.ytor.length} ytor, ${lt.stigar.length} stigar`)
  for (const [k, v] of [...c].sort((a, b) => b[1] - a[1]).slice(0, 5))
    console.log(`    ${MARKTYP_NAMN[k as never]}: ${v}`)
} catch (e) {
  console.log('  FEL:', e instanceof Error ? e.message : e)
}
