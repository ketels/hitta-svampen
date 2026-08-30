import './shim.ts'
import 'fake-indexeddb/auto'
import { hamtaLandtacke } from '../src/data/overpass.ts'

// Mäter hur snabbt appen ger upp när Overpass inte svarar. Utan tidsbudget
// multiplicerades timeouterna till över två minuter.
for (const [namn, budget] of [['kartklick', 11_000], ['skanning', 22_000]] as [string, number][]) {
  const t0 = Date.now()
  try {
    const lt = await hamtaLandtacke({ south: 59.76, north: 59.78, west: 17.64, east: 17.68 }, undefined, budget)
    console.log(`  ${namn}: lyckades på ${((Date.now() - t0) / 1000).toFixed(1)} s (${lt.ytor.length} ytor)`)
  } catch {
    const gick = (Date.now() - t0) / 1000
    const inomBudget = gick <= budget / 1000 + 2
    console.log(`  ${inomBudget ? 'ok  ' : 'FAIL'} ${namn}: gav upp efter ${gick.toFixed(1)} s (budget ${budget / 1000} s)`)
  }
}
