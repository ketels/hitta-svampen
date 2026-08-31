/** Shared state. Small enough to live in a single context. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  requestPersistentStorage, loadFinds, loadScan, loadTracks, readSetting, deleteFind,
  deleteTrack, writeSetting, saveFind, saveScan, pruneCache,
} from '../lib/db.ts'
import { useGPS, useCompass, type GeoPosition } from '../lib/gps.ts'
import { readTheme, resolveTheme, writeTheme, systemTheme, applyTheme, type Theme } from '../lib/theme.ts'
import type { Find, Track, SpeciesId } from '../lib/types.ts'
import type { Scan } from '../model/scan.ts'
import { enrichStragglers } from '../model/enrich.ts'

export type View = 'map' | 'forecast' | 'finds' | 'species' | 'more'

export type MapLayer = 'topo' | 'satellite' | 'street'

/**
 * The target you navigate towards. `label` is the name the user themselves
 * tapped — "Mot plats 2" or "Mot kantarell" says, while walking, what you are
 * heading for, which "Mot ditt mål" never did.
 */
export type Destination = { lat: number; lon: number; zoom?: number; label?: string }

type AppValue = {
  finds: Find[]
  tracks: Track[]
  reload: () => Promise<void>
  save: (f: Find) => Promise<void>
  remove: (id: string) => Promise<void>
  removeTrack: (id: string) => Promise<void>

  selectedSpecies: SpeciesId
  setSelectedSpecies: (s: SpeciesId) => void

  view: View
  setView: (v: View) => void

  mapLayer: MapLayer
  setMapLayer: (l: MapLayer) => void

  showObservations: boolean
  setShowObservations: (v: boolean) => void

  /** Whether the map's bottom panel is expanded. Out in the forest you want to
   *  see the map. */
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void

  /** Dimmed map for dusk and darkness. */
  nightMode: boolean
  setNightMode: (v: boolean) => void

  /** Light or dark design language. Auto follows the system. */
  theme: Theme
  setTheme: (t: Theme) => void
  /** Which mode the theme actually landed in right now. */
  lightMode: boolean

  scan: Scan | null
  setScan: (s: Scan | null) => void

  /** Point the map should fly to, set by other views. */
  destination: Destination | null
  goTo: (target: Destination) => void
  clearDestination: () => void

  gps: ReturnType<typeof useGPS>
  compass: ReturnType<typeof useCompass>
  /** The last known position, even if the GPS is off right now. */
  lastPosition: GeoPosition | null
}

const Context = createContext<AppValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [finds, setFinds] = useState<Find[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [selectedSpecies, setSelectedSpeciesRaw] = useState<SpeciesId>('chanterelle')
  const [view, setView] = useState<View>('map')
  const [mapLayer, setMapLayerRaw] = useState<MapLayer>('topo')
  const [showObservations, setShowObservationsRaw] = useState(false)
  const [panelOpen, setPanelOpenRaw] = useState(true)
  const [nightMode, setNightModeRaw] = useState(false)
  const [theme, setThemeRaw] = useState<Theme>(readTheme)
  const [sysTheme, setSysTheme] = useState(systemTheme)
  const [scan, setScanRaw] = useState<Scan | null>(null)
  const [destination, setDestination] = useState<AppValue['destination']>(null)
  const [lastPosition, setLastPosition] = useState<GeoPosition | null>(null)

  const gps = useGPS()
  const compass = useCompass()

  useEffect(() => {
    if (gps.position) setLastPosition(gps.position)
  }, [gps.position])

  /* The system can switch mode while the app is running — sunrise, a scheduled
     night mode, or pulling down control centre and tapping. */
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!mq) return
    const onChange = () => setSysTheme(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const lightMode = (theme === 'auto' ? sysTheme : theme) === 'light'

  useEffect(() => {
    applyTheme(resolveTheme(theme))
  }, [theme, sysTheme])

  const reload = useCallback(async () => {
    const [f, t] = await Promise.all([loadFinds(), loadTracks()])
    setFinds(f)
    setTracks(t)
  }, [])

  useEffect(() => {
    void reload()
    void pruneCache()
    void requestPersistentStorage()
    void (async () => {
      setSelectedSpeciesRaw(await readSetting<SpeciesId>('selectedSpecies', 'chanterelle'))
      setMapLayerRaw(await readSetting<MapLayer>('mapLayer', 'topo'))
      setShowObservationsRaw(await readSetting<boolean>('showObservations', false))
      setPanelOpenRaw(await readSetting<boolean>('panelOpen', true))
      setNightModeRaw(await readSetting<boolean>('nightMode', false))
      const p = await readSetting<GeoPosition | null>('lastPosition', null)
      if (p) setLastPosition(p)
      // The most recent scan is put back so the map is filled in immediately
      // when you open the app — even without coverage out in the forest.
      const s = await loadScan<Scan>()
      if (s) setScanRaw(s)
    })()
  }, [reload])

  /* Fills in habitat data for finds that lack it. Save a find without coverage
     — or import from another phone — and the analysis cannot keep up then.
     Here they are taken care of at a calm pace once the app is running.

     The flag is set only when the work actually starts. Set it as the effect
     runs and React in strict mode remounts the component, clears the timer and
     then never gets past the flag again. */
  const enrichedRef = useRef(false)
  const findsRef = useRef(finds)
  const scanRef = useRef(scan)
  findsRef.current = finds
  scanRef.current = scan
  const needsEnriching = finds.some((f) => !f.habitat)

  useEffect(() => {
    if (!needsEnriching || enrichedRef.current) return
    const ctrl = new AbortController()
    const start = setTimeout(() => {
      if (enrichedRef.current) return
      enrichedRef.current = true
      void enrichStragglers(findsRef.current, scanRef.current, ctrl.signal, () => void reload())
    }, 3000)
    return () => {
      clearTimeout(start)
      ctrl.abort()
    }
  }, [needsEnriching, reload])

  // Saves the latest position so the map opens in the right place next time.
  useEffect(() => {
    if (!gps.position) return
    const t = setTimeout(() => void writeSetting('lastPosition', gps.position), 4000)
    return () => clearTimeout(t)
  }, [gps.position])

  const setScan = useCallback((s: Scan | null) => {
    setScanRaw(s)
    void saveScan(s)
  }, [])

  const setSelectedSpecies = useCallback((s: SpeciesId) => {
    setSelectedSpeciesRaw(s)
    void writeSetting('selectedSpecies', s)
  }, [])

  const setMapLayer = useCallback((l: MapLayer) => {
    setMapLayerRaw(l)
    void writeSetting('mapLayer', l)
  }, [])

  const setShowObservations = useCallback((v: boolean) => {
    setShowObservationsRaw(v)
    void writeSetting('showObservations', v)
  }, [])

  const setPanelOpen = useCallback((v: boolean) => {
    setPanelOpenRaw(v)
    void writeSetting('panelOpen', v)
  }, [])

  const setNightMode = useCallback((v: boolean) => {
    setNightModeRaw(v)
    void writeSetting('nightMode', v)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeRaw(t)
    writeTheme(t)
  }, [])

  const save = useCallback(
    async (f: Find) => {
      await saveFind(f)
      await reload()
      // The browser grants persistent storage more readily when the app is
      // demonstrably in use, so we ask again every time something is saved.
      void requestPersistentStorage()
    },
    [reload],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteFind(id)
      await reload()
    },
    [reload],
  )

  const removeTrack = useCallback(
    async (id: string) => {
      await deleteTrack(id)
      await reload()
    },
    [reload],
  )

  const goTo = useCallback((target: Destination) => {
    setDestination(target)
    setView('map')
  }, [])

  const clearDestination = useCallback(() => setDestination(null), [])

  const value = useMemo<AppValue>(
    () => ({
      finds, tracks, reload, save, remove, removeTrack,
      selectedSpecies, setSelectedSpecies,
      view, setView,
      mapLayer, setMapLayer,
      showObservations, setShowObservations,
      panelOpen, setPanelOpen,
      nightMode, setNightMode,
      theme, setTheme, lightMode,
      scan, setScan,
      destination, goTo, clearDestination,
      gps, compass, lastPosition,
    }),
    [finds, tracks, reload, save, remove, removeTrack, selectedSpecies, setSelectedSpecies, view,
     mapLayer, setMapLayer, showObservations, setShowObservations, panelOpen, setPanelOpen,
     nightMode, setNightMode, theme, setTheme, lightMode, scan, setScan, destination,
     goTo, clearDestination, gps, compass, lastPosition],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useApp(): AppValue {
  const v = useContext(Context)
  if (!v) throw new Error('useApp måste användas inuti AppProvider')
  return v
}
