import 'fake-indexeddb/auto'
import { fetchLandCover, LAND_TYPE_NAME } from '../src/data/overpass.ts'
const t0 = Date.now()
try {
  const lc = await fetchLandCover({ south: 57.66, north: 57.70, west: 12.25, east: 12.32 })
  const counts = new Map<string, number>()
  for (const a of lc.areas) counts.set(a.landType, (counts.get(a.landType) ?? 0) + 1)
  console.log(`  hämtat på ${((Date.now() - t0) / 1000).toFixed(1)} s — ${lc.areas.length} ytor, ${lc.paths.length} stigar`)
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5))
    console.log(`    ${LAND_TYPE_NAME[k as never]}: ${v}`)
} catch (e) {
  console.log('  FEL:', e instanceof Error ? e.message : e)
}
