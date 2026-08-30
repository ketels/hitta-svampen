/**
 * Landtäcke från OpenStreetMap via Overpass.
 *
 * OSM är den enda fritt tillgängliga källan som täcker hela Sverige med
 * skogstyp (`leaf_type`), myrar, vattendrag och stigar. Taggningen är ojämn —
 * ibland står det bara "skog" — så klassificeringen faller tillbaka på
 * försiktiga antaganden i stället för att gissa fel.
 */

import { cacheLas, cacheSkriv, cacheLasGammal } from '../lib/db.ts'
import { ringBBox } from '../lib/geo.ts'
import type { BBox, Host, LatLng, Marktyp } from '../lib/types.ts'

/** Flera speglar — om en är överbelastad tar vi nästa. Huvudservern först;
 *  den är snabbast och de andra går ofta ned i timeout. */
const SPEGLAR = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/** Overpass svarar 406 på anrop utan User-Agent. Webbläsaren sätter den själv
 *  och ignorerar vår, men i andra körmiljöer behövs den. */
const AGENT = 'hitta-svampen/1.0 (personlig svampapp)'

/** En frisk spegel svarar på under fem sekunder. Tio räcker gott. */
const SPEGEL_TIMEOUT_MS = 10_000

/**
 * Tak för hela försöket, inklusive omtagningar.
 *
 * Utan det multipliceras timeouterna: tre speglar i två varv à 25 sekunder
 * blir över två minuter innan appen ger upp — en evighet för någon som just
 * tryckt på kartan. Budgeten gör att man snabbt får ett ärligt "kartdatan
 * saknas" i stället för en snurra som aldrig slutar.
 */
const STANDARD_BUDGET_MS = 22_000

export type Yta = {
  marktyp: Marktyp
  ring: LatLng[]
  box: BBox
  tradslag: Host[]
  /** Högre vinner när ytor överlappar. */
  prioritet: number
}

export type Landtacke = {
  box: BBox
  ytor: Yta[]
  vattendrag: LatLng[][]
  stigar: LatLng[][]
}

/* ---------- Klassificering ---------- */

const ARTNYCKLAR: [RegExp, Host][] = [
  [/picea|gran(?!it)/i, 'gran'],
  [/pinus|\btall\b|\bfuru\b/i, 'tall'],
  [/betula|björk|bjork/i, 'bjork'],
  [/quercus|\bek\b|\bekar\b/i, 'ek'],
  [/fagus|\bbok\b/i, 'bok'],
  [/corylus|hassel/i, 'hassel'],
  [/populus|\basp\b/i, 'asp'],
]

function tradslagFranTaggar(t: Record<string, string>): Host[] {
  const text = [t.species, t.genus, t.taxon, t['species:sv'], t.name, t.wood]
    .filter(Boolean)
    .join(' ')
  const ut = new Set<Host>()
  for (const [re, h] of ARTNYCKLAR) if (re.test(text)) ut.add(h)
  return [...ut]
}

/** Översätter OSM-taggar till en marktyp vi kan poängsätta. */
export function klassa(
  t: Record<string, string>,
): { marktyp: Marktyp; prioritet: number } | null {
  const lu = t.landuse
  const na = t.natural
  const lc = t.landcover

  if (na === 'water' || lu === 'reservoir' || lu === 'basin') return { marktyp: 'vatten', prioritet: 90 }
  if (t.building) return { marktyp: 'bebyggt', prioritet: 85 }
  if (lu === 'residential' || lu === 'industrial' || lu === 'commercial' || lu === 'retail' ||
      lu === 'quarry' || lu === 'landfill' || lu === 'cemetery' || lu === 'railway')
    return { marktyp: 'bebyggt', prioritet: 80 }
  if (na === 'wetland') {
    // Mossar och kärr är för blöta för kantarell, men trattkantarellen tål kanterna.
    return { marktyp: 'myr', prioritet: 75 }
  }
  if (lu === 'farmland' || lu === 'allotments' || lu === 'greenhouse_horticulture' ||
      lu === 'orchard' || lu === 'vineyard' || lu === 'plant_nursery')
    return { marktyp: 'aker', prioritet: 70 }
  if (lu === 'meadow' || lu === 'grass' || lu === 'village_green' || na === 'grassland' ||
      lu === 'recreation_ground' || lu === 'greenfield')
    return { marktyp: 'ang', prioritet: 65 }
  if (na === 'scrub' || na === 'heath' || lc === 'scrub')
    return { marktyp: 'busksnar', prioritet: 60 }
  if (na === 'bare_rock' || na === 'scree' || na === 'sand' || na === 'glacier')
    return { marktyp: 'okant', prioritet: 60 }

  if (lu === 'forest' || na === 'wood' || lu === 'forestry' || lc === 'trees') {
    const lt = t.leaf_type
    if (lt === 'needleleaved') return { marktyp: 'barrskog', prioritet: 45 }
    if (lt === 'broadleaved') return { marktyp: 'lovskog', prioritet: 45 }
    if (lt === 'mixed') return { marktyp: 'blandskog', prioritet: 45 }
    return { marktyp: 'skog', prioritet: 40 }
  }
  return null
}

/* ---------- Hämtning ---------- */

function fraga(box: BBox): string {
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
 * Multipolygonrelationer levereras som lösa bitar av ringen, inte som färdiga
 * ringar. Att behandla varje bit som en egen polygon ger vansinniga resultat —
 * en sjö med tvåhundra delsträckor blir tvåhundra jättepolygoner som täcker
 * halva skogen. Här fogas bitarna ihop ände mot ände till slutna ringar.
 */
function fogaRingar(bitar: LatLng[][]): LatLng[][] {
  const nyckel = (p: LatLng) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`
  const kvar = bitar.filter((b) => b.length >= 2).map((b) => b.slice())
  const ringar: LatLng[][] = []

  while (kvar.length) {
    const ring = kvar.pop()!
    let vaxte = true
    while (vaxte && nyckel(ring[0]!) !== nyckel(ring[ring.length - 1]!)) {
      vaxte = false
      const slut = nyckel(ring[ring.length - 1]!)
      for (let i = 0; i < kvar.length; i++) {
        const b = kvar[i]!
        if (nyckel(b[0]!) === slut) {
          ring.push(...b.slice(1))
        } else if (nyckel(b[b.length - 1]!) === slut) {
          ring.push(...b.slice(0, -1).reverse())
        } else continue
        kvar.splice(i, 1)
        vaxte = true
        break
      }
    }
    // Bitar som inte går att sluta kastas hellre än att gissas ihop.
    if (ring.length >= 4 && nyckel(ring[0]!) === nyckel(ring[ring.length - 1]!)) ringar.push(ring)
  }
  return ringar
}

type OverpassEl = {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[]
}

export async function hamtaLandtacke(
  box: BBox,
  signal?: AbortSignal,
  budgetMs = STANDARD_BUDGET_MS,
): Promise<Landtacke> {
  const nyckel = `osm:${box.south.toFixed(3)},${box.west.toFixed(3)},${box.north.toFixed(3)},${box.east.toFixed(3)}`
  const cachad = await cacheLas<Landtacke>(nyckel)
  if (cachad) return cachad

  const kropp = 'data=' + encodeURIComponent(fraga(box))
  let sistaFel: unknown = null

  // Overpass är gratis och därefter belastad. Ett 502 betyder oftast bara
  // "kom tillbaka om en stund", så vi går varvet runt två gånger.
  const forsok: string[] = [...SPEGLAR, ...SPEGLAR]
  const slutTid = Date.now() + budgetMs

  for (const [i, spegel] of forsok.entries()) {
    const kvar = slutTid - Date.now()
    if (kvar <= 1500) break
    if (i === SPEGLAR.length) await new Promise((r) => setTimeout(r, Math.min(2000, kvar / 4)))
    const klocka = new AbortController()
    const avbryt = setTimeout(() => klocka.abort(), Math.min(SPEGEL_TIMEOUT_MS, slutTid - Date.now()))
    const koppla = () => klocka.abort()
    signal?.addEventListener('abort', koppla)
    try {
      const svar = await fetch(spegel, {
        method: 'POST',
        body: kropp,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENT },
        signal: klocka.signal,
      })
      if (!svar.ok) {
        const text = await svar.text().catch(() => '')
        throw new Error(`Overpass ${svar.status}: ${text.slice(0, 300).replace(/\s+/g, ' ')}`)
      }
      const j = (await svar.json()) as { elements: OverpassEl[] }
      const res = tolka(j.elements, box)
      if (res.ytor.length === 0 && res.stigar.length === 0 && res.vattendrag.length === 0) {
        throw new Error('Overpass svarade tomt')
      }
      // Landtäcke ändrar sig långsamt. En vecka är gott om färskhet.
      await cacheSkriv(nyckel, res, 7 * 24 * 3600e3)
      return res
    } catch (e) {
      if (signal?.aborted) throw e
      sistaFel = e
    } finally {
      clearTimeout(avbryt)
      signal?.removeEventListener('abort', koppla)
    }
  }

  const gammal = await cacheLasGammal<Landtacke>(nyckel)
  if (gammal) return gammal
  throw sistaFel ?? new Error('Kunde inte nå Overpass')
}

function tolka(element: OverpassEl[], box: BBox): Landtacke {
  const ytor: Yta[] = []
  const vattendrag: LatLng[][] = []
  const stigar: LatLng[][] = []

  for (const el of element) {
    const t = el.tags ?? {}

    if (t.waterway) {
      if (el.geometry && el.geometry.length > 1) vattendrag.push(el.geometry)
      continue
    }
    if (t.highway) {
      if (el.geometry && el.geometry.length > 1) stigar.push(el.geometry)
      continue
    }

    const k = klassa(t)
    if (!k) continue
    const tradslag = tradslagFranTaggar(t)

    const ringar: LatLng[][] = []
    if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
      ringar.push(el.geometry)
    } else if (el.type === 'relation' && el.members) {
      // Yttre ringar räcker för vårt ändamål. Hål i skogsytor är sällsynta nog
      // att inte vara värda komplexiteten. Tom roll tolkas som yttre, vilket
      // en del äldre multipolygoner i Sverige använder.
      const bitar = el.members
        .filter((m) => (m.role === 'outer' || m.role === '') && m.geometry && m.geometry.length >= 2)
        .map((m) => m.geometry!)
      ringar.push(...fogaRingar(bitar))
    }

    for (const ring of ringar) {
      ytor.push({ marktyp: k.marktyp, ring, box: ringBBox(ring), tradslag, prioritet: k.prioritet })
    }
  }

  // Vattenlinjer räknas också som "vatten att vara nära".
  return { box, ytor, vattendrag, stigar }
}

export const MARKTYP_NAMN: Record<Marktyp, string> = {
  barrskog: 'Barrskog',
  lovskog: 'Lövskog',
  blandskog: 'Blandskog',
  skog: 'Skog',
  busksnar: 'Busksnår / hed',
  myr: 'Myr eller kärr',
  ang: 'Äng eller gräsmark',
  aker: 'Åker',
  vatten: 'Vatten',
  bebyggt: 'Bebyggt',
  hygge: 'Hygge',
  okant: 'Okänt',
}
