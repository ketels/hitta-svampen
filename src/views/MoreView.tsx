import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { SPECIES } from '../data/species.ts'
import {
  countTiles, isStoragePersistent, requestPersistentStorage, storageEstimate, clearTiles,
  saveFind, saveTrack,
} from '../lib/db.ts'
import { migrateFind, migrateTrack, isLegacyFind, isLegacyTrack } from '../lib/dbMigrate.ts'
import { LAYERS, downloadArea, countTilesInArea } from '../components/mapLayers.ts'
import { prefetchLandCover } from '../data/landCover.ts'
import { ElevationMosaic } from '../data/elevationTiles.ts'
import { plural } from '../lib/geo.ts'
import { learningOverview } from '../model/personalize.ts'
import { useApp } from '../state/app.tsx'
import { IconDownload, IconWarning } from '../components/Icons.tsx'
import type { Find, Track } from '../lib/types.ts'
import type { Theme } from '../lib/theme.ts'

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1)} MB`

const RADII = [2, 5, 10]

const THEMES: { id: Theme; name: string }[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'light', name: 'Ljust' },
  { id: 'dark', name: 'Mörkt' },
]

/** The export format version. 1 used the Swedish field names. */
const EXPORT_VERSION = 2

export function MoreView() {
  const app = useApp()
  const [tileCount, setTileCount] = useState(0)
  const [storage, setStorage] = useState({ used: 0, quota: 0 })
  const [radius, setRadius] = useState(5)
  const [downloading, setDownloading] = useState<{ done: number; total: number; what: string } | null>(null)
  const [forestData, setForestData] = useState<'waiting' | 'done' | 'partial' | 'failed' | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [coldStart, setColdStart] = useState<'yes' | 'no' | 'unknown'>('unknown')
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const abort = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const position = app.gps.position ?? app.lastPosition

  const refreshStatus = useCallback(async () => {
    setTileCount(await countTiles())
    setStorage(await storageEstimate())
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])
  useEffect(() => { void isStoragePersistent().then(setPersistent) }, [])

  // Can the app start with no network at all? That is decided by whether the
  // service worker is registered, and you want to know before driving out.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setColdStart('no')
      return
    }
    let alive = true
    void navigator.serviceWorker
      .getRegistrations()
      .then((r) => alive && setColdStart(r.some((x) => x.active) ? 'yes' : 'no'))
      .catch(() => alive && setColdStart('unknown'))
    return () => { alive = false }
  }, [tileCount])

  const bounds = position
    ? L.latLng(position.lat, position.lon).toBounds(radius * 2000)
    : null
  const estimated = bounds ? countTilesInArea(bounds, 11, 16, LAYERS[app.mapLayer].maxZoom) : 0

  const download = useCallback(async () => {
    if (!bounds) return
    setStatusText(null)
    const ctrl = new AbortController()
    abort.current = ctrl
    setDownloading({ done: 0, total: estimated, what: 'Kartrutor' })
    try {
      const res = await downloadArea(
        LAYERS[app.mapLayer],
        bounds,
        11,
        16,
        (done, total) => setDownloading({ done, total, what: 'Kartrutor' }),
        ctrl.signal,
      )
      if (ctrl.signal.aborted) return

      const area = {
        south: bounds.getSouth(), north: bounds.getNorth(),
        west: bounds.getWest(), east: bounds.getEast(),
      }

      // Elevation data is needed to analyse points without coverage.
      setDownloading({ done: 0, total: 1, what: 'Höjddata' })
      await ElevationMosaic.load(
        area,
        12,
        ctrl.signal,
        (done, total) => setDownloading({ done, total, what: 'Höjddata' }),
      )

      /* Land cover, paths and streams over the same area. These are static
         tiles like the ones above — a plain download, and afterwards scans in
         the area never need the net for them. */
      setForestData('waiting')
      const lc = await prefetchLandCover(area, ctrl.signal, setDownloading)
      if (ctrl.signal.aborted) return
      setForestData(lc.fetched === 0 ? 'failed' : lc.failed > 0 ? 'partial' : 'done')

      setStatusText(
        `Klart. ${res.fetched} nya rutor sparade${res.skipped ? `, ${res.skipped} fanns redan` : ''}.`,
      )
    } catch {
      setStatusText('Nedladdningen avbröts eller misslyckades delvis. Det som hann sparas finns kvar.')
    } finally {
      setDownloading(null)
      void refreshStatus()
    }
  }, [bounds, estimated, app.mapLayer, refreshStatus])

  const exportData = useCallback(() => {
    const data = {
      app: 'hitta-svampen',
      version: EXPORT_VERSION,
      exported: new Date().toISOString(),
      finds: app.finds,
      tracks: app.tracks,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `svampfynd-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 3000)
  }, [app.finds, app.tracks])

  /**
   * Imports a backup. Version 1 files were written by the Swedish version and
   * carry Swedish field names — they are translated on the way in rather than
   * rejected, since a backup taken then is exactly the one you reach for.
   */
  const importData = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const j = JSON.parse(await file.text()) as {
          finds?: unknown[]
          tracks?: unknown[]
          fynd?: unknown[]
          spar?: unknown[]
        }
        const rawFinds = j.finds ?? j.fynd ?? []
        const rawTracks = j.tracks ?? j.spar ?? []

        let n = 0
        for (const raw of rawFinds) {
          const f = isLegacyFind(raw) ? migrateFind(raw) : (raw as Find)
          if (f && typeof f.lat === 'number' && typeof f.lon === 'number' && f.id) {
            await saveFind(f)
            n++
          }
        }
        for (const raw of rawTracks) {
          const t = isLegacyTrack(raw) ? migrateTrack(raw) : (raw as Track)
          if (t?.id) await saveTrack(t)
        }
        await app.reload()
        setStatusText(`${n} fynd importerade.`)
      } catch {
        setStatusText('Filen gick inte att läsa. Är det en export från den här appen?')
      }
    },
    [app],
  )

  const learning = learningOverview(SPECIES, app.finds)

  return (
    <div className="scroll">
      <h1 style={{ marginBottom: 4 }}>Hitta Svampen</h1>
      <p className="small dim" style={{ marginBottom: 18 }}>
        Habitatanalys, väderprognos och dina egna svampställen. Allt ligger på den
        här telefonen — inga konton, ingen server, inget som delas.
      </p>

      {/* --- Appearance --- */}
      <div className="card">
        <div className="card-head"><h3>Utseende</h3></div>
        <div className="segment">
          {THEMES.map((t) => (
            <button key={t.id} aria-pressed={app.theme === t.id} onClick={() => app.setTheme(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <p className="small dim" style={{ marginTop: 10 }}>
          Auto följer telefonens eget läge. Ljust läge är samma gränssnitt med omvänd
          palett — gjort för motljus, när solen står i skärmen och det mörka blir en
          spegel. Kartan dämpas inte i ljust läge, så värmekartans guldskala får arbeta
          mot en ljus karta som den är byggd för.
        </p>
      </div>

      {/* --- Offline --- */}
      <div className="card">
        <div className="card-head"><h3>Kartor för offline</h3></div>
        <p className="small dim">
          Det finns sällan mobilnät där svampen står. Ladda hem karta, höjddata och
          skogstyper i förväg så fungerar kartan, GPS:en, skanningen och punktanalysen
          ändå.
        </p>
        <p className="tiny dimmer" style={{ marginTop: 8 }}>
          Skogstyperna är Naturvårdsverkets marktäckekarta, stigar och bäckar kommer
          från OpenStreetMap. Båda hämtas som kartrutor och ligger kvar tills du
          rensar.
        </p>

        {position ? (
          <>
            <div className="segment" style={{ margin: '12px 0 10px' }}>
              {RADII.map((r) => (
                <button key={r} aria-pressed={radius === r} onClick={() => setRadius(r)}>
                  {r} km
                </button>
              ))}
            </div>
            <div className="small dim" style={{ marginBottom: 12 }}>
              {LAYERS[app.mapLayer].name} runt din position · ungefär {plural(estimated, 'ruta', 'rutor')}
              {estimated > 6000 ? ' — det tar en stund och en del utrymme' : ''}
            </div>

            {downloading ? (
              <>
                <div className="row" style={{ gap: 10, marginBottom: 6 }}>
                  <div className="spinner" />
                  <span className="grow small">
                    {downloading.what} {downloading.done} / {downloading.total}
                  </span>
                  <button className="tiny dim" onClick={() => abort.current?.abort()}>Avbryt</button>
                </div>
                <div className="progress">
                  <i style={{ width: `${(downloading.done / Math.max(1, downloading.total)) * 100}%` }} />
                </div>
              </>
            ) : (
              <button className="btn primary wide" onClick={() => void download()}>
                <IconDownload size={19} /> Ladda ner {radius} km härifrån
              </button>
            )}
          </>
        ) : (
          <p className="small" style={{ marginTop: 10 }}>
            Slå på platsen först, så vet appen vilket område som ska sparas.
          </p>
        )}

        {statusText ? <div className="small" style={{ marginTop: 10, color: 'var(--gold-light)' }}>{statusText}</div> : null}

        {forestData === 'done' ? (
          <div className="small" style={{ marginTop: 8, color: 'var(--green)' }}>
            Skogstyper, stigar och vattendrag sparade för hela området. Skanningar
            där hittar dem utan nät.
          </div>
        ) : forestData === 'partial' ? (
          <div className="small" style={{ marginTop: 8, color: 'var(--orange)' }}>
            Det mesta av skogsdatan sparades, men några rutor gick inte att hämta.
            Ladda ner igen om en stund så fylls luckorna i — det som redan finns
            hämtas inte om.
          </div>
        ) : forestData === 'failed' ? (
          <div className="small" style={{ marginTop: 8, color: 'var(--orange)' }}>
            Skogsdatan gick inte att hämta just nu. Kartan och höjddatan finns ändå,
            och du kan försöka igen om en stund. Utan den bygger skanningen bara på
            terrängen.
          </div>
        ) : null}

        <hr className="divider" />
        <div className="row between small" style={{ marginBottom: 6 }}>
          <span className="dim">Starta utan nät</span>
          <span className={coldStart === 'yes' ? 'bold' : 'dimmer'}
                style={coldStart === 'yes' ? { color: 'var(--green)' } : undefined}>
            {coldStart === 'yes' ? 'fungerar' : coldStart === 'no' ? 'inte förberedd än' : 'okänt'}
          </span>
        </div>
        {coldStart === 'no' ? (
          <p className="tiny dimmer" style={{ marginBottom: 8 }}>
            Ladda om sidan en gång med uppkoppling så förbereds den. I utvecklingsläge
            är det här alltid avstängt.
          </p>
        ) : null}
        <div className="row between small">
          <span className="dim">{plural(tileCount, 'sparad ruta', 'sparade rutor')}</span>
          <span className="dimmer">
            {storage.used ? mb(storage.used) : '–'}
            {storage.quota ? ` av ${mb(storage.quota)}` : ''}
          </span>
        </div>
        {tileCount > 0 ? (
          confirmClear ? (
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn narrow" onClick={() => setConfirmClear(false)}>Behåll</button>
              <button
                className="btn narrow danger"
                onClick={async () => { await clearTiles(); setConfirmClear(false); void refreshStatus() }}
              >
                Rensa allt
              </button>
            </div>
          ) : (
            <button className="btn narrow" style={{ marginTop: 10 }} onClick={() => setConfirmClear(true)}>
              Rensa nedladdade kartor
            </button>
          )
        ) : null}
      </div>

      {/* --- What the app has learned --- */}
      <div className="card">
        <div className="card-head"><h3>Vad appen lärt sig av dig</h3></div>
        {learning.length === 0 ? (
          <p className="small dim">
            Ingenting än. Modellen börjar med värden ur litteraturen som gäller Sverige i
            stort. Så fort du sparar fynd med habitatdata börjar den flytta sig mot din
            skog i stället — efter tio fynd av en art väger din erfarenhet lika tungt som
            utgångsvärdet.
          </p>
        ) : (
          <div className="score-parts">
            {learning.map((l) => (
              <div key={l.id}>
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span className="bold small">{l.name}</span>
                  <span className="tiny dimmer">{l.count} fynd · {Math.round(l.strength * 100)}% egen data</span>
                </div>
                <div className="bar" style={{ marginBottom: 5 }}>
                  <i style={{ width: `${l.strength * 100}%`, background: 'var(--gold)' }} />
                </div>
                {l.remarks.map((r, i) => (
                  <div key={i} className="tiny dim">· {r}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Data --- */}
      <div className="card">
        <div className="card-head"><h3>Dina fynd</h3></div>
        <p className="small dim">
          Fyndplatser är personlig egendom. De lämnar aldrig telefonen av sig själva —
          men de försvinner om du rensar webbläsardatan. Ta en säkerhetskopia.
        </p>

        <div className="row between small" style={{ marginTop: 12 }}>
          <span className="dim">Skyddad mot automatisk rensning</span>
          <span
            className={persistent ? 'bold' : 'dimmer'}
            style={persistent ? { color: 'var(--green)' } : undefined}
          >
            {persistent === null ? '…' : persistent ? 'ja' : 'nej'}
          </span>
        </div>
        {persistent === false ? (
          <>
            <p className="tiny dimmer" style={{ marginTop: 6 }}>
              Webbläsaren kan rensa lagringen vid utrymmesbrist, och Safari gör det efter
              ungefär en veckas inaktivitet. Lägg till appen på hemskärmen så beviljas
              undantaget nästan alltid.
            </p>
            <button
              className="btn narrow"
              style={{ marginTop: 8 }}
              onClick={() => void requestPersistentStorage().then(setPersistent)}
            >
              Be om skydd nu
            </button>
          </>
        ) : null}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportData} disabled={app.finds.length === 0}>
            Exportera
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importera</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" onChange={(e) => void importData(e)} style={{ display: 'none' }} />
      </div>

      {/* --- Sources --- */}
      <div className="card">
        <div className="card-head"><h3>Var datan kommer ifrån</h3></div>
        <ul className="bullets">
          <li><strong>Nationella marktäckedata</strong> (Naturvårdsverket) — skogstyp ner till tall, gran och löv, hyggen, myrar, åkrar och vatten. Tio meters raster över hela Sverige.</li>
          <li><strong>OpenStreetMap</strong> via OpenFreeMap — stigar, traktorspår, bäckar och diken.</li>
          <li><strong>Terrängkakel</strong> (AWS Open Data, Terrarium) — höjddata på cirka tio meters upplösning, grunden för lutning, väderstreck och våtindex.</li>
          <li><strong>Open-Meteo</strong> (ERA5 och ICON) — nederbörd, marktemperatur och markfukt på 9–27 cm djup, 60 dygn bakåt och 16 framåt.</li>
          <li><strong>GBIF</strong> — rapporterade fynd, i Sverige mest från Artportalen.</li>
          <li><strong>OpenTopoMap</strong> och <strong>Esri</strong> — kartbilder.</li>
        </ul>
        <p className="tiny dimmer" style={{ marginTop: 10 }}>
          Kartdata © OpenStreetMaps bidragsgivare, ODbL. Marktäckedata CC0 Naturvårdsverket.
          Tjänsterna är gratis och delvis idealt drivna — var snäll mot dem och skanna inte i onödan.
        </p>
      </div>

      {/* --- Liability --- */}
      <div className="warning">
        <div className="row" style={{ gap: 9, marginBottom: 7 }}>
          <IconWarning size={19} />
          <strong>Appen hittar platser, inte svampar</strong>
        </div>
        Modellen pekar ut var förutsättningarna är goda. Den kan inte se enskilda
        svampar, den vet inte om det avverkats i förrgår, och den kan inte artbestämma
        något åt dig. Ät bara svamp du själv är säker på.
      </div>

      <p className="tiny dimmer center" style={{ marginTop: 18 }}>
        Byggd för en enda användare. Trevlig tur.
      </p>
    </div>
  )
}
