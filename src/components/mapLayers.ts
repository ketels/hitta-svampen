/**
 * Map layers with offline support.
 *
 * Tiles downloaded in advance live in IndexedDB and are used first. Without
 * coverage the map then works anyway — which is the whole point, since there
 * is rarely a mobile signal where the mushrooms grow.
 */

import L from 'leaflet'
import { loadTile, saveTile } from '../lib/db.ts'
import type { MapLayer } from '../state/app.tsx'

export type LayerDef = {
  id: MapLayer
  name: string
  url: string
  maxZoom: number
  attribution: string
  /** Esri swaps the order of x and y in its path. */
  swapY?: boolean
}

export const LAYERS: Record<MapLayer, LayerDef> = {
  topo: {
    id: 'topo',
    name: 'Terräng',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution:
      '© <a href="https://opentopomap.org">OpenTopoMap</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    id: 'satellite',
    name: 'Satellit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution: 'Bilder © Esri, Maxar, Earthstar Geographics',
    swapY: true,
  },
  street: {
    id: 'street',
    name: 'Karta',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
}

export function tileKey(layer: MapLayer, z: number, x: number, y: number) {
  return `${layer}/${z}/${x}/${y}`
}

export function tileURL(def: LayerDef, z: number, x: number, y: number) {
  const s = ['a', 'b', 'c'][(x + y) % 3]!
  return def.url
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

/** Leaflet layer that reads saved tiles first and the network second. */
const OfflineLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const img = document.createElement('img')
    img.alt = ''
    img.setAttribute('role', 'presentation')

    const def = (this.options as unknown as { def: LayerDef }).def
    const key = tileKey(def.id, coords.z, coords.x, coords.y)
    let objectURL: string | null = null

    const cleanUp = () => {
      if (objectURL) {
        URL.revokeObjectURL(objectURL)
        objectURL = null
      }
    }
    img.addEventListener('load', () => {
      done(undefined, img)
      // Let the image finish decoding before the URL is released.
      setTimeout(cleanUp, 1200)
    })
    img.addEventListener('error', () => {
      cleanUp()
      done(new Error('rutan gick inte att läsa'), img)
    })

    void (async () => {
      try {
        const saved = await loadTile(key)
        if (saved) {
          objectURL = URL.createObjectURL(saved)
          img.src = objectURL
          return
        }
      } catch {
        /* falls through to the network */
      }
      // No crossOrigin: we never read pixels out of the base map, and with the
      // attribute set the tiles would stop loading entirely if a tile server
      // ever stopped sending CORS headers.
      img.src = tileURL(def, coords.z, coords.x, coords.y)
    })()

    return img
  },
}) as unknown as new (def: LayerDef) => L.TileLayer

export function createLayer(def: LayerDef): L.TileLayer {
  return new (OfflineLayer as unknown as new (url: string, opt: L.TileLayerOptions) => L.TileLayer)(
    def.url,
    {
      maxZoom: def.maxZoom,
      maxNativeZoom: def.maxZoom,
      attribution: def.attribution,
      // Keeps the map usable when you zoom in further than the source allows.
      keepBuffer: 3,
      updateWhenIdle: false,
      def,
    } as L.TileLayerOptions & { def: LayerDef },
  )
}

/** Downloads every tile in a box and zoom range, for offline use. */
export async function downloadArea(
  def: LayerDef,
  bounds: L.LatLngBounds,
  fromZoom: number,
  toZoom: number,
  progress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ fetched: number; skipped: number }> {
  const jobs: { z: number; x: number; y: number }[] = []
  for (let z = fromZoom; z <= Math.min(toZoom, def.maxZoom); z++) {
    const nw = L.CRS.EPSG3857.latLngToPoint(bounds.getNorthWest(), z).divideBy(256).floor()
    const se = L.CRS.EPSG3857.latLngToPoint(bounds.getSouthEast(), z).divideBy(256).floor()
    for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) jobs.push({ z, x, y })
  }

  let done = 0
  let fetched = 0
  let skipped = 0
  progress(0, jobs.length)

  const CONCURRENCY = 5
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (signal.aborted) break
    await Promise.all(
      jobs.slice(i, i + CONCURRENCY).map(async (j) => {
        const key = tileKey(def.id, j.z, j.x, j.y)
        try {
          if (await loadTile(key)) {
            skipped++
            return
          }
          const res = await fetch(tileURL(def, j.z, j.x, j.y), { signal })
          if (!res.ok) return
          await saveTile(key, await res.blob())
          fetched++
        } catch {
          /* the odd miss is not worth aborting for */
        } finally {
          done++
        }
      }),
    )
    progress(done, jobs.length)
  }
  return { fetched, skipped }
}

/** How many tiles a download job would cover. */
export function countTilesInArea(
  bounds: L.LatLngBounds,
  fromZoom: number,
  toZoom: number,
  maxZoom: number,
) {
  let n = 0
  for (let z = fromZoom; z <= Math.min(toZoom, maxZoom); z++) {
    const nw = L.CRS.EPSG3857.latLngToPoint(bounds.getNorthWest(), z).divideBy(256).floor()
    const se = L.CRS.EPSG3857.latLngToPoint(bounds.getSouthEast(), z).divideBy(256).floor()
    n += (se.x - nw.x + 1) * (se.y - nw.y + 1)
  }
  return n
}
