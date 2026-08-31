import './shim.ts'
import 'fake-indexeddb/auto'
import { fetchLandCover } from '../src/data/overpass.ts'

// Measures how quickly the app gives up when Overpass does not answer. Without
// a time budget the timeouts multiplied to over two minutes.
for (const [name, budget] of [['kartklick', 11_000], ['skanning', 22_000]] as [string, number][]) {
  const t0 = Date.now()
  try {
    const lc = await fetchLandCover({ south: 59.76, north: 59.78, west: 17.64, east: 17.68 }, undefined, budget)
    console.log(`  ${name}: lyckades på ${((Date.now() - t0) / 1000).toFixed(1)} s (${lc.areas.length} ytor)`)
  } catch {
    const elapsed = (Date.now() - t0) / 1000
    const withinBudget = elapsed <= budget / 1000 + 2
    console.log(`  ${withinBudget ? 'ok  ' : 'FAIL'} ${name}: gav upp efter ${elapsed.toFixed(1)} s (budget ${budget / 1000} s)`)
  }
}
