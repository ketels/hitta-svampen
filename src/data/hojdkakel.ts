/**
 * Höjddata från terrängkakel (Terrarium-kodade PNG:er, AWS Open Data).
 *
 * Ett enda kakel innehåller 256×256 höjdvärden — på våra breddgrader ungefär
 * tio meters upplösning. Det är både snabbare och betydligt finkornigare än
 * att fråga ett punkt-API tusen gånger, och kaklen går att spara offline så
 * att terränganalysen fungerar utan täckning.
 *
 * Kodning: höjd = R·256 + G + B/256 − 32768 meter.
 */

import { hamtaRuta, sparaRuta } from '../lib/db.ts'
import type { BBox } from '../lib/types.ts'

const KALLA = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const KAKELSTORLEK = 256

const MIN_ZOOM = 8
/** Zoom 14 ger drygt fem meter per punkt på våra breddgrader. Finare än så
 *  finns sällan riktig data bakom, bara uppsamplade värden. */
const MAX_ZOOM = 14

/* ---------- Web Mercator ---------- */

export const lonTillX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z

export function latTillY(lat: number, z: number): number {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export const xTillLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180

export function yTillLat(y: number, z: number): number {
  const n = Math.PI - 2 * Math.PI * (y / 2 ** z)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Meter per bildpunkt på given latitud och zoom, för 256 bildpunkter breda
 * kakel. Vid ekvatorn är ett kakel på zoom 0 hela jorden: 40 075 017 m
 * fördelat på 256 punkter blir 156 543 m per punkt.
 */
export const meterPerPixel = (lat: number, z: number) =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z

/* ---------- Avkodning ---------- */

let rityta: { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null = null

function hamtaRityta() {
  if (rityta) return rityta
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(KAKELSTORLEK, KAKELSTORLEK)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) return (rityta = { canvas, ctx })
  }
  const canvas = document.createElement('canvas')
  canvas.width = KAKELSTORLEK
  canvas.height = KAKELSTORLEK
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Kan inte skapa rityta för höjddata')
  return (rityta = { canvas, ctx })
}

async function avkoda(blob: Blob): Promise<Float32Array> {
  const bild = await createImageBitmap(blob)
  const { ctx } = hamtaRityta()
  ctx.clearRect(0, 0, KAKELSTORLEK, KAKELSTORLEK)
  ctx.drawImage(bild, 0, 0, KAKELSTORLEK, KAKELSTORLEK)
  bild.close?.()
  const d = ctx.getImageData(0, 0, KAKELSTORLEK, KAKELSTORLEK).data
  const z = new Float32Array(KAKELSTORLEK * KAKELSTORLEK)
  for (let i = 0, p = 0; i < z.length; i++, p += 4) {
    z[i] = d[p]! * 256 + d[p + 1]! + d[p + 2]! / 256 - 32768
  }
  return z
}

const iMinne = new Map<string, Float32Array>()
const pagaende = new Map<string, Promise<Float32Array>>()

async function hamtaKakel(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array> {
  const nyckel = `terr/${z}/${x}/${y}`
  const cachad = iMinne.get(nyckel)
  if (cachad) return cachad
  const pag = pagaende.get(nyckel)
  if (pag) return pag

  const arbete = (async () => {
    const sparad = await hamtaRuta(nyckel)
    if (sparad) {
      const h = await avkoda(sparad)
      iMinne.set(nyckel, h)
      return h
    }
    const svar = await fetch(`${KALLA}/${z}/${x}/${y}.png`, { signal })
    if (!svar.ok) throw new Error(`Höjdkakel ${z}/${x}/${y} svarade ${svar.status}`)
    const blob = await svar.blob()
    await sparaRuta(nyckel, blob)
    const h = await avkoda(blob)
    iMinne.set(nyckel, h)
    return h
  })()

  pagaende.set(nyckel, arbete)
  try {
    return await arbete
  } finally {
    pagaende.delete(nyckel)
  }
}

/* ---------- Mosaik ---------- */

/** Ett hopfogat höjdunderlag som går att sampla var som helst inom sitt område. */
export class Hojdmosaik {
  private kakel = new Map<string, Float32Array>()
  readonly zoom: number
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number

  private constructor(zoom: number, x0: number, y0: number, x1: number, y1: number) {
    this.zoom = zoom
    this.x0 = x0
    this.y0 = y0
    this.x1 = x1
    this.y1 = y1
  }

  /**
   * Laddar alla kakel som täcker rutan. `zoom` väljs så att upplösningen
   * hamnar nära `malUpplosningM` meter per bildpunkt.
   */
  static async ladda(
    box: BBox,
    malUpplosningM: number,
    signal?: AbortSignal,
    framsteg?: (klara: number, totalt: number) => void,
  ): Promise<Hojdmosaik> {
    // Finaste zoom som ger minst den efterfrågade upplösningen — men inte
    // finare än så, varje steg fyrdubblar antalet kakel att hämta.
    const midLat = (box.south + box.north) / 2
    let zoom = MIN_ZOOM
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
      zoom = z
      if (meterPerPixel(midLat, z) <= malUpplosningM) break
    }

    const x0 = Math.floor(lonTillX(box.west, zoom))
    const x1 = Math.floor(lonTillX(box.east, zoom))
    const y0 = Math.floor(latTillY(box.north, zoom))
    const y1 = Math.floor(latTillY(box.south, zoom))

    const m = new Hojdmosaik(zoom, x0, y0, x1, y1)
    const jobb: { x: number; y: number }[] = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobb.push({ x, y })

    let klara = 0
    framsteg?.(0, jobb.length)
    const PARALLELLT = 6
    for (let i = 0; i < jobb.length; i += PARALLELLT) {
      if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
      const grupp = jobb.slice(i, i + PARALLELLT)
      const res = await Promise.all(
        grupp.map(async (j) => {
          try {
            return { j, h: await hamtaKakel(zoom, j.x, j.y, signal) }
          } catch {
            return { j, h: null }
          }
        }),
      )
      for (const { j, h } of res) {
        if (h) m.kakel.set(`${j.x}/${j.y}`, h)
        klara++
      }
      framsteg?.(klara, jobb.length)
    }
    if (m.kakel.size === 0) throw new Error('Kunde inte hämta någon höjddata')
    return m
  }

  /** Höjd i en enskild bildpunkt, eller NaN utanför det laddade området. */
  private punkt(px: number, py: number): number {
    const tx = Math.floor(px / KAKELSTORLEK)
    const ty = Math.floor(py / KAKELSTORLEK)
    const h = this.kakel.get(`${tx}/${ty}`)
    if (!h) return NaN
    const ix = px - tx * KAKELSTORLEK
    const iy = py - ty * KAKELSTORLEK
    return h[iy * KAKELSTORLEK + ix]!
  }

  /** Bilinjärt interpolerad höjd för en koordinat. */
  hojd(lat: number, lon: number): number {
    const fx = lonTillX(lon, this.zoom) * KAKELSTORLEK
    const fy = latTillY(lat, this.zoom) * KAKELSTORLEK
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const a = this.punkt(x0, y0)
    const b = this.punkt(x0 + 1, y0)
    const c = this.punkt(x0, y0 + 1)
    const d = this.punkt(x0 + 1, y0 + 1)
    // Faller tillbaka på närmaste giltiga värde vid kakelkanter som saknas.
    const giltiga = [a, b, c, d].filter((v) => !isNaN(v))
    if (giltiga.length === 0) return NaN
    if (giltiga.length < 4) return giltiga[0]!
    return (
      a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
    )
  }

  get upplosningM(): number {
    return meterPerPixel(yTillLat(this.y0 + 0.5, this.zoom), this.zoom)
  }

  get antalKakel(): number {
    return this.kakel.size
  }
}
