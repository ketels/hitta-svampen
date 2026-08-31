/**
 * Migration of records saved before the codebase was translated to English.
 *
 * Version 1 stored Swedish object store names, field names and enum values.
 * Renaming them in the code alone would have orphaned every find a user had
 * ever saved, so the shapes are translated on the way out of the old stores.
 *
 * These functions are pure and take `unknown`, because what comes out of an
 * old database is exactly that: whatever the previous version happened to
 * write, including records from even older app versions with fields missing.
 *
 * The same mappings serve a second purpose — importing a JSON backup that was
 * exported by the Swedish version. See `isLegacyExport` in MoreView.
 */

import type { Amount, Find, HabitatSample, Host, LandType, SpeciesId, Track, WeatherSummary } from './types.ts'

/* ---------- Value maps ---------- */

export const LEGACY_SPECIES: Record<string, SpeciesId> = {
  kantarell: 'chanterelle',
  trattkantarell: 'funnel-chanterelle',
  'svart-trumpetsvamp': 'black-trumpet',
  karljohan: 'porcini',
  'blek-taggsvamp': 'hedgehog',
  faarticka: 'sheep-polypore',
  blodriska: 'saffron-milkcap',
  sandsopp: 'velvet-bolete',
  brunsopp: 'bay-bolete',
  annat: 'other',
}

export const LEGACY_AMOUNT: Record<string, Amount> = {
  enstaka: 'few',
  handfull: 'handful',
  korg: 'basket',
  jackpot: 'jackpot',
}

export const LEGACY_LAND_TYPE: Record<string, LandType> = {
  barrskog: 'coniferous',
  lovskog: 'deciduous',
  blandskog: 'mixed',
  skog: 'forest',
  busksnar: 'scrub',
  myr: 'bog',
  ang: 'meadow',
  aker: 'farmland',
  vatten: 'water',
  bebyggt: 'built',
  hygge: 'clearcut',
  okant: 'unknown',
}

export const LEGACY_HOST: Record<string, Host> = {
  gran: 'spruce',
  tall: 'pine',
  bjork: 'birch',
  ek: 'oak',
  bok: 'beech',
  hassel: 'hazel',
  asp: 'aspen',
}

/** Settings keys, old name → new name. */
export const LEGACY_SETTINGS: Record<string, string> = {
  valdArt: 'selectedSpecies',
  kartlager: 'mapLayer',
  visaObservationer: 'showObservations',
  panelOppen: 'panelOpen',
  nattlage: 'nightMode',
  sistaPlats: 'lastPosition',
  senasteSkanning: 'lastScan',
}

/** Map layer ids, which are also the prefix of every saved map tile key. */
export const LEGACY_MAP_LAYER: Record<string, string> = {
  topo: 'topo',
  satellit: 'satellite',
  karta: 'street',
}

/* ---------- Record shapes ---------- */

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && isFinite(v) ? v : fallback

const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? v : null

function migrateHabitat(h: Record<string, unknown>): HabitatSample {
  const trees = Array.isArray(h.tradslag) ? h.tradslag : []
  return {
    lat: num(h.lat, 0),
    lon: num(h.lon, 0),
    landType: LEGACY_LAND_TYPE[String(h.marktyp)] ?? 'unknown',
    elevation: num(h.hojd, 0),
    slope: num(h.lutning, 0),
    aspect: numOrNull(h.vaderstreck),
    twi: num(h.twi, 0),
    toWater: numOrNull(h.tillVatten),
    toEdge: numOrNull(h.tillKant),
    treeSpecies: trees
      .map((t) => LEGACY_HOST[String(t)])
      .filter((t): t is Host => !!t),
  }
}

function migrateWeather(w: Record<string, unknown>): WeatherSummary {
  return {
    rain7: num(w.regn7, 0),
    rain14: num(w.regn14, 0),
    rain30: num(w.regn30, 0),
    soilMoisture: num(w.markfukt, 0),
    soilTemp: num(w.marktemp, 0),
    index: num(w.index, 0),
  }
}

/**
 * Translates one saved find. Returns null for records too broken to place on
 * a map — a find without coordinates is not a find.
 */
export function migrateFind(raw: unknown): Find | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  if (typeof f.lat !== 'number' || typeof f.lon !== 'number' || !f.id) return null

  const habitat = f.habitat && typeof f.habitat === 'object'
    ? migrateHabitat(f.habitat as Record<string, unknown>)
    : undefined
  const weather = f.vader && typeof f.vader === 'object'
    ? migrateWeather(f.vader as Record<string, unknown>)
    : undefined

  return {
    id: String(f.id),
    lat: f.lat,
    lon: f.lon,
    accuracy: numOrNull(f.noggrannhet),
    time: num(f.tid, Date.now()),
    species: LEGACY_SPECIES[String(f.art)] ?? 'other',
    amount: LEGACY_AMOUNT[String(f.mangd)] ?? 'handful',
    note: typeof f.anteckning === 'string' ? f.anteckning : '',
    photos: Array.isArray(f.bilder) ? f.bilder.map(String) : [],
    favorite: f.favorit === true,
    ...(habitat ? { habitat } : {}),
    ...(weather ? { weather } : {}),
  }
}

export function migrateTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (!s.id || !Array.isArray(s.punkter)) return null
  return {
    id: String(s.id),
    name: typeof s.namn === 'string' ? s.namn : '',
    start: num(s.start, 0),
    end: num(s.slut, 0),
    points: s.punkter as Track['points'],
    length: num(s.langd, 0),
  }
}

/**
 * Translates one stored setting's value, not just its key.
 *
 * Several settings hold enum values that were renamed too. Carrying them over
 * verbatim would fail quietly and differently in each case: a stale species id
 * silently selects "Annan svamp", and a stale map layer id resolves to
 * `undefined` in the layer table and takes the map down with it.
 */
export function migrateSettingValue(name: string, value: unknown): unknown {
  switch (name) {
    case 'selectedSpecies':
      return LEGACY_SPECIES[String(value)] ?? 'chanterelle'
    case 'mapLayer':
      return LEGACY_MAP_LAYER[String(value)] ?? 'topo'
    case 'lastPosition': {
      if (!value || typeof value !== 'object') return undefined
      const p = value as Record<string, unknown>
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return undefined
      return {
        lat: p.lat,
        lon: p.lon,
        accuracy: num(p.noggrannhet, 0),
        elevation: numOrNull(p.hojd),
        heading: numOrNull(p.riktning),
        speed: numOrNull(p.fart),
        time: num(p.tid, 0),
      }
    }
    default:
      return value
  }
}

/** Whether a record still uses the Swedish field names. */
export function isLegacyFind(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && 'art' in (raw as object)
}

export function isLegacyTrack(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && 'punkter' in (raw as object)
}
