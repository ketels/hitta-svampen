import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../state/app.tsx'
import { LAYERS, createLayer } from './mapLayers.ts'
import { species as lookupSpecies } from '../data/species.ts'
import { speciesSvgMarkup, iconInk } from './SpeciesIcons.tsx'
import { heatAlpha, heatRGB } from '../lib/color.ts'
import type { Find, LatLng } from '../lib/types.ts'
import type { Scan } from '../model/scan.ts'
import { numberedTopPlaces } from '../model/scan.ts'

export type MapHandle = {
  map: L.Map | null
  flyTo: (lat: number, lon: number, zoom?: number) => void
}

type Props = {
  /** What the heatmap is coloured by. */
  heatLayer: 'habitat' | 'chance' | 'off'
  selected: LatLng | null
  onSelect: (p: LatLng | null) => void
  onFind: (f: Find) => void
  followGPS: boolean
  onDragEndsFollow: () => void
  activeTrackPoints: LatLng[] | null
  handle: React.MutableRefObject<MapHandle | null>
}

/* ---------- Heatmap ---------- */

/**
 * Renders the scan to an image laid over the map. The grid is linear in
 * latitude while Leaflet stretches the image in Mercator, but over a few
 * kilometres at our latitudes the difference is less than one pixel.
 */
function heatImage(s: Scan, mode: 'habitat' | 'chance', darkBackground: boolean): string {
  const c = document.createElement('canvas')
  c.width = s.cols
  c.height = s.rows
  const ctx = c.getContext('2d')!
  const image = ctx.createImageData(s.cols, s.rows)
  const d = image.data
  const multiplier = mode === 'chance' ? s.fruiting.index * s.season : 1

  /* Contrast stretching and selection.
     Habitat scores within one and the same forest sit in a narrow band. Paint
     them as they are and the whole map turns a uniform yellow that answers
     nothing of the only question that matters: where should I go right here?
     We therefore stretch the scale over the area's own distribution and draw
     only the better part — the rest is left transparent so the terrain map
     shows through.
     So that a uniformly poor forest does not glow as brightly as a good one,
     the whole layer is damped by the absolute level of the best cells. */
  const sorted = s.cells.map((x) => x.score * multiplier).sort((a, b) => a - b)
  const quantile = (q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0
  // The lower anchor is set high deliberately. Take the median or lower and
  // the fields and lakes drag it down so that essentially the whole forest
  // ends up above the threshold — and then the map glows everywhere and says
  // nothing.
  const low = quantile(0.72)
  const high = quantile(0.99)
  const span = Math.max(0.04, high - low)
  const damping = Math.max(0.35, Math.min(1, high / 0.72))
  // Below this relative level nothing is drawn at all.
  const THRESHOLD = 0.06

  for (let i = 0; i < s.grid.length; i++) {
    const cell = s.grid[i]
    const p = i * 4
    if (!cell) {
      d[p + 3] = 0
      continue
    }
    const relative = Math.max(0, Math.min(1, (cell.score * multiplier - low) / span))
    if (relative <= THRESHOLD) {
      d[p + 3] = 0
      continue
    }
    const t = (relative - THRESHOLD) / (1 - THRESHOLD)
    const [r, g, b] = heatRGB(t, darkBackground)
    d[p] = r
    d[p + 1] = g
    d[p + 2] = b
    d[p + 3] = Math.round(255 * heatAlpha(t) * damping)
  }
  ctx.putImageData(image, 0, 0)
  return c.toDataURL()
}

/* ---------- Markers ---------- */

function findIcon(f: Find): L.DivIcon {
  const sp = lookupSpecies(f.species)
  const large = f.amount === 'basket' || f.amount === 'jackpot'
  return L.divIcon({
    className: '',
    html: `<div class="m-find${large ? ' large' : ''}${f.favorite ? ' favorite' : ''}" style="--f:${sp.color}">
             ${speciesSvgMarkup(f.species, iconInk(sp.color), large ? 19 : 15)}</div>`,
    iconSize: [large ? 34 : 28, large ? 34 : 28],
    iconAnchor: [large ? 17 : 14, large ? 17 : 14],
  })
}

const topIcon = (n: number) =>
  L.divIcon({
    className: '',
    html: `<div class="m-top">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

const obsIcon = L.divIcon({ className: '', html: '<div class="m-obs"></div>', iconSize: [9, 9], iconAnchor: [4.5, 4.5] })

const selectedIcon = L.divIcon({
  className: '',
  html: '<div class="m-selected"><i></i></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const targetIcon = L.divIcon({
  className: '',
  html: '<div class="m-target"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

/* ---------- Component ---------- */

export function MapCanvas(p: Props) {
  const app = useApp()
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const baseRef = useRef<L.TileLayer | null>(null)

  const heat = useRef<L.ImageOverlay | null>(null)
  const gGps = useRef<L.LayerGroup | null>(null)
  const gFinds = useRef<L.LayerGroup | null>(null)
  const gObs = useRef<L.LayerGroup | null>(null)
  const gTop = useRef<L.LayerGroup | null>(null)
  const gOther = useRef<L.LayerGroup | null>(null)
  const gTrack = useRef<L.LayerGroup | null>(null)

  // Set as soon as the map has been positioned once, or as soon as the user
  // has touched it — after that no automation may move the view behind
  // anyone's back.
  const hasBeenPlaced = useRef(false)
  const onSelectRef = useRef(p.onSelect)
  const onFindRef = useRef(p.onFind)
  const onDragRef = useRef(p.onDragEndsFollow)
  onSelectRef.current = p.onSelect
  onFindRef.current = p.onFind
  onDragRef.current = p.onDragEndsFollow

  /* --- Create the map once --- */
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    // The middle of Sweden as a starting point; a real position or a saved
    // scan moves the view as soon as they are loaded.
    const start = app.lastPosition ?? { lat: 60.5, lon: 15.5 }
    const map = L.map(boxRef.current, {
      center: [start.lat, start.lon],
      zoom: app.lastPosition ? 15 : 5,
      zoomControl: false,
      attributionControl: true,
      // Inertia makes the map pleasant to fling with a thumb.
      inertia: true,
      maxZoom: 19,
      minZoom: 4,
    })
    map.attributionControl.setPrefix('')

    gTrack.current = L.layerGroup().addTo(map)
    gObs.current = L.layerGroup().addTo(map)
    gTop.current = L.layerGroup().addTo(map)
    gFinds.current = L.layerGroup().addTo(map)
    gOther.current = L.layerGroup().addTo(map)
    gGps.current = L.layerGroup().addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onSelectRef.current({ lat: e.latlng.lat, lon: e.latlng.lng })
    })
    map.on('dragstart', () => {
      hasBeenPlaced.current = true
      onDragRef.current()
    })

    mapRef.current = map
    p.handle.current = {
      map,
      flyTo: (lat, lon, zoom) => map.flyTo([lat, lon], zoom ?? Math.max(map.getZoom(), 15), { duration: 0.8 }),
    }

    // Makes the map reachable from the console during development —
    // invaluable when you want to jump to a particular forest without panning
    // there by hand.
    if (import.meta.env.DEV) {
      ;(window as unknown as { map?: L.Map }).map = map
    }

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(boxRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      p.handle.current = null
    }
    // Deliberately on mount only — the map lives for the app's whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- Opening view ---
     The last known position and the saved scan are read from IndexedDB and so
     arrive a little after the map is created. Without this you would land on
     an overview every time instead of in the forest you were working on. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || hasBeenPlaced.current) return
    const s = app.scan
    const position = app.lastPosition
    if (s) {
      hasBeenPlaced.current = true
      // Zoom so the whole scanned area fits.
      map.fitBounds(
        [
          [s.box.south, s.box.west],
          [s.box.north, s.box.east],
        ],
        { padding: [24, 24], animate: false },
      )
    } else if (position) {
      hasBeenPlaced.current = true
      map.setView([position.lat, position.lon], 15, { animate: false })
    }
  }, [app.scan, app.lastPosition])

  /* --- Base layer --- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (baseRef.current) map.removeLayer(baseRef.current)
    const layer = createLayer(LAYERS[app.mapLayer])
    layer.addTo(map)
    layer.bringToBack()
    baseRef.current = layer
  }, [app.mapLayer])

  /* --- Heatmap --- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (heat.current) {
      map.removeLayer(heat.current)
      heat.current = null
    }
    const s = app.scan
    if (!s || p.heatLayer === 'off') return
    const url = heatImage(s, p.heatLayer, app.mapLayer === 'satellite')
    heat.current = L.imageOverlay(
      url,
      [
        [s.box.south, s.box.west],
        [s.box.north, s.box.east],
      ],
      { opacity: 1, interactive: false, className: 'heatmap' },
    ).addTo(map)
    heat.current.bringToBack()
    // The image is redrawn when the base layer changes, since the ramp is
    // adapted to whether the background is light or dark.
  }, [app.scan, p.heatLayer, app.mapLayer])

  /* --- Top places --- */
  useEffect(() => {
    const g = gTop.current
    if (!g) return
    g.clearLayers()
    const s = app.scan
    if (!s || p.heatLayer === 'off') return
    numberedTopPlaces(s, app.finds).forEach((c, i) => {
      L.marker([c.lat, c.lon], { icon: topIcon(i + 1), zIndexOffset: 500 })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onSelectRef.current({ lat: c.lat, lon: c.lon })
        })
        .addTo(g)
    })
  }, [app.scan, p.heatLayer, app.finds])

  /* --- Your own finds --- */
  useEffect(() => {
    const g = gFinds.current
    if (!g) return
    g.clearLayers()
    for (const f of app.finds) {
      L.marker([f.lat, f.lon], { icon: findIcon(f), zIndexOffset: 700 })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onFindRef.current(f)
        })
        .addTo(g)
    }
  }, [app.finds])

  /* --- Reported finds from GBIF --- */
  useEffect(() => {
    const g = gObs.current
    if (!g) return
    g.clearLayers()
    if (!app.showObservations || !app.scan) return
    for (const o of app.scan.observations) {
      L.marker([o.lat, o.lon], { icon: obsIcon, interactive: false, zIndexOffset: 100 }).addTo(g)
    }
  }, [app.showObservations, app.scan])

  /* --- Selected point and destination --- */
  useEffect(() => {
    const g = gOther.current
    if (!g) return
    g.clearLayers()
    if (p.selected)
      L.marker([p.selected.lat, p.selected.lon], { icon: selectedIcon, interactive: false, zIndexOffset: 800 }).addTo(g)
    if (app.destination)
      L.marker([app.destination.lat, app.destination.lon], { icon: targetIcon, interactive: false, zIndexOffset: 750 }).addTo(g)
    // The search circle shows how far the scan reaches.
    const s = app.scan
    if (s && p.heatLayer !== 'off') {
      L.circle([s.center.lat, s.center.lon], {
        radius: s.radiusM,
        color: '#f2b705',
        weight: 1.2,
        opacity: 0.45,
        fill: false,
        dashArray: '5 7',
        interactive: false,
      }).addTo(g)
    }
  }, [p.selected, app.destination, app.scan, p.heatLayer])

  /* --- Recorded track --- */
  useEffect(() => {
    const g = gTrack.current
    if (!g) return
    g.clearLayers()
    if (p.activeTrackPoints && p.activeTrackPoints.length > 1) {
      L.polyline(
        p.activeTrackPoints.map((q) => [q.lat, q.lon] as [number, number]),
        { color: '#4fa3d9', weight: 4, opacity: 0.85, lineJoin: 'round', interactive: false },
      ).addTo(g)
    }
  }, [p.activeTrackPoints])

  /* --- GPS position --- */
  useEffect(() => {
    const g = gGps.current
    const map = mapRef.current
    if (!g || !map) return
    g.clearLayers()
    const position = app.gps.position
    if (!position) return

    if (position.accuracy > 12) {
      L.circle([position.lat, position.lon], {
        radius: position.accuracy,
        color: '#4fa3d9',
        weight: 1,
        opacity: 0.5,
        fillColor: '#4fa3d9',
        fillOpacity: 0.11,
        interactive: false,
      }).addTo(g)
    }

    const heading = position.heading ?? app.compass.heading
    L.marker([position.lat, position.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="m-gps">${
          heading !== null ? `<i style="transform:rotate(${heading}deg)"></i>` : ''
        }<b></b></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(g)

    if (p.followGPS) {
      hasBeenPlaced.current = true
      map.setView([position.lat, position.lon], Math.max(map.getZoom(), 15), { animate: true })
    }
  }, [app.gps.position, app.compass.heading, p.followGPS])

  return <div className={`map-surface${app.nightMode ? ' night' : ''}`} ref={boxRef} />
}
