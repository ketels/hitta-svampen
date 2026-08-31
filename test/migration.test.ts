/**
 * Verifies that a version 1 database — written by the Swedish version of the
 * app — survives the rename to English field and store names.
 *
 * This is the one migration where being wrong loses data that took years to
 * gather, so it is checked against a database built the old way rather than
 * against the migration functions in isolation.
 *
 * Run with: node --experimental-strip-types test/migration.test.ts
 */

import 'fake-indexeddb/auto'
import { openDB } from 'idb'

let failures = 0
const ok = (name: string, v: boolean, extra = '') => {
  console.log(`${v ? '  ok  ' : ' FAIL '} ${name}${extra ? '   ' + extra : ''}`)
  if (!v) failures++
}

/* ---------- Build a version 1 database exactly as the old code did ---------- */

const legacyFind = {
  id: 'abc-123',
  lat: 59.7697,
  lon: 17.6581,
  noggrannhet: 12,
  tid: 1723000000000,
  art: 'kantarell',
  mangd: 'korg',
  anteckning: 'Vid den stora granen',
  bilder: ['img-1'],
  favorit: true,
  habitat: {
    lat: 59.7697,
    lon: 17.6581,
    marktyp: 'blandskog',
    hojd: 62.5,
    lutning: 4.2,
    vaderstreck: 210,
    twi: 9.1,
    tillVatten: 85,
    tillKant: 40,
    tradslag: ['gran', 'bjork'],
  },
  vader: { regn7: 12, regn14: 40, regn30: 70, markfukt: 0.29, marktemp: 15.5, index: 0.62 },
}

/** A find saved before habitat enrichment ran — the fields are simply absent. */
const sparseFind = {
  id: 'def-456',
  lat: 57.7,
  lon: 12.3,
  noggrannhet: null,
  tid: 1690000000000,
  art: 'faarticka',
  mangd: 'enstaka',
  anteckning: '',
  bilder: [],
  favorit: false,
}

const legacyTrack = {
  id: 'trk-1',
  namn: '12 augusti',
  start: 1723000000000,
  slut: 1723003600000,
  punkter: [{ lat: 59.77, lon: 17.65, t: 1723000000000, alt: 60 }],
  langd: 2400,
}

const v1 = await openDB('hitta-svampen', 1, {
  upgrade(d) {
    const f = d.createObjectStore('fynd', { keyPath: 'id' })
    f.createIndex('tid', 'tid')
    f.createIndex('art', 'art')
    const s = d.createObjectStore('spar', { keyPath: 'id' })
    s.createIndex('start', 'start')
    d.createObjectStore('bilder')
    d.createObjectStore('cache', { keyPath: 'nyckel' })
    d.createObjectStore('rutor', { keyPath: 'nyckel' })
    d.createObjectStore('installningar')
  },
})

await v1.put('fynd', legacyFind)
await v1.put('fynd', sparseFind)
await v1.put('spar', legacyTrack)
await v1.put('bilder', new Blob(['fake jpeg bytes']), 'img-1')
await v1.put('rutor', { nyckel: 'satellit/14/9000/4600', blob: new Blob(['tile']), tid: 1723000000000 })
await v1.put('rutor', { nyckel: 'topo/14/9000/4600', blob: new Blob(['tile']), tid: 1723000000000 })
await v1.put('installningar', 'trattkantarell', 'valdArt')
await v1.put('installningar', 'satellit', 'kartlager')
await v1.put('installningar', true, 'nattlage')
await v1.put(
  'installningar',
  { lat: 59.77, lon: 17.66, noggrannhet: 8, hojd: 61, riktning: null, fart: 1.2, tid: 1723000000000 },
  'sistaPlats',
)
v1.close()

/* ---------- Open with the current code, which runs the migration ---------- */

const { loadFinds, loadTracks, loadPhoto, loadTile, readSetting, countTiles } =
  await import('../src/lib/db.ts')

const finds = await loadFinds()
const tracks = await loadTracks()

console.log('\n— Fynd —')
ok('båda fynden överlevde', finds.length === 2, `${finds.length} fynd`)

const f = finds.find((x) => x.id === 'abc-123')!
ok('fyndet hittas på sitt id', !!f)
ok('koordinaterna är orörda', f.lat === 59.7697 && f.lon === 17.6581)
ok('noggrannhet -> accuracy', f.accuracy === 12, `${f.accuracy}`)
ok('tid -> time', f.time === 1723000000000)
ok('art kantarell -> chanterelle', f.species === 'chanterelle', f.species)
ok('mangd korg -> basket', f.amount === 'basket', f.amount)
ok('anteckning -> note', f.note === 'Vid den stora granen')
ok('bilder -> photos', f.photos.length === 1 && f.photos[0] === 'img-1')
ok('favorit -> favorite', f.favorite === true)

console.log('\n— Habitat i fyndet —')
const h = f.habitat!
ok('habitat finns kvar', !!h)
ok('marktyp blandskog -> mixed', h.landType === 'mixed', h.landType)
ok('hojd -> elevation', h.elevation === 62.5)
ok('lutning -> slope', h.slope === 4.2)
ok('vaderstreck -> aspect', h.aspect === 210)
ok('twi oförändrat', h.twi === 9.1)
ok('tillVatten -> toWater', h.toWater === 85)
ok('tillKant -> toEdge', h.toEdge === 40)
ok('tradslag -> treeSpecies', JSON.stringify(h.treeSpecies) === JSON.stringify(['spruce', 'birch']),
   JSON.stringify(h.treeSpecies))

console.log('\n— Väder i fyndet —')
const w = f.weather!
ok('regn7/14/30 -> rain7/14/30', w.rain7 === 12 && w.rain14 === 40 && w.rain30 === 70)
ok('markfukt -> soilMoisture', w.soilMoisture === 0.29)
ok('marktemp -> soilTemp', w.soilTemp === 15.5)
ok('index oförändrat', w.index === 0.62)

console.log('\n— Fynd utan habitatdata —')
const sparse = finds.find((x) => x.id === 'def-456')!
ok('fyndet överlevde', !!sparse)
ok('faarticka -> sheep-polypore', sparse.species === 'sheep-polypore', sparse.species)
ok('enstaka -> few', sparse.amount === 'few', sparse.amount)
ok('accuracy blir null', sparse.accuracy === null)
ok('habitat saknas fortfarande', sparse.habitat === undefined)
ok('weather saknas fortfarande', sparse.weather === undefined)

console.log('\n— Spår —')
ok('spåret överlevde', tracks.length === 1)
const t = tracks[0]!
ok('namn -> name', t.name === '12 augusti')
ok('slut -> end', t.end === 1723003600000)
ok('langd -> length', t.length === 2400)
ok('punkter -> points', t.points.length === 1 && t.points[0]!.lat === 59.77)

console.log('\n— Bilder och kartrutor —')
ok('bilden går att läsa på sitt gamla id', (await loadPhoto('img-1')) instanceof Blob)
ok('båda kartrutorna följde med', (await countTiles()) === 2)
ok('topo-rutan har samma nyckel', (await loadTile('topo/14/9000/4600')) instanceof Blob)
ok('satellit -> satellite i rutnyckeln', (await loadTile('satellite/14/9000/4600')) instanceof Blob)

console.log('\n— Inställningar —')
// Både nyckeln och värdet måste översättas. Ett kvarglömt 'satellit' slår upp
// till undefined i lagertabellen och tar ner kartan.
ok('valdArt -> selectedSpecies, med översatt art',
   (await readSetting('selectedSpecies', 'x')) === 'funnel-chanterelle',
   String(await readSetting('selectedSpecies', 'x')))
ok('kartlager -> mapLayer, med översatt lager',
   (await readSetting('mapLayer', 'x')) === 'satellite',
   String(await readSetting('mapLayer', 'x')))
ok('nattlage -> nightMode', (await readSetting('nightMode', false)) === true)

const pos = await readSetting<Record<string, unknown> | null>('lastPosition', null)
ok('sistaPlats -> lastPosition med engelska fält',
   !!pos && pos.accuracy === 8 && pos.elevation === 61 && pos.speed === 1.2 && pos.time === 1723000000000,
   JSON.stringify(pos))
ok('  koordinaterna är orörda', !!pos && pos.lat === 59.77 && pos.lon === 17.66)

console.log('\n— Gamla lager är borta —')
const { db } = await import('../src/lib/db.ts')
const handle = await db()
const names = [...handle.objectStoreNames]
ok('inga svenska lager kvar',
   !names.some((n) => ['fynd', 'spar', 'bilder', 'rutor', 'installningar'].includes(n)),
   names.join(', '))
ok('databasversionen är 2', handle.version === 2, String(handle.version))

console.log(failures ? `\n${failures} test misslyckades` : '\nMigreringen bevarar all fynddata')
process.exit(failures ? 1 : 0)
