import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapCanvas, type MapHandle } from '../components/MapCanvas.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { FindForm } from '../components/FindForm.tsx'
import { PointDetail } from '../components/PointDetail.tsx'
import { FindDetail } from '../components/FindDetail.tsx'
import {
  IconClose, IconLayers, IconPin, IconChevronDown, IconPlus, IconRadar, IconCrosshair,
  IconTrack, IconWarning,
} from '../components/Icons.tsx'
import { LAYERS } from '../components/mapLayers.ts'
import { species as lookupSpecies, MAIN_SPECIES } from '../data/species.ts'
import { speciesIcon, speciesColor } from '../components/SpeciesIcons.tsx'
import { distance, bearing, formatDistance, compass } from '../lib/geo.ts'
import { newId, saveTrack } from '../lib/db.ts'
import { chanceColor, chanceWord, heatGradient } from '../lib/color.ts'
import { daylight, timeAgo } from '../lib/time.ts'
import { useApp, type MapLayer } from '../state/app.tsx'
import type { Find, LatLng } from '../lib/types.ts'
import {
  assessPoint, assessFromScan, numberedTopPlaces, scan as runScan, type PointAssessment,
} from '../model/scan.ts'
import { enrichFind } from '../model/enrich.ts'

type ScanState = { step: string; share: number }

export function MapView({ active }: { active: boolean }) {
  const app = useApp()
  const handle = useRef<MapHandle | null>(null)

  const [followGPS, setFollowGPS] = useState(false)
  const [selected, setSelected] = useState<LatLng | null>(null)
  const [assessment, setAssessment] = useState<PointAssessment | null>(null)
  const [assessmentError, setAssessmentError] = useState<string | null>(null)
  const [loadingPoint, setLoadingPoint] = useState(false)
  const [scanState, setScanState] = useState<ScanState | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'point' | 'newFind' | 'find' | 'layers' | null>(null)
  const [selectedFind, setSelectedFind] = useState<Find | null>(null)
  const [heatLayer, setHeatLayer] = useState<'habitat' | 'chance'>('habitat')
  const [showHeat, setShowHeat] = useState(true)
  const [recording, setRecording] = useState(false)
  const [trackPoints, setTrackPoints] = useState<{ lat: number; lon: number; t: number; alt: number | null }[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const speciesData = lookupSpecies(app.selectedSpecies)
  const position = app.gps.position

  /* --- Start the GPS when the map is first shown --- */
  useEffect(() => {
    if (active && app.gps.status === 'off') {
      app.gps.start()
      setFollowGPS(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    if (active) handle.current?.map?.invalidateSize()
  }, [active])

  /* --- Fly to the destination when another view asks for it --- */
  useEffect(() => {
    if (app.destination && handle.current) {
      handle.current.flyTo(app.destination.lat, app.destination.lon, app.destination.zoom)
      setFollowGPS(false)
    }
  }, [app.destination])

  /* --- Record a track --- */
  useEffect(() => {
    if (!recording || !position) return
    setTrackPoints((p) => {
      const last = p[p.length - 1]
      // Filter out GPS noise while standing still.
      if (last && distance(last, position) < 6) return p
      return [...p, { lat: position.lat, lon: position.lon, t: position.time, alt: position.elevation }]
    })
  }, [recording, position])

  const finishTrack = useCallback(async () => {
    setRecording(false)
    if (trackPoints.length > 2) {
      let length = 0
      for (let i = 1; i < trackPoints.length; i++) length += distance(trackPoints[i - 1]!, trackPoints[i]!)
      await saveTrack({
        id: newId(),
        name: new Date(trackPoints[0]!.t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }),
        start: trackPoints[0]!.t,
        end: trackPoints[trackPoints.length - 1]!.t,
        points: trackPoints,
        length,
      })
      await app.reload()
    }
    setTrackPoints([])
  }, [trackPoints, app])

  /* --- Assess a point that was tapped --- */
  const assessTapped = useCallback(
    async (p: LatLng) => {
      setSelected(p)
      setSheet('point')
      setAssessmentError(null)
      const quick = app.scan && app.scan.species === app.selectedSpecies
        ? assessFromScan(app.scan, p, app.finds)
        : null
      if (quick) {
        setAssessment(quick)
        return
      }
      setAssessment(null)
      setLoadingPoint(true)
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        setAssessment(await assessPoint(p, app.selectedSpecies, app.finds, ctrl.signal))
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setAssessmentError(
            e instanceof Error && /nätverk|fetch|Failed/i.test(e.message)
              ? 'Ingen uppkoppling — kan inte analysera nya punkter offline.'
              : 'Kunde inte analysera punkten just nu.',
          )
        }
      } finally {
        if (!ctrl.signal.aborted) setLoadingPoint(false)
      }
    },
    [app.scan, app.selectedSpecies, app.finds],
  )

  /* --- Scan the area --- */
  const startScan = useCallback(async () => {
    const map = handle.current?.map
    if (!map) return
    const c = map.getCenter()
    // The radius follows what is actually visible, but is kept within
    // reasonable bounds.
    const visibleRadius = map.distance(c, map.getBounds().getNorthEast()) * 0.72
    const radius = Math.max(500, Math.min(2500, Math.round(visibleRadius / 100) * 100))

    setScanError(null)
    setScanState({ step: 'Startar', share: 0 })
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const s = await runScan({
        center: { lat: c.lat, lon: c.lng },
        radiusM: radius,
        species: app.selectedSpecies,
        finds: app.finds,
        progress: (step, share) => setScanState({ step, share }),
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      app.setScan(s)
      setShowHeat(true)
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setScanError(
          e instanceof Error && /höjddata|fetch|Failed|nätverk/i.test(e.message)
            ? 'Kunde inte hämta underlag. Kolla uppkopplingen och försök igen.'
            : 'Skanningen misslyckades.',
        )
      }
    } finally {
      if (!ctrl.signal.aborted) setScanState(null)
    }
  }, [app])

  /* --- Save a find --- */
  const saveNewFind = useCallback(
    async (f: Find) => {
      setSheet(null)
      await app.save(f)
      // Habitat data is fetched in the background so you never wait in the forest.
      void enrichFind(f, [...app.finds, f], app.scan).then((enriched) => {
        if (enriched) void app.reload()
      })
    },
    [app],
  )

  /**
   * Where the find lands. GPS first, then the point you tapped, and as a last
   * resort the centre of the map — better than a disabled button when you are
   * standing under a spruce and the satellites cannot find their way home.
   */
  const [findPlace, setFindPlace] = useState<
    { lat: number; lon: number; accuracy: number | null; source: 'gps' | 'point' | 'map' } | null
  >(null)

  const openNewFind = useCallback(() => {
    if (position) {
      setFindPlace({ lat: position.lat, lon: position.lon, accuracy: position.accuracy, source: 'gps' })
    } else if (selected) {
      setFindPlace({ lat: selected.lat, lon: selected.lon, accuracy: null, source: 'point' })
    } else {
      const c = handle.current?.map?.getCenter()
      if (!c) return
      setFindPlace({ lat: c.lat, lon: c.lng, accuracy: null, source: 'map' })
    }
    setSheet('newFind')
  }, [position, selected])

  /* --- Navigation towards the destination ---
     Walking time is calculated at 4.5 km/h, that is 75 metres a minute. That
     is a reasonable pace in forest terrain with a basket in hand — not the
     same thing as on a path. */
  const target = app.destination
  const navigation = useMemo(() => {
    if (!target || !position) return null
    const m = distance(position, { lat: target.lat, lon: target.lon })
    const minutes = Math.round(m / 75)
    return {
      distance: m,
      heading: bearing(position, { lat: target.lat, lon: target.lon }),
      // Under a minute the time says nothing you cannot already see from the
      // distance.
      minutes: minutes >= 1 ? minutes : null,
    }
  }, [target, position])

  const scanApplies = app.scan?.species === app.selectedSpecies
  /* Weather times season — how much is standing in the forest right now,
     independent of where you are. The place-dependent chance you get by
     tapping the map; calling this figure "chance" would be misleading. */
  const weatherLevel =
    app.scan && scanApplies
      ? app.scan.fruiting.index * app.scan.season * 100
      : null

  /**
   * What you are heading towards, with the name you tapped yourself. "Mot
   * plats 2" can be connected to the marker on the map; "Mot ditt mål" could
   * not be connected to anything.
   */
  const labelForPoint = useCallback(
    (p: LatLng): string | undefined => {
      const s = app.scan
      if (!s || s.species !== app.selectedSpecies) return undefined
      // The top places pass their own cell coordinates along, so a hit is
      // exact and not approximate.
      const i = numberedTopPlaces(s, app.finds).findIndex((c) => distance(c, p) < 2)
      return i >= 0 ? `Mot plats ${i + 1}` : undefined
    },
    [app.scan, app.selectedSpecies, app.finds],
  )

  const light = app.scan ? daylight(app.scan.weather.days[app.scan.weather.today]) : null
  // A scan left overnight has a weather basis that has gone out of date, even
  // though the terrain of course stands where it stood.
  const staleScan = app.scan ? Date.now() - app.scan.time > 14 * 3600e3 : false

  return (
    <>
      <MapCanvas
        heatLayer={showHeat && scanApplies ? heatLayer : 'off'}
        selected={selected}
        onSelect={(p) => { if (p) void assessTapped(p) }}
        onFind={(f) => { setSelectedFind(f); setSheet('find') }}
        followGPS={followGPS}
        onDragEndsFollow={() => setFollowGPS(false)}
        activeTrackPoints={recording ? trackPoints : null}
        handle={handle}
      />

      {/* Controls at the top right */}
      <div className="map-overlay">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            {navigation ? (
              <div className="panel nav-panel">
                <div className="grow">
                  <div className="label">{target?.label ?? 'Mot ditt mål'}</div>
                  <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                    <span className="num" style={{ fontSize: 26, lineHeight: 1.1 }}>
                      {formatDistance(navigation.distance)}
                    </span>
                    <span className="small dim">
                      {compass(navigation.heading)}
                      {navigation.minutes !== null ? ` · ${navigation.minutes} min` : ''}
                    </span>
                  </div>
                </div>
                <div
                  className="nav-arrow"
                  style={{
                    transform: `rotate(${navigation.heading - (app.compass.heading ?? 0)}deg)`,
                  }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 3 19 20l-7-4-7 4 7-17Z" fill="var(--gold-icon)" /></svg>
                </div>
                <button className="close" onClick={app.clearDestination} aria-label="Sluta navigera">
                  <IconClose size={16} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="map-btn-stack">
            <button
              className="map-btn"
              aria-pressed={followGPS}
              onClick={() => {
                if (app.gps.status === 'off') app.gps.start()
                void app.compass.request()
                setFollowGPS(true)
                if (position) handle.current?.flyTo(position.lat, position.lon)
              }}
              aria-label="Centrera på min position"
            >
              <IconCrosshair size={21} />
            </button>
            <button className="map-btn" onClick={() => setSheet('layers')} aria-label="Kartlager">
              <IconLayers size={21} />
            </button>
            <button
              className="map-btn"
              aria-pressed={recording}
              onClick={() => (recording ? void finishTrack() : setRecording(true))}
              aria-label={recording ? 'Avsluta spårinspelning' : 'Spela in spår'}
            >
              <IconTrack size={21} />
            </button>
          </div>
        </div>
      </div>

      {/* Panel at the bottom */}
      <div className="map-footer">
        {scanState ? (
          <div className="panel">
            <div className="row" style={{ gap: 10 }}>
              <div className="spinner" />
              <div className="grow small">{scanState.step}</div>
              <button className="tiny dim" onClick={() => { abortRef.current?.abort(); setScanState(null) }}>
                Avbryt
              </button>
            </div>
            <div className="progress"><i style={{ width: `${scanState.share}%` }} /></div>
          </div>
        ) : null}

        {scanError ? (
          <div className="panel" style={{ borderColor: 'var(--danger-border)' }}>
            <div className="row" style={{ gap: 10 }}>
              <div className="grow small">{scanError}</div>
              <button className="close" onClick={() => setScanError(null)}><IconClose size={16} /></button>
            </div>
          </div>
        ) : null}

        <div className="panel">
          {/* The head shows species and state in both conditions. Collapsed it
              is the only place showing the selected species when the rest is
              hidden, and expanded "Svampläge" said nothing that was not
              already visible. */}
          <div className="panel-head">
            <button
              className="title"
              onClick={() => app.setPanelOpen(!app.panelOpen)}
              aria-expanded={app.panelOpen}
            >
              <span className="species-dot" style={{ background: speciesData.color }} />
              <span className="bold small name">{speciesData.name}</span>
              {weatherLevel !== null ? (
                <span className="small state" style={{ color: chanceColor(weatherLevel / 100) }}>
                  · {chanceWord(weatherLevel).toLowerCase()}
                </span>
              ) : null}
            </button>

            <span className="grow" />

            {/* The heatmap controls belong to the expanded state. Collapsed,
                the head row is the only thing showing the selected species,
                and it needs the full width for the name — "Rödgul
                trumpetsvamp · mycket bra" plus a segmented control does not
                fit in 336 px. */}
            {scanApplies && app.panelOpen ? (
              <>
                <button
                  className="tiny bold"
                  style={{ color: 'var(--gold-text)', flexShrink: 0 }}
                  aria-pressed={showHeat}
                  onClick={() => setShowHeat((v) => !v)}
                >
                  {showHeat ? 'Dölj' : 'Visa'}
                </button>
                {showHeat ? (
                  <div className="segment compact">
                    <button
                      aria-pressed={heatLayer === 'habitat'}
                      onClick={() => setHeatLayer('habitat')}
                    >
                      Mark
                    </button>
                    <button
                      aria-pressed={heatLayer === 'chance'}
                      onClick={() => setHeatLayer('chance')}
                    >
                      Idag
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            <button
              className="collapse"
              onClick={() => app.setPanelOpen(!app.panelOpen)}
              aria-expanded={app.panelOpen}
              aria-label={app.panelOpen ? 'Fäll ihop panelen' : 'Fäll ut panelen'}
            >
              <IconChevronDown size={17} style={{ transform: app.panelOpen ? 'none' : 'rotate(180deg)' }} />
            </button>
          </div>

          {app.panelOpen ? (
            <>
              <div className="chip-row" style={{ marginTop: 9, marginBottom: scanApplies ? 10 : 0 }}>
                <div className="chips row">
                  {MAIN_SPECIES.map((id) => {
                    const sp = lookupSpecies(id)
                    const Icon = speciesIcon(id)
                    return (
                      <button
                        key={id}
                        className="chip"
                        aria-pressed={app.selectedSpecies === id}
                        onClick={() => app.setSelectedSpecies(id)}
                      >
                        <Icon size={17} style={{ color: speciesColor(id) }} />
                        {sp.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {scanApplies && app.scan ? (
                <>
                  {app.scan.landCoverMissing ? (
                    <div className="row tiny" style={{ gap: 7, marginBottom: 8, color: 'var(--orange)' }}>
                      <IconWarning size={15} />
                      <span className="grow">
                        Kartdatan gick inte att hämta — poängen bygger bara på terrängen.
                      </span>
                    </div>
                  ) : null}

                  {staleScan ? (
                    <div className="tiny" style={{ marginBottom: 8, color: 'var(--orange)' }}>
                      Skannad {timeAgo(app.scan.time)}
                    </div>
                  ) : null}

                  {showHeat ? (
                    <div className="legend">
                      <span className="tiny dimmer">Svagt</span>
                      <div
                        className="scale"
                        style={{ background: `linear-gradient(90deg, ${heatGradient(app.mapLayer === 'satellite')})` }}
                      />
                      <span className="tiny dimmer">Starkt</span>
                      {light?.short ? (
                        <>
                          <span className="sep" aria-hidden="true" />
                          <span className="tiny dimmer daylight">{light.short}</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>

        {/* You scan once per forest visit and save a find every time you find
            something. Two equally wide buttons claimed they are used equally
            often. */}
        <div className="btn-row">
          <button
            className="btn icon"
            onClick={() => void startScan()}
            disabled={!!scanState}
            aria-label={app.scan && scanApplies ? 'Skanna om området' : 'Skanna området'}
          >
            <IconRadar size={22} />
          </button>
          <button className="btn primary large" onClick={openNewFind}>
            <IconPlus size={21} />
            Spara fynd
          </button>
        </div>
      </div>

      {/* Sheets */}
      {sheet === 'point' ? (
        <Sheet
          title={loadingPoint ? 'Analyserar…' : assessment ? `${Math.round(assessment.chance)}% chans` : 'Punkt'}
          subtitle={speciesData.name}
          onClose={() => { setSheet(null); setSelected(null) }}
          footer={
            selected ? (
              <div className="btn-row">
                <button
                  className="btn"
                  onClick={() => {
                    app.goTo({ lat: selected.lat, lon: selected.lon, label: labelForPoint(selected) })
                    setSheet(null)
                  }}
                >
                  <IconPin size={18} /> Navigera hit
                </button>
                <button className="btn primary" onClick={openNewFind}>
                  <IconPlus size={18} /> Fynd här
                </button>
              </div>
            ) : null
          }
        >
          {loadingPoint ? (
            <div className="empty">
              <div className="spinner" style={{ margin: '0 auto 14px', width: 26, height: 26 }} />
              Hämtar höjddata, skogstyp och väder för punkten…
            </div>
          ) : assessmentError ? (
            <div className="danger-box">{assessmentError}</div>
          ) : assessment ? (
            <PointDetail assessment={assessment} speciesId={app.selectedSpecies} />
          ) : null}
        </Sheet>
      ) : null}

      {sheet === 'newFind' && findPlace ? (
        <Sheet
          title="Nytt fynd"
          subtitle={
            findPlace.source === 'gps'
              ? 'På din GPS-position'
              : findPlace.source === 'point'
                ? 'På punkten du valde'
                : 'Mitt på kartan — flytta kartan om det inte stämmer'
          }
          onClose={() => setSheet(null)}
        >
          <FindForm
            lat={findPlace.lat}
            lon={findPlace.lon}
            accuracy={findPlace.accuracy}
            defaultSpecies={app.selectedSpecies}
            onSave={(f) => void saveNewFind(f)}
            onCancel={() => setSheet(null)}
          />
        </Sheet>
      ) : null}

      {sheet === 'find' && selectedFind ? (
        <Sheet
          title={lookupSpecies(selectedFind.species).name}
          subtitle={new Date(selectedFind.time).toLocaleDateString('sv-SE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
          onClose={() => setSheet(null)}
        >
          <FindDetail
            find={selectedFind}
            onClose={() => setSheet(null)}
            onNavigate={() => {
              app.goTo({
                lat: selectedFind.lat,
                lon: selectedFind.lon,
                label: selectedFind.species === 'other'
                  ? 'Mot fyndplats'
                  : `Mot ${lookupSpecies(selectedFind.species).name}`,
              })
              setSheet(null)
            }}
          />
        </Sheet>
      ) : null}

      {sheet === 'layers' ? (
        <Sheet title="Kartlager" onClose={() => setSheet(null)}>
          <div className="segment" style={{ marginBottom: 14 }}>
            {(Object.keys(LAYERS) as MapLayer[]).map((id) => (
              <button key={id} aria-pressed={app.mapLayer === id} onClick={() => app.setMapLayer(id)}>
                {LAYERS[id].name}
              </button>
            ))}
          </div>
          <p className="small dim">
            Terrängkartan visar höjdkurvor och skogsmark och är oftast den mest användbara
            i skogen. Satellitbilden avslöjar hyggen och glesa partier som kartdatan inte hunnit med.
          </p>
          <hr className="divider" />
          <button
            className="btn wide"
            aria-pressed={app.nightMode}
            onClick={() => app.setNightMode(!app.nightMode)}
            style={app.nightMode ? { borderColor: 'var(--gold-dark)' } : undefined}
          >
            {app.nightMode ? 'Slå av' : 'Slå på'} nattläge
          </button>
          <p className="small dim" style={{ marginTop: 10 }}>
            Dämpar kartan utan att byta ut den, så höjdkurvor och skogsmark finns kvar.
            Svampfälten och markörerna ligger kvar i full styrka ovanpå. Skonsamt mot
            mörkerseendet när skymningen kommer.
          </p>
          <hr className="divider" />
          <button
            className="btn wide"
            aria-pressed={app.showObservations}
            onClick={() => app.setShowObservations(!app.showObservations)}
            style={app.showObservations ? { borderColor: 'var(--gold-dark)' } : undefined}
          >
            {app.showObservations ? 'Dölj' : 'Visa'} rapporterade fynd från Artportalen
          </button>
          <p className="small dim" style={{ marginTop: 10 }}>
            Vita prickar är fynd andra rapporterat in via GBIF. De är ofta avrundade till
            närmaste hundra meter, så se dem som en vink om att arten finns i skogen —
            inte som en skattkarta.
          </p>
        </Sheet>
      ) : null}
    </>
  )
}
