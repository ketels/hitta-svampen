/**
 * Kartlager med offline-stöd.
 *
 * Rutor som laddats hem i förväg ligger i IndexedDB och används först. Utan
 * täckning fungerar kartan då ändå — vilket är hela poängen, eftersom det
 * sällan finns mobilnät där svampen står.
 */

import L from 'leaflet'
import { hamtaRuta, sparaRuta } from '../lib/db.ts'
import type { Kartlager } from '../state/app.tsx'

export type Lagerdef = {
  id: Kartlager
  namn: string
  url: string
  maxZoom: number
  attribution: string
  /** Esri byter ordning på x och y i sin sökväg. */
  omvandY?: boolean
}

export const LAGER: Record<Kartlager, Lagerdef> = {
  topo: {
    id: 'topo',
    namn: 'Terräng',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution:
      '© <a href="https://opentopomap.org">OpenTopoMap</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellit: {
    id: 'satellit',
    namn: 'Satellit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution: 'Bilder © Esri, Maxar, Earthstar Geographics',
    omvandY: true,
  },
  karta: {
    id: 'karta',
    namn: 'Karta',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
}

export function rutnyckel(lager: Kartlager, z: number, x: number, y: number) {
  return `${lager}/${z}/${x}/${y}`
}

export function rutURL(def: Lagerdef, z: number, x: number, y: number) {
  const s = ['a', 'b', 'c'][(x + y) % 3]!
  return def.url
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

/** Leaflet-lager som läser sparade rutor först och nätet i andra hand. */
const OfflineLager = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, klar: L.DoneCallback) {
    const bild = document.createElement('img')
    bild.alt = ''
    bild.setAttribute('role', 'presentation')

    const def = (this.options as unknown as { def: Lagerdef }).def
    const nyckel = rutnyckel(def.id, coords.z, coords.x, coords.y)
    let objektURL: string | null = null

    const stad = () => {
      if (objektURL) {
        URL.revokeObjectURL(objektURL)
        objektURL = null
      }
    }
    bild.addEventListener('load', () => {
      klar(undefined, bild)
      // Låt bilden hinna dekodas innan URL:en släpps.
      setTimeout(stad, 1200)
    })
    bild.addEventListener('error', () => {
      stad()
      klar(new Error('rutan gick inte att läsa'), bild)
    })

    void (async () => {
      try {
        const sparad = await hamtaRuta(nyckel)
        if (sparad) {
          objektURL = URL.createObjectURL(sparad)
          bild.src = objektURL
          return
        }
      } catch {
        /* faller igenom till nätet */
      }
      // Inget crossOrigin: vi läser aldrig pixlar ur bakgrundskartan, och med
      // attributet satt slutar rutorna laddas helt om en kakelserver någon
      // gång skulle sluta skicka CORS-huvuden.
      bild.src = rutURL(def, coords.z, coords.x, coords.y)
    })()

    return bild
  },
}) as unknown as new (def: Lagerdef) => L.TileLayer

export function skapaLager(def: Lagerdef): L.TileLayer {
  return new (OfflineLager as unknown as new (url: string, opt: L.TileLayerOptions) => L.TileLayer)(
    def.url,
    {
      maxZoom: def.maxZoom,
      maxNativeZoom: def.maxZoom,
      attribution: def.attribution,
      // Håller kartan användbar när man zoomar in längre än underlaget räcker.
      keepBuffer: 3,
      updateWhenIdle: false,
      def,
    } as L.TileLayerOptions & { def: Lagerdef },
  )
}

/** Hämtar hem alla rutor i en ruta och zoomspann, för offline-bruk. */
export async function laddaNedOmrade(
  def: Lagerdef,
  bounds: L.LatLngBounds,
  franZoom: number,
  tillZoom: number,
  framsteg: (klara: number, totalt: number) => void,
  signal: AbortSignal,
): Promise<{ hamtade: number; hoppade: number }> {
  const jobb: { z: number; x: number; y: number }[] = []
  for (let z = franZoom; z <= Math.min(tillZoom, def.maxZoom); z++) {
    const nv = L.CRS.EPSG3857.latLngToPoint(bounds.getNorthWest(), z).divideBy(256).floor()
    const so = L.CRS.EPSG3857.latLngToPoint(bounds.getSouthEast(), z).divideBy(256).floor()
    for (let x = nv.x; x <= so.x; x++) for (let y = nv.y; y <= so.y; y++) jobb.push({ z, x, y })
  }

  let klara = 0
  let hamtade = 0
  let hoppade = 0
  framsteg(0, jobb.length)

  const PARALLELLT = 5
  for (let i = 0; i < jobb.length; i += PARALLELLT) {
    if (signal.aborted) break
    await Promise.all(
      jobb.slice(i, i + PARALLELLT).map(async (j) => {
        const nyckel = rutnyckel(def.id, j.z, j.x, j.y)
        try {
          if (await hamtaRuta(nyckel)) {
            hoppade++
            return
          }
          const svar = await fetch(rutURL(def, j.z, j.x, j.y), { signal })
          if (!svar.ok) return
          await sparaRuta(nyckel, await svar.blob())
          hamtade++
        } catch {
          /* enstaka missar är inte värda att avbryta för */
        } finally {
          klara++
        }
      }),
    )
    framsteg(klara, jobb.length)
  }
  return { hamtade, hoppade }
}

/** Antal rutor ett nedladdningsjobb skulle omfatta. */
export function raknaRutor(bounds: L.LatLngBounds, franZoom: number, tillZoom: number, maxZoom: number) {
  let n = 0
  for (let z = franZoom; z <= Math.min(tillZoom, maxZoom); z++) {
    const nv = L.CRS.EPSG3857.latLngToPoint(bounds.getNorthWest(), z).divideBy(256).floor()
    const so = L.CRS.EPSG3857.latLngToPoint(bounds.getSouthEast(), z).divideBy(256).floor()
    n += (so.x - nv.x + 1) * (so.y - nv.y + 1)
  }
  return n
}
