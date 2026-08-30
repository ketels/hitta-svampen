import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../state/app.tsx'
import { LAGER, skapaLager } from './kartlager.ts'
import { art } from '../data/arter.ts'
import { varmeAlfa, varmeRGB } from '../lib/farg.ts'
import type { Find, LatLng } from '../lib/types.ts'
import type { Skanning } from '../model/skanning.ts'
import { bastaStallen } from '../model/skanning.ts'

export type KartHandtag = {
  karta: L.Map | null
  flygTill: (lat: number, lon: number, zoom?: number) => void
}

type Props = {
  /** Vad värmekartan färgas efter. */
  varmelager: 'habitat' | 'chans' | 'av'
  vald: LatLng | null
  onVald: (p: LatLng | null) => void
  onFynd: (f: Find) => void
  foljGPS: boolean
  onDragAvFolj: () => void
  aktivtSparSpar: LatLng[] | null
  handtag: React.MutableRefObject<KartHandtag | null>
}

/* ---------- Värmekarta ---------- */

/**
 * Renderar skanningen till en bild som läggs över kartan. Rutnätet är linjärt
 * i latitud medan Leaflet sträcker bilden i Mercator, men över några kilometer
 * på våra breddgrader är skillnaden mindre än en bildpunkt.
 */
function varmebild(s: Skanning, lage: 'habitat' | 'chans', morkBakgrund: boolean): string {
  const c = document.createElement('canvas')
  c.width = s.kolumner
  c.height = s.rader
  const ctx = c.getContext('2d')!
  const bild = ctx.createImageData(s.kolumner, s.rader)
  const d = bild.data
  const multiplikator = lage === 'chans' ? s.fruktsattning.index * s.sasong : 1

  /* Kontraststräckning och urval.
     Habitatpoängen inom en och samma skog ligger i ett smalt band. Målar man
     dem rakt av blir hela kartan enfärgat gul och svarar inte på den enda
     fråga som betyder något: vart ska jag gå just här? Vi sträcker därför
     skalan över områdets egen fördelning och ritar bara den bättre delen —
     resten lämnas genomskinlig så att terrängkartan syns.
     För att en genomgående dålig skog inte ska glöda lika starkt som en bra
     dämpas hela lagret efter den absoluta nivån på de bästa cellerna. */
  const sorterade = s.celler.map((x) => x.poang * multiplikator).sort((a, b) => a - b)
  const kvantil = (q: number) => sorterade[Math.floor(q * (sorterade.length - 1))] ?? 0
  // Nedre ankaret sätts högt med flit. Tar man median eller lägre drar
  // åkrarna och sjöarna ned det så att i stort sett hela skogen hamnar över
  // tröskeln — och då lyser kartan överallt och säger ingenting.
  const lag = kvantil(0.72)
  const hog = kvantil(0.99)
  const spann = Math.max(0.04, hog - lag)
  const dampning = Math.max(0.35, Math.min(1, hog / 0.72))
  // Under den här relativa nivån ritas ingenting alls.
  const TROSKEL = 0.06

  for (let i = 0; i < s.rutnat.length; i++) {
    const cell = s.rutnat[i]
    const p = i * 4
    if (!cell) {
      d[p + 3] = 0
      continue
    }
    const relativ = Math.max(0, Math.min(1, (cell.poang * multiplikator - lag) / spann))
    if (relativ <= TROSKEL) {
      d[p + 3] = 0
      continue
    }
    const t = (relativ - TROSKEL) / (1 - TROSKEL)
    const [r, g, b] = varmeRGB(t, morkBakgrund)
    d[p] = r
    d[p + 1] = g
    d[p + 2] = b
    d[p + 3] = Math.round(255 * varmeAlfa(t) * dampning)
  }
  ctx.putImageData(bild, 0, 0)
  return c.toDataURL()
}

/* ---------- Markörer ---------- */

function fyndIkon(f: Find): L.DivIcon {
  const a = art(f.art)
  const stor = f.mangd === 'korg' || f.mangd === 'jackpot'
  return L.divIcon({
    className: '',
    html: `<div class="m-fynd${stor ? ' stor' : ''}${f.favorit ? ' favorit' : ''}" style="--f:${a.farg}">
             <span>${a.emoji}</span></div>`,
    iconSize: [stor ? 34 : 28, stor ? 34 : 28],
    iconAnchor: [stor ? 17 : 14, stor ? 17 : 14],
  })
}

const toppIkon = (n: number) =>
  L.divIcon({
    className: '',
    html: `<div class="m-topp">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

const obsIkon = L.divIcon({ className: '', html: '<div class="m-obs"></div>', iconSize: [9, 9], iconAnchor: [4.5, 4.5] })

const valdIkon = L.divIcon({
  className: '',
  html: '<div class="m-vald"><i></i></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const malIkon = L.divIcon({
  className: '',
  html: '<div class="m-mal"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

/* ---------- Komponent ---------- */

export function Karta(p: Props) {
  const app = useApp()
  const rutaRef = useRef<HTMLDivElement>(null)
  const kartaRef = useRef<L.Map | null>(null)
  const basRef = useRef<L.TileLayer | null>(null)

  const varme = useRef<L.ImageOverlay | null>(null)
  const gGps = useRef<L.LayerGroup | null>(null)
  const gFynd = useRef<L.LayerGroup | null>(null)
  const gObs = useRef<L.LayerGroup | null>(null)
  const gTopp = useRef<L.LayerGroup | null>(null)
  const gOvrigt = useRef<L.LayerGroup | null>(null)
  const gSpar = useRef<L.LayerGroup | null>(null)

  // Sätts så fort kartan placerats en gång, eller så fort användaren rört
  // den — sedan får ingen automatik flytta vyn bakom ryggen på någon.
  const harPlacerats = useRef(false)
  const onValdRef = useRef(p.onVald)
  const onFyndRef = useRef(p.onFynd)
  const onDragRef = useRef(p.onDragAvFolj)
  onValdRef.current = p.onVald
  onFyndRef.current = p.onFynd
  onDragRef.current = p.onDragAvFolj

  /* --- Skapa kartan en gång --- */
  useEffect(() => {
    if (!rutaRef.current || kartaRef.current) return
    // Mitt i Sverige som utgångsläge; riktig position eller sparad skanning
    // flyttar vyn så fort de lästs in.
    const start = app.sistaPlats ?? { lat: 60.5, lon: 15.5 }
    const karta = L.map(rutaRef.current, {
      center: [start.lat, start.lon],
      zoom: app.sistaPlats ? 15 : 5,
      zoomControl: false,
      attributionControl: true,
      // Tröghet gör kartan behaglig att kasta iväg med tummen.
      inertia: true,
      maxZoom: 19,
      minZoom: 4,
    })
    karta.attributionControl.setPrefix('')

    gSpar.current = L.layerGroup().addTo(karta)
    gObs.current = L.layerGroup().addTo(karta)
    gTopp.current = L.layerGroup().addTo(karta)
    gFynd.current = L.layerGroup().addTo(karta)
    gOvrigt.current = L.layerGroup().addTo(karta)
    gGps.current = L.layerGroup().addTo(karta)

    karta.on('click', (e: L.LeafletMouseEvent) => {
      onValdRef.current({ lat: e.latlng.lat, lon: e.latlng.lng })
    })
    karta.on('dragstart', () => {
      harPlacerats.current = true
      onDragRef.current()
    })

    kartaRef.current = karta
    p.handtag.current = {
      karta,
      flygTill: (lat, lon, zoom) => karta.flyTo([lat, lon], zoom ?? Math.max(karta.getZoom(), 15), { duration: 0.8 }),
    }

    // Gör kartan åtkomlig från konsolen under utveckling — ovärderligt när man
    // vill hoppa till en viss skog utan att panorera dit för hand.
    if (import.meta.env.DEV) {
      ;(window as unknown as { karta?: L.Map }).karta = karta
    }

    const ro = new ResizeObserver(() => karta.invalidateSize())
    ro.observe(rutaRef.current)

    return () => {
      ro.disconnect()
      karta.remove()
      kartaRef.current = null
      p.handtag.current = null
    }
    // Avsiktligt bara vid montering — kartan lever hela appens livstid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- Öppningsvy ---
     Senast kända position och sparad skanning läses ur IndexedDB och kommer
     alltså först en bit efter att kartan skapats. Utan det här hamnar man
     varje gång på en översiktsvy i stället för i skogen man höll på med. */
  useEffect(() => {
    const karta = kartaRef.current
    if (!karta || harPlacerats.current) return
    const s = app.skanning
    const plats = app.sistaPlats
    if (s) {
      harPlacerats.current = true
      // Zooma så att hela det skannade området får plats.
      karta.fitBounds(
        [
          [s.box.south, s.box.west],
          [s.box.north, s.box.east],
        ],
        { padding: [24, 24], animate: false },
      )
    } else if (plats) {
      harPlacerats.current = true
      karta.setView([plats.lat, plats.lon], 15, { animate: false })
    }
  }, [app.skanning, app.sistaPlats])

  /* --- Baslager --- */
  useEffect(() => {
    const karta = kartaRef.current
    if (!karta) return
    if (basRef.current) karta.removeLayer(basRef.current)
    const lager = skapaLager(LAGER[app.kartlager])
    lager.addTo(karta)
    lager.bringToBack()
    basRef.current = lager
  }, [app.kartlager])

  /* --- Värmekarta --- */
  useEffect(() => {
    const karta = kartaRef.current
    if (!karta) return
    if (varme.current) {
      karta.removeLayer(varme.current)
      varme.current = null
    }
    const s = app.skanning
    if (!s || p.varmelager === 'av') return
    const url = varmebild(s, p.varmelager, app.kartlager === 'satellit')
    varme.current = L.imageOverlay(
      url,
      [
        [s.box.south, s.box.west],
        [s.box.north, s.box.east],
      ],
      { opacity: 1, interactive: false, className: 'varmekarta' },
    ).addTo(karta)
    varme.current.bringToBack()
    // Bilden ritas om när baslagret byts, eftersom rampen är anpassad efter
    // om bakgrunden är ljus eller mörk.
  }, [app.skanning, p.varmelager, app.kartlager])

  /* --- Toppställen --- */
  useEffect(() => {
    const g = gTopp.current
    if (!g) return
    g.clearLayers()
    const s = app.skanning
    if (!s || p.varmelager === 'av') return
    const basta = bastaStallen(s, 6, s.radieM / 6, app.fynd)
    const grans = (basta[0]?.poang ?? 0) * 0.82
    basta.filter((c) => c.poang >= grans).forEach((c, i) => {
      L.marker([c.lat, c.lon], { icon: toppIkon(i + 1), zIndexOffset: 500 })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onValdRef.current({ lat: c.lat, lon: c.lon })
        })
        .addTo(g)
    })
  }, [app.skanning, p.varmelager, app.fynd])

  /* --- Egna fynd --- */
  useEffect(() => {
    const g = gFynd.current
    if (!g) return
    g.clearLayers()
    for (const f of app.fynd) {
      L.marker([f.lat, f.lon], { icon: fyndIkon(f), zIndexOffset: 700 })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onFyndRef.current(f)
        })
        .addTo(g)
    }
  }, [app.fynd])

  /* --- Rapporterade fynd från GBIF --- */
  useEffect(() => {
    const g = gObs.current
    if (!g) return
    g.clearLayers()
    if (!app.visaObservationer || !app.skanning) return
    for (const o of app.skanning.observationer) {
      L.marker([o.lat, o.lon], { icon: obsIkon, interactive: false, zIndexOffset: 100 }).addTo(g)
    }
  }, [app.visaObservationer, app.skanning])

  /* --- Vald punkt och målpunkt --- */
  useEffect(() => {
    const g = gOvrigt.current
    if (!g) return
    g.clearLayers()
    if (p.vald) L.marker([p.vald.lat, p.vald.lon], { icon: valdIkon, interactive: false, zIndexOffset: 800 }).addTo(g)
    if (app.malpunkt)
      L.marker([app.malpunkt.lat, app.malpunkt.lon], { icon: malIkon, interactive: false, zIndexOffset: 750 }).addTo(g)
    // Sökcirkeln visar hur långt skanningen sträcker sig.
    const s = app.skanning
    if (s && p.varmelager !== 'av') {
      L.circle([s.centrum.lat, s.centrum.lon], {
        radius: s.radieM,
        color: '#f2b705',
        weight: 1.2,
        opacity: 0.45,
        fill: false,
        dashArray: '5 7',
        interactive: false,
      }).addTo(g)
    }
  }, [p.vald, app.malpunkt, app.skanning, p.varmelager])

  /* --- Inspelat spår --- */
  useEffect(() => {
    const g = gSpar.current
    if (!g) return
    g.clearLayers()
    if (p.aktivtSparSpar && p.aktivtSparSpar.length > 1) {
      L.polyline(
        p.aktivtSparSpar.map((q) => [q.lat, q.lon] as [number, number]),
        { color: '#4fa3d9', weight: 4, opacity: 0.85, lineJoin: 'round', interactive: false },
      ).addTo(g)
    }
  }, [p.aktivtSparSpar])

  /* --- GPS-position --- */
  useEffect(() => {
    const g = gGps.current
    const karta = kartaRef.current
    if (!g || !karta) return
    g.clearLayers()
    const plats = app.gps.plats
    if (!plats) return

    if (plats.noggrannhet > 12) {
      L.circle([plats.lat, plats.lon], {
        radius: plats.noggrannhet,
        color: '#4fa3d9',
        weight: 1,
        opacity: 0.5,
        fillColor: '#4fa3d9',
        fillOpacity: 0.11,
        interactive: false,
      }).addTo(g)
    }

    const riktning = plats.riktning ?? app.kompass.riktning
    L.marker([plats.lat, plats.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="m-gps">${
          riktning !== null ? `<i style="transform:rotate(${riktning}deg)"></i>` : ''
        }<b></b></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(g)

    if (p.foljGPS) {
      harPlacerats.current = true
      karta.setView([plats.lat, plats.lon], Math.max(karta.getZoom(), 15), { animate: true })
    }
  }, [app.gps.plats, app.kompass.riktning, p.foljGPS])

  return <div className={`kartyta${app.nattlage ? ' natt' : ''}`} ref={rutaRef} />
}
