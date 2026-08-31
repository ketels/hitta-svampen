/**
 * Lokal lagring. Allt ligger i webbläsaren — inga konton, ingen server, inget
 * som lämnar telefonen. Fyndplatser är personlig egendom och ska förbli det.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Find, Spar } from './types.ts'

interface SvampDB extends DBSchema {
  fynd: { key: string; value: Find; indexes: { tid: number; art: string } }
  spar: { key: string; value: Spar; indexes: { start: number } }
  bilder: { key: string; value: Blob }
  cache: { key: string; value: { nyckel: string; data: unknown; tid: number; ttl: number } }
  rutor: { key: string; value: { nyckel: string; blob: Blob; tid: number } }
  installningar: { key: string; value: unknown }
}

let dbP: Promise<IDBPDatabase<SvampDB>> | null = null

export function db(): Promise<IDBPDatabase<SvampDB>> {
  if (!dbP) {
    dbP = openDB<SvampDB>('hitta-svampen', 1, {
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
  }
  return dbP
}

export const nyttId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

/* ---------- Fynd ---------- */

export async function sparaFynd(f: Find): Promise<void> {
  await (await db()).put('fynd', f)
}

export async function hamtaFynd(): Promise<Find[]> {
  const alla = await (await db()).getAll('fynd')
  return alla.sort((a, b) => b.tid - a.tid)
}

export async function raderaFynd(id: string): Promise<void> {
  const d = await db()
  const f = await d.get('fynd', id)
  if (f) for (const b of f.bilder) await d.delete('bilder', b)
  await d.delete('fynd', id)
}

/* ---------- Spår ---------- */

export async function sparaSpar(s: Spar): Promise<void> {
  await (await db()).put('spar', s)
}

export async function hamtaSpar(): Promise<Spar[]> {
  const alla = await (await db()).getAll('spar')
  return alla.sort((a, b) => b.start - a.start)
}

export async function raderaSpar(id: string): Promise<void> {
  await (await db()).delete('spar', id)
}

/* ---------- Bilder ---------- */

export async function sparaBild(blob: Blob): Promise<string> {
  const id = nyttId()
  await (await db()).put('bilder', blob, id)
  return id
}

export async function hamtaBild(id: string): Promise<Blob | undefined> {
  return (await db()).get('bilder', id)
}

/* ---------- Nätverkscache ---------- */

/**
 * Höjs när formen på något som cachas ändras — nya fält i väderserien,
 * annan tolkning av OSM-taggar, och så vidare. Utan den här skulle gamla
 * poster ligga kvar och tyst ge appen sämre data än den tror sig ha.
 * Kartrutor och höjdkakel berörs inte; de ligger i en egen lagringsplats
 * och är råa bilder som aldrig ändrar form.
 */
const CACHE_VERSION = 3

const versionerad = (nyckel: string) => `v${CACHE_VERSION}:${nyckel}`

/** Läser ur cachen om posten inte hunnit bli för gammal. */
export async function cacheLas<T>(nyckel: string): Promise<T | null> {
  try {
    const post = await (await db()).get('cache', versionerad(nyckel))
    if (!post) return null
    if (Date.now() - post.tid > post.ttl) return null
    return post.data as T
  } catch {
    return null
  }
}

/** Läser ur cachen även om den är gammal — sista utvägen när nätet är borta. */
export async function cacheLasGammal<T>(nyckel: string): Promise<T | null> {
  try {
    const post = await (await db()).get('cache', versionerad(nyckel))
    return post ? (post.data as T) : null
  } catch {
    return null
  }
}

export async function cacheSkriv(nyckel: string, data: unknown, ttl: number): Promise<void> {
  try {
    await (await db()).put('cache', { nyckel: versionerad(nyckel), data, tid: Date.now(), ttl })
  } catch {
    /* Fullt lagringsutrymme ska aldrig krascha appen. */
  }
}

/**
 * Letar upp en cachepost vars nyckel matchar `prefix` och vars sparade ruta
 * omsluter den efterfrågade. Används av landtäcket: har man förhämtat en
 * hel trakt ska en skanning mitt i den slippa gå ut på nätet igen, trots att
 * dess ruta inte är exakt densamma.
 */
export async function cacheHittaTackande<T>(
  prefix: string,
  box: { south: number; west: number; north: number; east: number },
): Promise<T | null> {
  try {
    const d = await db()
    const nycklar = await d.getAllKeys('cache')
    const nu = Date.now()
    for (const nyckel of nycklar) {
      const k = String(nyckel)
      if (!k.startsWith(`v${CACHE_VERSION}:${prefix}`)) continue
      const delar = k.slice(k.indexOf(prefix) + prefix.length).split(',').map(Number)
      if (delar.length < 4 || delar.some((v) => !isFinite(v))) continue
      const [s2, w2, n2, e2] = delar as [number, number, number, number]
      if (s2 > box.south || w2 > box.west || n2 < box.north || e2 < box.east) continue
      const post = await d.get('cache', k)
      if (!post || nu - post.tid > post.ttl) continue
      return post.data as T
    }
    return null
  } catch {
    return null
  }
}

/** Slänger cacheposter från äldre versioner. Körs en gång vid uppstart. */
export async function stadaCache(): Promise<number> {
  try {
    const d = await db()
    const nycklar = await d.getAllKeys('cache')
    const gamla = nycklar.filter((k) => !String(k).startsWith(`v${CACHE_VERSION}:`))
    for (const k of gamla) await d.delete('cache', k)
    return gamla.length
  } catch {
    return 0
  }
}

/* ---------- Kartrutor för offline ---------- */

export async function sparaRuta(nyckel: string, blob: Blob): Promise<void> {
  try {
    await (await db()).put('rutor', { nyckel, blob, tid: Date.now() })
  } catch {
    /* ignorera */
  }
}

export async function hamtaRuta(nyckel: string): Promise<Blob | undefined> {
  try {
    return (await (await db()).get('rutor', nyckel))?.blob
  } catch {
    return undefined
  }
}

export async function antalRutor(): Promise<number> {
  try {
    return await (await db()).count('rutor')
  } catch {
    return 0
  }
}

export async function rensaRutor(): Promise<void> {
  await (await db()).clear('rutor')
}

/* ---------- Inställningar ---------- */

export async function las<T>(nyckel: string, standard: T): Promise<T> {
  try {
    const v = await (await db()).get('installningar', nyckel)
    return v === undefined ? standard : (v as T)
  } catch {
    return standard
  }
}

export async function skriv(nyckel: string, varde: unknown): Promise<void> {
  await (await db()).put('installningar', varde, nyckel)
}

/**
 * Ber webbläsaren behålla datan.
 *
 * IndexedDB är inte garanterat beständigt. Under lagringsbrist kan
 * webbläsaren vräka det, och Safari rensar dessutom skrivbar lagring efter
 * ungefär en veckas inaktivitet för vanliga webbsidor. Fyndplatser som tagit
 * år att samla ihop ska inte försvinna för att man haft en lugn höst.
 *
 * Webbläsaren avgör själv, utifrån om appen är installerad på hemskärmen,
 * bokmärkt eller flitigt använd. Nekas den får man be igen senare — därför
 * anropas den här både vid start och efter att ett fynd sparats.
 */
export async function begarBestandigLagring(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function arLagringBestandig(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

/** Ungefärlig lagringsanvändning, för inställningsvyn. */
export async function lagringsstatus(): Promise<{ anvant: number; kvot: number }> {
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate()
    return { anvant: e.usage ?? 0, kvot: e.quota ?? 0 }
  }
  return { anvant: 0, kvot: 0 }
}

/* ---------- Senaste skanningen ---------- */

/**
 * Skanningen sparas mellan sessioner. Poängen är offline: när du väl står i
 * skogen utan täckning ska kartan du gjorde vid köksbordet finnas kvar.
 * Rutnätet är stort men ryms gott inom webbläsarens kvot.
 */
export async function sparaSkanning(s: unknown): Promise<void> {
  try {
    await (await db()).put('installningar', s, 'senasteSkanning')
  } catch {
    /* Fullt utrymme ska inte förstöra en färsk skanning i minnet. */
  }
}

export async function hamtaSkanning<T>(): Promise<T | null> {
  try {
    return ((await (await db()).get('installningar', 'senasteSkanning')) as T) ?? null
  } catch {
    return null
  }
}

export async function glomSkanning(): Promise<void> {
  await (await db()).delete('installningar', 'senasteSkanning')
}
