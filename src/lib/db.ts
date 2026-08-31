/**
 * Local storage. Everything lives in the browser — no accounts, no server,
 * nothing that leaves the phone. Find locations are personal property and
 * shall remain so.
 */

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'
import type { Find, Track } from './types.ts'
import {
  LEGACY_MAP_LAYER, LEGACY_SETTINGS, migrateFind, migrateSettingValue, migrateTrack,
} from './dbMigrate.ts'

interface MushroomDB extends DBSchema {
  finds: { key: string; value: Find; indexes: { time: number; species: string } }
  tracks: { key: string; value: Track; indexes: { start: number } }
  photos: { key: string; value: Blob }
  cache: { key: string; value: { key: string; data: unknown; time: number; ttl: number } }
  tiles: { key: string; value: { key: string; blob: Blob; time: number } }
  settings: { key: string; value: unknown }
}

/**
 * Version 2 renamed every store and field from Swedish to English. Version 1
 * databases are migrated in place rather than discarded — see `upgradeToV2`.
 */
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<MushroomDB>> | null = null

export function db(): Promise<IDBPDatabase<MushroomDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MushroomDB>('hitta-svampen', DB_VERSION, {
      upgrade(d, oldVersion, _newVersion, tx) {
        createStores(d)
        if (oldVersion === 1) void upgradeToV2(d, tx)
      },
    })
  }
  return dbPromise
}

function createStores(d: IDBPDatabase<MushroomDB>) {
  if (!d.objectStoreNames.contains('finds')) {
    const f = d.createObjectStore('finds', { keyPath: 'id' })
    f.createIndex('time', 'time')
    f.createIndex('species', 'species')
  }
  if (!d.objectStoreNames.contains('tracks')) {
    const s = d.createObjectStore('tracks', { keyPath: 'id' })
    s.createIndex('start', 'start')
  }
  if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos')
  if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache', { keyPath: 'key' })
  if (!d.objectStoreNames.contains('tiles')) d.createObjectStore('tiles', { keyPath: 'key' })
  if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings')
}

/**
 * Moves version 1's Swedish stores into the new English ones.
 *
 * Runs inside the upgrade transaction, so either everything lands or nothing
 * does — a half-migrated database would be worse than no migration at all.
 * The old stores are deleted only after their contents have been written, and
 * the network cache is dropped rather than translated: it is regenerable, and
 * its keys carry the old field names inside the cached payloads.
 */
type UpgradeTx = IDBPTransaction<
  MushroomDB,
  ('finds' | 'tracks' | 'photos' | 'cache' | 'tiles' | 'settings')[],
  'versionchange'
>

async function upgradeToV2(d: IDBPDatabase<MushroomDB>, tx: UpgradeTx) {
  const old = tx as unknown as {
    objectStore(name: string): {
      getAll(): Promise<unknown[]>
      getAllKeys(): Promise<IDBValidKey[]>
      get(key: IDBValidKey): Promise<unknown>
    }
  }
  const has = (name: string) => d.objectStoreNames.contains(name as never)

  if (has('fynd')) {
    const finds = tx.objectStore('finds')
    for (const raw of await old.objectStore('fynd').getAll()) {
      const f = migrateFind(raw)
      if (f) await finds.put(f)
    }
  }

  if (has('spar')) {
    const tracks = tx.objectStore('tracks')
    for (const raw of await old.objectStore('spar').getAll()) {
      const s = migrateTrack(raw)
      if (s) await tracks.put(s)
    }
  }

  if (has('bilder')) {
    const photos = tx.objectStore('photos')
    const src = old.objectStore('bilder')
    for (const key of await src.getAllKeys()) {
      const blob = await src.get(key)
      if (blob instanceof Blob) await photos.put(blob, key as string)
    }
  }

  /* Map tiles are keyed `<layer>/<z>/<x>/<y>`, and two of the three layer ids
     changed name. Rewriting the prefix keeps a downloaded offline area usable
     instead of silently making the phone fetch it all again. */
  if (has('rutor')) {
    const tiles = tx.objectStore('tiles')
    for (const raw of await old.objectStore('rutor').getAll()) {
      const r = raw as { nyckel?: unknown; blob?: unknown; tid?: unknown }
      if (typeof r.nyckel !== 'string' || !(r.blob instanceof Blob)) continue
      const slash = r.nyckel.indexOf('/')
      const prefix = slash < 0 ? r.nyckel : r.nyckel.slice(0, slash)
      const key = LEGACY_MAP_LAYER[prefix]
        ? LEGACY_MAP_LAYER[prefix] + r.nyckel.slice(slash)
        : r.nyckel
      await tiles.put({ key, blob: r.blob, time: typeof r.tid === 'number' ? r.tid : Date.now() })
    }
  }

  /* Settings are small and each one has a known new name. Several also hold
     values that were renamed, so the value is translated as well as the key.
     `senasteSkanning` is deliberately not carried over: a saved scan is a deep
     object full of Swedish field names, and re-scanning takes seconds. */
  if (has('installningar')) {
    const settings = tx.objectStore('settings')
    const src = old.objectStore('installningar')
    for (const key of await src.getAllKeys()) {
      const name = LEGACY_SETTINGS[String(key)]
      if (!name || name === 'lastScan') continue
      const raw = await src.get(key)
      if (raw === undefined) continue
      const value = migrateSettingValue(name, raw)
      if (value !== undefined) await settings.put(value, name)
    }
  }

  for (const name of ['fynd', 'spar', 'bilder', 'cache', 'rutor', 'installningar']) {
    if (has(name)) d.deleteObjectStore(name as never)
  }
}

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

/* ---------- Finds ---------- */

export async function saveFind(f: Find): Promise<void> {
  await (await db()).put('finds', f)
}

export async function loadFinds(): Promise<Find[]> {
  const all = await (await db()).getAll('finds')
  return all.sort((a, b) => b.time - a.time)
}

export async function deleteFind(id: string): Promise<void> {
  const d = await db()
  const f = await d.get('finds', id)
  if (f) for (const p of f.photos) await d.delete('photos', p)
  await d.delete('finds', id)
}

/* ---------- Tracks ---------- */

export async function saveTrack(s: Track): Promise<void> {
  await (await db()).put('tracks', s)
}

export async function loadTracks(): Promise<Track[]> {
  const all = await (await db()).getAll('tracks')
  return all.sort((a, b) => b.start - a.start)
}

export async function deleteTrack(id: string): Promise<void> {
  await (await db()).delete('tracks', id)
}

/* ---------- Photos ---------- */

export async function savePhoto(blob: Blob): Promise<string> {
  const id = newId()
  await (await db()).put('photos', blob, id)
  return id
}

export async function loadPhoto(id: string): Promise<Blob | undefined> {
  return (await db()).get('photos', id)
}

/* ---------- Network cache ---------- */

/**
 * Bumped whenever the shape of something cached changes — new fields in the
 * weather series, a different reading of OSM tags, and so on. Without it old
 * entries would linger and quietly feed the app worse data than it believes
 * it has. Map tiles and elevation tiles are unaffected; they live in their own
 * store and are raw images that never change shape.
 *
 * Version 5 is the English rename: the cached payloads are typed objects whose
 * field names all changed.
 */
const CACHE_VERSION = 5

const versioned = (key: string) => `v${CACHE_VERSION}:${key}`

/** Reads from the cache unless the entry has grown too old. */
export async function cacheRead<T>(key: string): Promise<T | null> {
  try {
    const entry = await (await db()).get('cache', versioned(key))
    if (!entry) return null
    if (Date.now() - entry.time > entry.ttl) return null
    return entry.data as T
  } catch {
    return null
  }
}

/** Reads from the cache even when stale — the last resort when the net is gone. */
export async function cacheReadStale<T>(key: string): Promise<T | null> {
  try {
    const entry = await (await db()).get('cache', versioned(key))
    return entry ? (entry.data as T) : null
  } catch {
    return null
  }
}

export async function cacheWrite(key: string, data: unknown, ttl: number): Promise<void> {
  try {
    await (await db()).put('cache', { key: versioned(key), data, time: Date.now(), ttl })
  } catch {
    /* A full storage quota must never crash the app. */
  }
}

/**
 * Finds a cache entry whose key matches `prefix` and whose stored box encloses
 * the requested one. Used by the land cover: having prefetched a whole area, a
 * scan in the middle of it should not have to go back to the network even
 * though its box is not exactly the same.
 */
export async function cacheFindCovering<T>(
  prefix: string,
  box: { south: number; west: number; north: number; east: number },
): Promise<T | null> {
  try {
    const d = await db()
    const keys = await d.getAllKeys('cache')
    const now = Date.now()
    for (const key of keys) {
      const k = String(key)
      if (!k.startsWith(`v${CACHE_VERSION}:${prefix}`)) continue
      const parts = k.slice(k.indexOf(prefix) + prefix.length).split(',').map(Number)
      if (parts.length < 4 || parts.some((v) => !isFinite(v))) continue
      const [s2, w2, n2, e2] = parts as [number, number, number, number]
      if (s2 > box.south || w2 > box.west || n2 < box.north || e2 < box.east) continue
      const entry = await d.get('cache', k)
      if (!entry || now - entry.time > entry.ttl) continue
      return entry.data as T
    }
    return null
  } catch {
    return null
  }
}

/** Discards cache entries from older versions. Runs once at startup. */
export async function pruneCache(): Promise<number> {
  try {
    const d = await db()
    const keys = await d.getAllKeys('cache')
    const stale = keys.filter((k) => !String(k).startsWith(`v${CACHE_VERSION}:`))
    for (const k of stale) await d.delete('cache', k)
    return stale.length
  } catch {
    return 0
  }
}

/* ---------- Map tiles for offline use ---------- */

export async function saveTile(key: string, blob: Blob): Promise<void> {
  try {
    await (await db()).put('tiles', { key, blob, time: Date.now() })
  } catch {
    /* ignore */
  }
}

export async function loadTile(key: string): Promise<Blob | undefined> {
  try {
    return (await (await db()).get('tiles', key))?.blob
  } catch {
    return undefined
  }
}

export async function countTiles(): Promise<number> {
  try {
    return await (await db()).count('tiles')
  } catch {
    return 0
  }
}

export async function clearTiles(): Promise<void> {
  await (await db()).clear('tiles')
}

/* ---------- Settings ---------- */

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await (await db()).get('settings', key)
    return v === undefined ? fallback : (v as T)
  } catch {
    return fallback
  }
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', value, key)
}

/**
 * Asks the browser to keep the data.
 *
 * IndexedDB is not guaranteed to be durable. Under storage pressure the
 * browser may evict it, and Safari additionally clears writable storage after
 * roughly a week of inactivity for ordinary web pages. Find locations that
 * took years to gather must not disappear because of one quiet autumn.
 *
 * The browser decides for itself, based on whether the app is installed to the
 * home screen, bookmarked or used often. If it refuses you can ask again
 * later — which is why this is called both at startup and after a find is
 * saved.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersistent(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

/** Approximate storage usage, for the settings view. */
export async function storageEstimate(): Promise<{ used: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate()
    return { used: e.usage ?? 0, quota: e.quota ?? 0 }
  }
  return { used: 0, quota: 0 }
}

/* ---------- The most recent scan ---------- */

/**
 * The scan is kept between sessions. That is the whole point of offline: once
 * you are out in the forest without coverage, the map you made at the kitchen
 * table should still be there. The grid is large but fits comfortably within
 * the browser's quota.
 */
export async function saveScan(s: unknown): Promise<void> {
  try {
    await (await db()).put('settings', s, 'lastScan')
  } catch {
    /* A full quota must not destroy a fresh scan held in memory. */
  }
}

export async function loadScan<T>(): Promise<T | null> {
  try {
    return ((await (await db()).get('settings', 'lastScan')) as T) ?? null
  } catch {
    return null
  }
}

export async function forgetScan(): Promise<void> {
  await (await db()).delete('settings', 'lastScan')
}
