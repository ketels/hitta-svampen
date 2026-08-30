/**
 * Områdesskanning: gör om en bit skog till en sannolikhetskarta.
 *
 * Kedjan är: höjdrutnät → terränganalys (lutning, väderstreck, våtindex) →
 * landtäcke från OSM → kända fynd från GBIF och din egen loggbok →
 * habitatpoäng per cell → multiplicerat med dagens fruktsättning och säsong.
 *
 * Tyngdpunkten ligger på att göra det här snabbt nog att vara användbart.
 * Avstånd till vatten, stigar och bryn räknas med avståndstransform på
 * rutnätet i stället för punkt-mot-linje per cell — annars tar en skanning
 * minuter i stället för sekunder.
 */

import { avstand, bboxRunt, iPolygon, meterPerGradLat, meterPerGradLon } from '../lib/geo.ts'
import { analyseraTerrang, cellKoord, skapaDEM, type Terrang } from '../lib/terrang.ts'
import type { BBox, Find, HabitatProv, Host, LatLng, Marktyp, ScanCell, SpeciesId } from '../lib/types.ts'
import { hamtaVader, type Vaderserie } from '../data/vader.ts'
import { Hojdmosaik } from '../data/hojdkakel.ts'
import { hamtaLandtacke, type Landtacke, type Yta } from '../data/overpass.ts'
import { hamtaObservationer, observationsstod, type Observation } from '../data/gbif.ts'
import { art as slaUppArt } from '../data/arter.ts'
import { beraknaHabitat } from './habitat.ts'
import { beraknaFruktsattning, sasongsfaktor, type Fruktsattning } from './fruktsattning.ts'
import { anpassaArt, type Larande } from './personlig.ts'

export type Framsteg = (steg: string, andel: number) => void

export type SkanningsVal = {
  centrum: LatLng
  radieM: number
  art: SpeciesId
  fynd: Find[]
  framsteg?: Framsteg
  signal?: AbortSignal
}

export type Skanning = {
  centrum: LatLng
  radieM: number
  art: SpeciesId
  box: BBox
  rader: number
  kolumner: number
  cellM: number
  /** Celler i rutnätsordning. `null` för celler utanför sökradien. */
  rutnat: (ScanCell | null)[]
  celler: ScanCell[]
  fruktsattning: Fruktsattning
  sasong: number
  vader: Vaderserie
  larande: Larande
  observationer: Observation[]
  tid: number
  /**
   * True när OSM inte gick att nå. Skanningen är fortfarande användbar —
   * terrängen bär det mesta — men den kan inte skilja skog från åker, och
   * det måste synas i gränssnittet i stället för att tyst se ut att fungera.
   */
  landtackeSaknas: boolean
}

/* ---------- Rutnätshjälpare ---------- */

/** Avståndstransform: meter till närmaste markerad cell. Tvåpass chamfer. */
function distansfalt(rader: number, kolumner: number, fro: Uint8Array, cellM: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(rader * kolumner).fill(INF)
  for (let i = 0; i < d.length; i++) if (fro[i]) d[i] = 0
  const a = 1
  const b = Math.SQRT2

  for (let r = 0; r < rader; r++) {
    for (let c = 0; c < kolumner; c++) {
      const i = r * kolumner + c
      let v = d[i]!
      if (r > 0) {
        v = Math.min(v, d[i - kolumner]! + a)
        if (c > 0) v = Math.min(v, d[i - kolumner - 1]! + b)
        if (c < kolumner - 1) v = Math.min(v, d[i - kolumner + 1]! + b)
      }
      if (c > 0) v = Math.min(v, d[i - 1]! + a)
      d[i] = v
    }
  }
  for (let r = rader - 1; r >= 0; r--) {
    for (let c = kolumner - 1; c >= 0; c--) {
      const i = r * kolumner + c
      let v = d[i]!
      if (r < rader - 1) {
        v = Math.min(v, d[i + kolumner]! + a)
        if (c > 0) v = Math.min(v, d[i + kolumner - 1]! + b)
        if (c < kolumner - 1) v = Math.min(v, d[i + kolumner + 1]! + b)
      }
      if (c < kolumner - 1) v = Math.min(v, d[i + 1]! + a)
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! >= INF ? Infinity : d[i]! * cellM
  return d
}

/** Ritar en linje av lat/lon-punkter in i rutnätet. */
function rastreraLinje(
  linje: { lat: number; lon: number }[],
  box: BBox,
  rader: number,
  kolumner: number,
  ut: Uint8Array,
) {
  const tillCell = (p: { lat: number; lon: number }) => ({
    r: ((box.north - p.lat) / (box.north - box.south)) * (rader - 1),
    c: ((p.lon - box.west) / (box.east - box.west)) * (kolumner - 1),
  })
  for (let k = 0; k < linje.length - 1; k++) {
    const a = tillCell(linje[k]!)
    const b = tillCell(linje[k + 1]!)
    const steg = Math.max(1, Math.ceil(Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c)) * 2))
    for (let s = 0; s <= steg; s++) {
      const r = Math.round(a.r + ((b.r - a.r) * s) / steg)
      const c = Math.round(a.c + ((b.c - a.c) * s) / steg)
      if (r < 0 || c < 0 || r >= rader || c >= kolumner) continue
      ut[r * kolumner + c] = 1
    }
  }
}

/** Målar ut marktyp per cell. Ytor med högre prioritet skriver över lägre. */
function rastreraMarktyp(
  lt: Landtacke,
  box: BBox,
  rader: number,
  kolumner: number,
): { marktyp: Marktyp[]; tradslag: Host[][] } {
  const marktyp: Marktyp[] = new Array(rader * kolumner).fill('okant')
  const tradslag: Host[][] = new Array(rader * kolumner).fill(null).map(() => [] as Host[])
  const prio = new Int16Array(rader * kolumner)

  const sorterade = [...lt.ytor].sort((a, b) => a.prioritet - b.prioritet)
  for (const y of sorterade) {
    const r0 = Math.max(0, Math.floor(((box.north - y.box.north) / (box.north - box.south)) * (rader - 1)))
    const r1 = Math.min(rader - 1, Math.ceil(((box.north - y.box.south) / (box.north - box.south)) * (rader - 1)))
    const c0 = Math.max(0, Math.floor(((y.box.west - box.west) / (box.east - box.west)) * (kolumner - 1)))
    const c1 = Math.min(kolumner - 1, Math.ceil(((y.box.east - box.west) / (box.east - box.west)) * (kolumner - 1)))
    if (r1 < r0 || c1 < c0) continue
    for (let r = r0; r <= r1; r++) {
      const lat = box.north - (r / (rader - 1)) * (box.north - box.south)
      for (let c = c0; c <= c1; c++) {
        const i = r * kolumner + c
        if (prio[i]! > y.prioritet) continue
        const lon = box.west + (c / (kolumner - 1)) * (box.east - box.west)
        if (!iPolygon(lat, lon, y.ring)) continue
        marktyp[i] = y.marktyp
        prio[i] = y.prioritet
        if (y.tradslag.length) tradslag[i] = y.tradslag
      }
    }
  }
  return { marktyp, tradslag }
}

const SKOGSTYP = new Set<Marktyp>(['skog', 'barrskog', 'lovskog', 'blandskog'])

/* ---------- Höjdrutnät ---------- */

async function byggDEM(
  box: BBox,
  rader: number,
  kolumner: number,
  cellM: number,
  framsteg: Framsteg | undefined,
  signal: AbortSignal | undefined,
  fran: number,
  till: number,
) {
  // Sikta på kakel som är minst lika finkorniga som rutnätet, så vi inte
  // interpolerar upp data som inte finns.
  const mosaik = await Hojdmosaik.ladda(box, cellM * 0.9, signal, (klara, totalt) =>
    framsteg?.('Hämtar höjddata', fran + ((till - fran) * klara) / Math.max(1, totalt)),
  )

  const z = new Float32Array(rader * kolumner)
  let saknade = 0
  for (let r = 0; r < rader; r++) {
    const lat = box.north - (r / (rader - 1)) * (box.north - box.south)
    for (let c = 0; c < kolumner; c++) {
      const lon = box.west + (c / (kolumner - 1)) * (box.east - box.west)
      const h = mosaik.hojd(lat, lon)
      if (isNaN(h)) saknade++
      z[r * kolumner + c] = h
    }
  }

  // Enstaka luckor vid kakelgränser fylls med grannmedelvärde så att
  // hydrologin inte får hål att fastna i.
  if (saknade > 0) {
    for (let pass = 0; pass < 3 && saknade > 0; pass++) {
      saknade = 0
      for (let r = 0; r < rader; r++) {
        for (let c = 0; c < kolumner; c++) {
          const i = r * kolumner + c
          if (!isNaN(z[i]!)) continue
          let summa = 0
          let n = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr
              const cc = c + dc
              if (rr < 0 || cc < 0 || rr >= rader || cc >= kolumner) continue
              const v = z[rr * kolumner + cc]!
              if (!isNaN(v)) { summa += v; n++ }
            }
          }
          if (n > 0) z[i] = summa / n
          else saknade++
        }
      }
    }
    for (let i = 0; i < z.length; i++) if (isNaN(z[i]!)) z[i] = 0
  }

  return { dem: skapaDEM(box, rader, kolumner, z), mosaik }
}

/* ---------- Skanning ---------- */

export async function skanna(val: SkanningsVal): Promise<Skanning> {
  const { centrum, radieM, fynd, framsteg, signal } = val
  const basArt = slaUppArt(val.art)
  const { art, larande } = anpassaArt(basArt, fynd)

  // Marginal så att vattnets vägar inte kapas vid kanten av rutnätet.
  const marginal = 1.35
  const box = bboxRunt(centrum, radieM * marginal)

  // Höjdkaklen har omkring tio meters upplösning, så rutnätet får vara fint.
  // Taket håller poängsättningen under en sekund även på en telefon.
  const bredM = radieM * 2 * marginal
  const MAX_SIDA = 170
  const MIN_CELL = 16
  const n = Math.min(MAX_SIDA, Math.max(50, Math.round(bredM / MIN_CELL) + 1))
  const rader = n
  const kolumner = n
  const malCell = bredM / (n - 1)

  framsteg?.('Hämtar väderdata', 2)
  const vader = await hamtaVader(centrum.lat, centrum.lon)
  const idagDatum = vader.serie[vader.idag]!.datum
  const fruktsattning = beraknaFruktsattning(vader.serie, art, idagDatum)
  const sasong = sasongsfaktor(art, new Date(), centrum.lat)

  const { dem } = await byggDEM(box, rader, kolumner, malCell, framsteg, signal, 5, 48)

  framsteg?.('Analyserar terräng', 52)
  await paus()
  const terrang: Terrang = analyseraTerrang(dem)

  framsteg?.('Hämtar skogs- och markdata', 62)
  let landtacke: Landtacke
  let landtackeSaknas = false
  try {
    landtacke = await hamtaLandtacke(box, signal)
  } catch {
    // Utan OSM blir det sämre men inte värdelöst — terrängen bär modellen.
    landtacke = { box, ytor: [] as Yta[], vattendrag: [], stigar: [] }
    landtackeSaknas = true
  }

  framsteg?.('Hämtar rapporterade fynd', 80)
  let observationer: Observation[] = []
  try {
    observationer = await hamtaObservationer(box, [val.art], signal)
  } catch {
    observationer = []
  }

  framsteg?.('Poängsätter terrängen', 86)
  await paus()

  const { marktyp, tradslag } = rastreraMarktyp(landtacke, box, rader, kolumner)

  // Avståndsfält för vatten, stigar och skogsbryn.
  const froVatten = new Uint8Array(rader * kolumner)
  for (const l of landtacke.vattendrag) rastreraLinje(l, box, rader, kolumner, froVatten)
  for (const y of landtacke.ytor) if (y.marktyp === 'vatten') rastreraLinje(y.ring, box, rader, kolumner, froVatten)

  const froStig = new Uint8Array(rader * kolumner)
  for (const l of landtacke.stigar) rastreraLinje(l, box, rader, kolumner, froStig)

  const froBryn = new Uint8Array(rader * kolumner)
  for (const y of landtacke.ytor) if (SKOGSTYP.has(y.marktyp)) rastreraLinje(y.ring, box, rader, kolumner, froBryn)

  const dVatten = distansfalt(rader, kolumner, froVatten, dem.cellM)
  const dStig = distansfalt(rader, kolumner, froStig, dem.cellM)
  const dBryn = distansfalt(rader, kolumner, froBryn, dem.cellM)

  const mLat = meterPerGradLat()
  const mLon = meterPerGradLon(centrum.lat)
  const egnaObs = fyndSomObservationer(fynd, val.art)

  const rutnat: (ScanCell | null)[] = new Array(rader * kolumner).fill(null)
  const celler: ScanCell[] = []

  for (let r = 0; r < rader; r++) {
    for (let c = 0; c < kolumner; c++) {
      const i = r * kolumner + c
      const { lat, lon } = cellKoord(dem, r, c)
      if (avstand(centrum, { lat, lon }) > radieM) continue

      const vs = terrang.vaderstreck[i]!
      const prov: HabitatProv = {
        lat,
        lon,
        marktyp: marktyp[i]!,
        hojd: dem.z[i]!,
        lutning: terrang.lutningGrader[i]!,
        vaderstreck: vs < 0 ? null : vs,
        twi: terrang.twi[i]!,
        tillVatten: isFinite(dVatten[i]!) ? dVatten[i]! : null,
        tillKant: Math.min(
          isFinite(dStig[i]!) ? dStig[i]! : Infinity,
          isFinite(dBryn[i]!) ? dBryn[i]! : Infinity,
        ),
        tradslag: tradslag[i]!,
      }
      if (prov.tillKant !== null && !isFinite(prov.tillKant)) prov.tillKant = null

      const gbifStod = observationsstod(observationer, lat, lon, mLat, mLon)
      const egetStod = observationsstod(egnaObs, lat, lon, mLat, mLon)

      const h = beraknaHabitat({
        prov,
        art,
        marktemp: fruktsattning.medelMarktemp,
        gbifStod,
        egetStod,
      })

      const cell: ScanCell = {
        lat,
        lon,
        poang: h.poang,
        habitat: prov,
        stod: gbifStod + egetStod,
      }
      rutnat[i] = cell
      celler.push(cell)
    }
    if (r % 12 === 0) await paus()
  }

  framsteg?.('Klart', 100)

  return {
    centrum,
    radieM,
    art: val.art,
    box,
    rader,
    kolumner,
    cellM: dem.cellM,
    rutnat,
    celler,
    fruktsattning,
    sasong,
    vader,
    larande,
    observationer,
    tid: Date.now(),
    landtackeSaknas,
  }
}

/**
 * Egna fynd översatta till observationsformat. GPS-noggrannheten blir
 * osäkerheten, och mängden avgör vikten — en full korg säger mer om platsen
 * än en ensam liten kantarell.
 */
function fyndSomObservationer(fynd: Find[], art: SpeciesId): Observation[] {
  const vikt: Record<string, number> = { enstaka: 1, handfull: 2, korg: 3, jackpot: 4 }
  const ut: Observation[] = []
  for (const f of fynd) {
    if (f.art !== art) continue
    const d = new Date(f.tid)
    const osakerhet = Math.max(25, Math.min(120, f.noggrannhet ?? 40))
    // Upprepa tunga fynd så de väger mer i summeringen.
    const n = vikt[f.mangd] ?? 1
    for (let k = 0; k < n; k++) {
      ut.push({
        lat: f.lat,
        lon: f.lon,
        art: f.art,
        ar: d.getFullYear(),
        manad: d.getMonth() + 1,
        osakerhet,
        plats: null,
      })
    }
  }
  return ut
}

/** Släpper fram renderingen så gränssnittet inte fryser under tunga loopar. */
const paus = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Slutlig chans i procent: habitatets kvalitet gånger hur mycket som
 * fruktifierar just nu gånger säsongen. Formeln bor bara här.
 */
export function chans(habitat: number, fruktsattningsIndex: number, sasong: number): number {
  return habitat * fruktsattningsIndex * sasong * 100
}

/** Slutlig chans i procent för en cell i en skanning. */
export function chansForCell(s: Skanning, cell: ScanCell): number {
  return chans(cell.poang, s.fruktsattning.index, s.sasong)
}

/**
 * De bästa ställena att gå till, med minsta inbördes avstånd så man får
 * spridda tips i stället för sex prickar på samma kulle.
 *
 * Celler för nära ett fynd du redan sparat hoppas över. De ställena syns
 * ändå som egna markörer på kartan, och ett tips som pekar på en plats du
 * själv hittade i fjol är inget tips. Det här är förslag på nytt mark.
 */
export function bastaStallen(
  s: Skanning,
  antal: number,
  minAvstandM = 140,
  egnaFynd: Find[] = [],
  minstFranEgetM = 90,
): ScanCell[] {
  const relevanta = egnaFynd.filter((f) => f.art === s.art)
  const sorterade = [...s.celler].sort((a, b) => b.poang - a.poang)
  const valda: ScanCell[] = []
  for (const c of sorterade) {
    if (valda.length >= antal) break
    if (valda.some((v) => avstand(v, c) < minAvstandM)) continue
    if (relevanta.some((f) => avstand(f, c) < minstFranEgetM)) continue
    valda.push(c)
  }
  return valda
}

/* ---------- Enskild punkt ---------- */

export type Punktbedomning = {
  punkt: LatLng
  prov: HabitatProv
  habitat: number
  delar: import('../lib/types.ts').Delpoang[]
  fruktsattning: Fruktsattning
  sasong: number
  /** Slutlig chans i procent. */
  chans: number
  vader: Vaderserie
  larande: Larande
  /** True när bedömningen lästes ur en färdig skanning i stället för nätet. */
  franSkanning: boolean
  /** True när OSM inte gick att nå — poängen bygger då bara på terrängen. */
  landtackeSaknas: boolean
}

/** Läser ut en punkt ur en redan gjord skanning. Ögonblickligt. */
export function bedomFranSkanning(
  s: Skanning,
  punkt: LatLng,
  fynd: Find[],
): Punktbedomning | null {
  if (
    punkt.lat < s.box.south || punkt.lat > s.box.north ||
    punkt.lon < s.box.west || punkt.lon > s.box.east
  ) return null

  const r = Math.round(((s.box.north - punkt.lat) / (s.box.north - s.box.south)) * (s.rader - 1))
  const c = Math.round(((punkt.lon - s.box.west) / (s.box.east - s.box.west)) * (s.kolumner - 1))
  if (r < 0 || c < 0 || r >= s.rader || c >= s.kolumner) return null
  const cell = s.rutnat[r * s.kolumner + c]
  if (!cell) return null

  const basArt = slaUppArt(s.art)
  const { art, larande } = anpassaArt(basArt, fynd)
  const mLat = meterPerGradLat()
  const mLon = meterPerGradLon(punkt.lat)
  const h = beraknaHabitat({
    prov: cell.habitat,
    art,
    marktemp: s.fruktsattning.medelMarktemp,
    gbifStod: observationsstod(s.observationer, cell.lat, cell.lon, mLat, mLon),
    egetStod: observationsstod(fyndSomObservationer(fynd, s.art), cell.lat, cell.lon, mLat, mLon),
  })

  return {
    punkt: { lat: cell.lat, lon: cell.lon },
    prov: cell.habitat,
    habitat: h.poang,
    delar: h.delar,
    fruktsattning: s.fruktsattning,
    sasong: s.sasong,
    chans: chans(h.poang, s.fruktsattning.index, s.sasong),
    vader: s.vader,
    larande,
    franSkanning: true,
    landtackeSaknas: s.landtackeSaknas,
  }
}

/**
 * Bedömer en enskild punkt utan färdig skanning. Hämtar bara det lilla område
 * som behövs — men fortfarande stort nog att hydrologin ska bli meningsfull,
 * eftersom vattnets väg till en punkt bestäms av backen ovanför den.
 */
export async function analyseraPunkt(
  punkt: LatLng,
  artId: SpeciesId,
  fynd: Find[],
  signal?: AbortSignal,
): Promise<Punktbedomning> {
  const basArt = slaUppArt(artId)
  const { art, larande } = anpassaArt(basArt, fynd)

  const RADIE = 450
  const box = bboxRunt(punkt, RADIE)
  const N = 91
  const cellM = (RADIE * 2) / (N - 1)

  const vader = await hamtaVader(punkt.lat, punkt.lon)
  const fruktsattning = beraknaFruktsattning(vader.serie, art, vader.serie[vader.idag]!.datum)
  const sasong = sasongsfaktor(art, new Date(), punkt.lat)

  const { dem } = await byggDEM(box, N, N, cellM, undefined, signal, 0, 0)
  const terrang = analyseraTerrang(dem)

  let landtacke: Landtacke
  let landtackeSaknas = false
  try {
    landtacke = await hamtaLandtacke(box, signal)
  } catch {
    landtacke = { box, ytor: [] as Yta[], vattendrag: [], stigar: [] }
    landtackeSaknas = true
  }

  let observationer: Observation[] = []
  try {
    observationer = await hamtaObservationer(box, [artId], signal)
  } catch {
    observationer = []
  }

  const { marktyp, tradslag } = rastreraMarktyp(landtacke, box, N, N)
  const froVatten = new Uint8Array(N * N)
  for (const l of landtacke.vattendrag) rastreraLinje(l, box, N, N, froVatten)
  for (const y of landtacke.ytor) if (y.marktyp === 'vatten') rastreraLinje(y.ring, box, N, N, froVatten)
  const froKant = new Uint8Array(N * N)
  for (const l of landtacke.stigar) rastreraLinje(l, box, N, N, froKant)
  for (const y of landtacke.ytor) if (SKOGSTYP.has(y.marktyp)) rastreraLinje(y.ring, box, N, N, froKant)

  const dVatten = distansfalt(N, N, froVatten, dem.cellM)
  const dKant = distansfalt(N, N, froKant, dem.cellM)

  const r = Math.max(0, Math.min(N - 1, Math.round(((box.north - punkt.lat) / (box.north - box.south)) * (N - 1))))
  const c = Math.max(0, Math.min(N - 1, Math.round(((punkt.lon - box.west) / (box.east - box.west)) * (N - 1))))
  const i = r * N + c
  const vs = terrang.vaderstreck[i]!

  const prov: HabitatProv = {
    lat: punkt.lat,
    lon: punkt.lon,
    marktyp: marktyp[i]!,
    hojd: dem.z[i]!,
    lutning: terrang.lutningGrader[i]!,
    vaderstreck: vs < 0 ? null : vs,
    twi: terrang.twi[i]!,
    tillVatten: isFinite(dVatten[i]!) ? dVatten[i]! : null,
    tillKant: isFinite(dKant[i]!) ? dKant[i]! : null,
    tradslag: tradslag[i]!,
  }

  const mLat = meterPerGradLat()
  const mLon = meterPerGradLon(punkt.lat)
  const h = beraknaHabitat({
    prov,
    art,
    marktemp: fruktsattning.medelMarktemp,
    gbifStod: observationsstod(observationer, punkt.lat, punkt.lon, mLat, mLon),
    egetStod: observationsstod(fyndSomObservationer(fynd, artId), punkt.lat, punkt.lon, mLat, mLon),
  })

  return {
    punkt,
    prov,
    habitat: h.poang,
    delar: h.delar,
    fruktsattning,
    sasong,
    chans: chans(h.poang, fruktsattning.index, sasong),
    vader,
    larande,
    franSkanning: false,
    landtackeSaknas,
  }
}
