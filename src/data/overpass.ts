/**
 * Land cover from OpenStreetMap via Overpass.
 *
 * OSM is the only freely available source covering all of Sweden with forest
 * type (`leaf_type`), bogs, watercourses and paths. The tagging is uneven —
 * sometimes it just says "forest" — so classification falls back on cautious
 * assumptions rather than guessing wrong.
 */

import { cacheFindCovering, cacheRead, cacheWrite, cacheReadStale } from '../lib/db.ts'
import { ringBBox } from '../lib/geo.ts'
import type { BBox, Host, LandType, LatLng } from '../lib/types.ts'

/**
 * The app's own proxy. Must come first: Overpass answers 406 to browser-like
 * User-Agents, and a browser may not set that header itself, so the direct
 * mirrors below are unusable from the phone however many of them there are.
 * The proxy identifies itself correctly and also caches the response for a
 * week.
 */
const PROXY = '/api/overpass'

/** Direct mirrors. Work outside the browser — tests and scripts. */
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/** Overpass answers 406 to calls without a User-Agent. The browser sets its
 *  own and ignores ours, but other runtimes need it. */
const AGENT = 'hitta-svampen/1.0 (personlig svampapp)'

/** A healthy mirror answers in under five seconds. Ten is plenty. */
const MIRROR_TIMEOUT_MS = 10_000

/**
 * Ceiling for the whole attempt, retries included.
 *
 * Without it the timeouts multiply: three mirrors over two rounds at 25
 * seconds is more than two minutes before the app gives up — an eternity for
 * someone who just tapped the map. The budget means you quickly get an honest
 * "no map data" instead of a spinner that never stops.
 */
const DEFAULT_BUDGET_MS = 27_000

export type Area = {
  landType: LandType
  ring: LatLng[]
  box: BBox
  treeSpecies: Host[]
  /** Higher wins when areas overlap. */
  priority: number
}

export type LandCover = {
  box: BBox
  areas: Area[]
  waterways: LatLng[][]
  paths: LatLng[][]
}

/* ---------- Classification ---------- */

const SPECIES_PATTERNS: [RegExp, Host][] = [
  [/picea|gran(?!it)/i, 'spruce'],
  [/pinus|\btall\b|\bfuru\b/i, 'pine'],
  [/betula|björk|bjork/i, 'birch'],
  [/quercus|\bek\b|\bekar\b/i, 'oak'],
  [/fagus|\bbok\b/i, 'beech'],
  [/corylus|hassel/i, 'hazel'],
  [/populus|\basp\b/i, 'aspen'],
]

function treeSpeciesFromTags(t: Record<string, string>): Host[] {
  const text = [t.species, t.genus, t.taxon, t['species:sv'], t.name, t.wood]
    .filter(Boolean)
    .join(' ')
  const out = new Set<Host>()
  for (const [re, h] of SPECIES_PATTERNS) if (re.test(text)) out.add(h)
  return [...out]
}

/** Translates OSM tags into a land type we can score. */
export function classify(
  t: Record<string, string>,
): { landType: LandType; priority: number } | null {
  const lu = t.landuse
  const na = t.natural
  const lc = t.landcover

  if (na === 'water' || lu === 'reservoir' || lu === 'basin') return { landType: 'water', priority: 90 }
  if (t.building) return { landType: 'built', priority: 85 }
  if (lu === 'residential' || lu === 'industrial' || lu === 'commercial' || lu === 'retail' ||
      lu === 'quarry' || lu === 'landfill' || lu === 'cemetery' || lu === 'railway')
    return { landType: 'built', priority: 80 }
  if (na === 'wetland') {
    // Bogs and fens are too wet for chanterelles, but the funnel chanterelle
    // tolerates the edges.
    return { landType: 'bog', priority: 75 }
  }
  if (lu === 'farmland' || lu === 'allotments' || lu === 'greenhouse_horticulture' ||
      lu === 'orchard' || lu === 'vineyard' || lu === 'plant_nursery')
    return { landType: 'farmland', priority: 70 }
  if (lu === 'meadow' || lu === 'grass' || lu === 'village_green' || na === 'grassland' ||
      lu === 'recreation_ground' || lu === 'greenfield')
    return { landType: 'meadow', priority: 65 }
  if (na === 'scrub' || na === 'heath' || lc === 'scrub')
    return { landType: 'scrub', priority: 60 }
  if (na === 'bare_rock' || na === 'scree' || na === 'sand' || na === 'glacier')
    return { landType: 'unknown', priority: 60 }

  if (lu === 'forest' || na === 'wood' || lu === 'forestry' || lc === 'trees') {
    const lt = t.leaf_type
    if (lt === 'needleleaved') return { landType: 'coniferous', priority: 45 }
    if (lt === 'broadleaved') return { landType: 'deciduous', priority: 45 }
    if (lt === 'mixed') return { landType: 'mixed', priority: 45 }
    return { landType: 'forest', priority: 40 }
  }
  return null
}

/* ---------- Fetching ---------- */

function query(box: BBox): string {
  const b = `${box.south.toFixed(5)},${box.west.toFixed(5)},${box.north.toFixed(5)},${box.east.toFixed(5)}`
  return `[out:json][timeout:60];
(
  way["landuse"~"^(forest|forestry|meadow|farmland|orchard|vineyard|residential|industrial|commercial|retail|allotments|grass|greenfield|quarry|landfill|cemetery|recreation_ground|basin|reservoir|plant_nursery|village_green)$"](${b});
  way["natural"~"^(wood|wetland|scrub|heath|water|grassland|bare_rock|scree|sand)$"](${b});
  way["landcover"~"^(trees|scrub)$"](${b});
  relation["landuse"~"^(forest|forestry|meadow|farmland|basin|reservoir)$"](${b});
  relation["natural"~"^(wood|wetland|water|scrub|heath)$"](${b});
);
out geom;
(
  way["waterway"~"^(stream|river|ditch|drain|canal)$"](${b});
  way["highway"~"^(path|track|footway|bridleway|cycleway)$"](${b});
);
out geom;`
}

/**
 * Multipolygon relations arrive as loose pieces of the ring, not as finished
 * rings. Treating each piece as its own polygon gives insane results — a lake
 * with two hundred segments becomes two hundred giant polygons covering half
 * the forest. Here the pieces are joined end to end into closed rings.
 */
function joinRings(pieces: LatLng[][]): LatLng[][] {
  const key = (p: LatLng) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`
  const remaining = pieces.filter((b) => b.length >= 2).map((b) => b.slice())
  const rings: LatLng[][] = []

  while (remaining.length) {
    const ring = remaining.pop()!
    let grew = true
    while (grew && key(ring[0]!) !== key(ring[ring.length - 1]!)) {
      grew = false
      const tail = key(ring[ring.length - 1]!)
      for (let i = 0; i < remaining.length; i++) {
        const b = remaining[i]!
        if (key(b[0]!) === tail) {
          ring.push(...b.slice(1))
        } else if (key(b[b.length - 1]!) === tail) {
          ring.push(...b.slice(0, -1).reverse())
        } else continue
        remaining.splice(i, 1)
        grew = true
        break
      }
    }
    // Pieces that cannot be closed are discarded rather than guessed together.
    if (ring.length >= 4 && key(ring[0]!) === key(ring[ring.length - 1]!)) rings.push(ring)
  }
  return rings
}

type OverpassEl = {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[]
}

export async function fetchLandCover(
  box: BBox,
  signal?: AbortSignal,
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<LandCover> {
  const cacheKey = `osm:${box.south.toFixed(3)},${box.west.toFixed(3)},${box.north.toFixed(3)},${box.east.toFixed(3)}`
  const cached = await cacheRead<LandCover>(cacheKey)
  if (cached) return cached

  /* A prefetched area covers the scans you then make inside it. Extra areas
     outside the requested box do no harm — the rasteriser only reads what
     lands in the grid anyway. */
  const covering = await cacheFindCovering<LandCover>('osm:', box)
  if (covering) return covering

  const text = query(box)
  const body = 'data=' + encodeURIComponent(text)
  let lastError: unknown = null

  // In the browser there is only one path that works. Outside it — tests,
  // scripts — we go straight to the mirrors, two rounds since a 502 from
  // Overpass usually just means "come back in a moment".
  const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const attempts: string[] = inBrowser ? [PROXY, PROXY] : [...MIRRORS, ...MIRRORS]
  const roundLength = inBrowser ? 1 : MIRRORS.length
  const deadline = Date.now() + budgetMs

  for (const [i, target] of attempts.entries()) {
    const left = deadline - Date.now()
    if (left <= 1500) break
    if (i === roundLength) await new Promise((r) => setTimeout(r, Math.min(2000, left / 4)))
    const clock = new AbortController()
    const timer = setTimeout(() => clock.abort(), Math.min(MIRROR_TIMEOUT_MS, deadline - Date.now()))
    const relay = () => clock.abort()
    signal?.addEventListener('abort', relay)
    try {
      const res =
        target === PROXY
          ? await fetch(`${PROXY}?data=${encodeURIComponent(text)}`, { signal: clock.signal })
          : await fetch(target, {
              method: 'POST',
              body,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENT },
              signal: clock.signal,
            })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Overpass ${res.status}: ${detail.slice(0, 200).replace(/\s+/g, ' ')}`)
      }
      const j = (await res.json()) as { elements: OverpassEl[] }
      const parsed = parse(j.elements, box)
      if (parsed.areas.length === 0 && parsed.paths.length === 0 && parsed.waterways.length === 0) {
        throw new Error('Overpass svarade tomt')
      }
      // Land cover changes slowly. A week is plenty fresh.
      await cacheWrite(cacheKey, parsed, 7 * 24 * 3600e3)
      return parsed
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', relay)
    }
  }

  const stale = await cacheReadStale<LandCover>(cacheKey)
  if (stale) return stale
  throw lastError ?? new Error('Kunde inte nå Overpass')
}

function parse(elements: OverpassEl[], box: BBox): LandCover {
  const areas: Area[] = []
  const waterways: LatLng[][] = []
  const paths: LatLng[][] = []

  for (const el of elements) {
    const t = el.tags ?? {}

    if (t.waterway) {
      if (el.geometry && el.geometry.length > 1) waterways.push(el.geometry)
      continue
    }
    if (t.highway) {
      if (el.geometry && el.geometry.length > 1) paths.push(el.geometry)
      continue
    }

    const k = classify(t)
    if (!k) continue
    const treeSpecies = treeSpeciesFromTags(t)

    const rings: LatLng[][] = []
    if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
      rings.push(el.geometry)
    } else if (el.type === 'relation' && el.members) {
      // Outer rings are enough for our purposes. Holes in forest areas are
      // rare enough not to be worth the complexity. An empty role is read as
      // outer, which some older Swedish multipolygons use.
      const pieces = el.members
        .filter((m) => (m.role === 'outer' || m.role === '') && m.geometry && m.geometry.length >= 2)
        .map((m) => m.geometry!)
      rings.push(...joinRings(pieces))
    }

    for (const ring of rings) {
      areas.push({ landType: k.landType, ring, box: ringBBox(ring), treeSpecies, priority: k.priority })
    }
  }

  // Water lines also count as "water to be near".
  return { box, areas, waterways, paths }
}

export const LAND_TYPE_NAME: Record<LandType, string> = {
  coniferous: 'Barrskog',
  deciduous: 'Lövskog',
  mixed: 'Blandskog',
  forest: 'Skog',
  scrub: 'Busksnår / hed',
  bog: 'Myr eller kärr',
  meadow: 'Äng eller gräsmark',
  farmland: 'Åker',
  water: 'Vatten',
  built: 'Bebyggt',
  clearcut: 'Hygge',
  unknown: 'Okänt',
}

/* ---------- Prefetching ---------- */

/**
 * How wide an area is prefetched, in metres. The area — and therefore the
 * response size and the load on Overpass — grows quadratically, so this is a
 * trade-off. Six and a half kilometres covers a normal round trip from the car
 * and keeps the response to a size that gets through.
 */
export const PREFETCH_WIDTH_M = 6_500

/** Patient retries. This runs at the kitchen table, not in the forest. */
const RETRY_DELAYS_MS = [4_000, 20_000, 45_000, 90_000]

export type PrefetchState = {
  attempt: number
  ofAttempts: number
  waiting: boolean
  secondsLeft: number
}

/**
 * Fetches the area's land cover in advance and puts it in the cache.
 *
 * Overpass lets roughly two calls per address through before it throttles, and
 * a shared cloud address is often already at the ceiling. Fetching in real
 * time out in the forest is therefore a lottery. This turns it into a
 * preparation step that is allowed to take time: four attempts over a couple
 * of minutes, with a growing pause in between.
 *
 * If it succeeds the response sits in the cache for a week, and scans inside
 * the area find it without going to the network — see `cacheFindCovering`.
 */
export async function prefetchLandCover(
  center: { lat: number; lon: number },
  signal: AbortSignal,
  progress: (state: PrefetchState) => void,
): Promise<boolean> {
  const half = PREFETCH_WIDTH_M / 2
  const dLat = half / 111_320
  const dLon = half / (111_320 * Math.cos((center.lat * Math.PI) / 180))
  const box: BBox = {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lon - dLon,
    east: center.lon + dLon,
  }

  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (signal.aborted) return false
    progress({ attempt: i + 1, ofAttempts: RETRY_DELAYS_MS.length, waiting: false, secondsLeft: 0 })
    try {
      // A generous budget: nobody is standing in the rain waiting for this one.
      await fetchLandCover(box, signal, 40_000)
      return true
    } catch {
      if (i === RETRY_DELAYS_MS.length - 1 || signal.aborted) return false
    }

    // A countdown during the pause, so it is visible that the app has not hung.
    const pause = RETRY_DELAYS_MS[i]!
    const until = Date.now() + pause
    while (Date.now() < until) {
      if (signal.aborted) return false
      progress({
        attempt: i + 1,
        ofAttempts: RETRY_DELAYS_MS.length,
        waiting: true,
        secondsLeft: Math.ceil((until - Date.now()) / 1000),
      })
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return false
}
