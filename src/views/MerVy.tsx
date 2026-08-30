import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { ARTER } from '../data/arter.ts'
import {
  antalRutor, arLagringBestandig, begarBestandigLagring, lagringsstatus, rensaRutor,
  sparaFynd, sparaSpar,
} from '../lib/db.ts'
import { LAGER, laddaNedOmrade, raknaRutor } from '../components/kartlager.ts'
import { FORHAMTNING_BREDD_M, forhamtaLandtacke } from '../data/overpass.ts'
import { Hojdmosaik } from '../data/hojdkakel.ts'
import { antal } from '../lib/geo.ts'
import { larandeOversikt } from '../model/personlig.ts'
import { useApp } from '../state/app.tsx'
import { IkonNedladdning, IkonVarning } from '../components/Ikoner.tsx'
import type { Find, Spar } from '../lib/types.ts'
import type { Tema } from '../lib/tema.ts'

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1)} MB`

const RADIER = [2, 5, 10]

const TEMAN: { id: Tema; namn: string }[] = [
  { id: 'auto', namn: 'Auto' },
  { id: 'ljus', namn: 'Ljust' },
  { id: 'mork', namn: 'Mörkt' },
]

export function MerVy() {
  const app = useApp()
  const [rutor, setRutor] = useState(0)
  const [lagring, setLagring] = useState({ anvant: 0, kvot: 0 })
  const [radie, setRadie] = useState(5)
  const [laddar, setLaddar] = useState<{ klara: number; totalt: number; vad: string } | null>(null)
  const [skogsdata, setSkogsdata] = useState<'vantar' | 'klar' | 'misslyckades' | null>(null)
  const [klarText, setKlarText] = useState<string | null>(null)
  const [bekraftaRensa, setBekraftaRensa] = useState(false)
  const [kallstart, setKallstart] = useState<'ja' | 'nej' | 'okand'>('okand')
  const [bestandig, setBestandig] = useState<boolean | null>(null)
  const avbryt = useRef<AbortController | null>(null)
  const filRef = useRef<HTMLInputElement>(null)

  const plats = app.gps.plats ?? app.sistaPlats

  const uppdateraStatus = useCallback(async () => {
    setRutor(await antalRutor())
    setLagring(await lagringsstatus())
  }, [])

  useEffect(() => { void uppdateraStatus() }, [uppdateraStatus])
  useEffect(() => { void arLagringBestandig().then(setBestandig) }, [])

  // Går appen att starta helt utan nät? Det avgörs av om serviceworkern
  // registrerats, och det vill man veta innan man kör ut i skogen.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setKallstart('nej')
      return
    }
    let levande = true
    void navigator.serviceWorker
      .getRegistrations()
      .then((r) => levande && setKallstart(r.some((x) => x.active) ? 'ja' : 'nej'))
      .catch(() => levande && setKallstart('okand'))
    return () => { levande = false }
  }, [rutor])

  const bounds = plats
    ? L.latLng(plats.lat, plats.lon).toBounds(radie * 2000)
    : null
  const uppskattat = bounds ? raknaRutor(bounds, 11, 16, LAGER[app.kartlager].maxZoom) : 0

  const laddaNed = useCallback(async () => {
    if (!bounds) return
    setKlarText(null)
    const ctrl = new AbortController()
    avbryt.current = ctrl
    setLaddar({ klara: 0, totalt: uppskattat, vad: 'Kartrutor' })
    try {
      const res = await laddaNedOmrade(
        LAGER[app.kartlager],
        bounds,
        11,
        16,
        (klara, totalt) => setLaddar({ klara, totalt, vad: 'Kartrutor' }),
        ctrl.signal,
      )
      if (ctrl.signal.aborted) return

      // Höjddatan behövs för att kunna analysera punkter utan täckning.
      setLaddar({ klara: 0, totalt: 1, vad: 'Höjddata' })
      await Hojdmosaik.ladda(
        {
          south: bounds.getSouth(), north: bounds.getNorth(),
          west: bounds.getWest(), east: bounds.getEast(),
        },
        12,
        ctrl.signal,
        (klara, totalt) => setLaddar({ klara, totalt, vad: 'Höjddata' }),
      )

      /* Skogsdatan sist, och med tålamod. Overpass stryper hårt och är det
         enda steget som brukar strula ute i skogen — här får den i stället
         några minuter vid köksbordet, och sedan ligger den i cachen. */
      if (plats) {
        setSkogsdata('vantar')
        const lyckades = await forhamtaLandtacke(
          { lat: plats.lat, lon: plats.lon },
          ctrl.signal,
          (l) =>
            setLaddar({
              klara: l.forsok,
              totalt: l.avForsok,
              vad: l.vantar
                ? `Skogsdata — väntar ${l.sekunderKvar} s före försök ${l.forsok + 1}`
                : `Skogsdata, försök ${l.forsok} av ${l.avForsok}`,
            }),
        )
        setSkogsdata(lyckades ? 'klar' : 'misslyckades')
      }

      setKlarText(
        `Klart. ${res.hamtade} nya rutor sparade${res.hoppade ? `, ${res.hoppade} fanns redan` : ''}.`,
      )
    } catch {
      setKlarText('Nedladdningen avbröts eller misslyckades delvis. Det som hann sparas finns kvar.')
    } finally {
      setLaddar(null)
      void uppdateraStatus()
    }
  }, [bounds, uppskattat, app.kartlager, uppdateraStatus, plats])

  const exportera = useCallback(() => {
    const data = {
      app: 'hitta-svampen',
      version: 1,
      exporterad: new Date().toISOString(),
      fynd: app.fynd,
      spar: app.spar,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `svampfynd-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 3000)
  }, [app.fynd, app.spar])

  const importera = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fil = e.target.files?.[0]
      e.target.value = ''
      if (!fil) return
      try {
        const j = JSON.parse(await fil.text()) as { fynd?: Find[]; spar?: Spar[] }
        let n = 0
        for (const f of j.fynd ?? []) {
          if (typeof f.lat === 'number' && typeof f.lon === 'number' && f.id) {
            await sparaFynd(f)
            n++
          }
        }
        for (const s of j.spar ?? []) if (s.id) await sparaSpar(s)
        await app.laddaOm()
        setKlarText(`${n} fynd importerade.`)
      } catch {
        setKlarText('Filen gick inte att läsa. Är det en export från den här appen?')
      }
    },
    [app],
  )

  const larande = larandeOversikt(ARTER, app.fynd)

  return (
    <div className="rullar">
      <h1 style={{ marginBottom: 4 }}>Hitta Svampen</h1>
      <p className="liten svag" style={{ marginBottom: 18 }}>
        Habitatanalys, väderprognos och dina egna svampställen. Allt ligger på den
        här telefonen — inga konton, ingen server, inget som delas.
      </p>

      {/* --- Utseende --- */}
      <div className="kort">
        <div className="kort-rubrik"><h3>Utseende</h3></div>
        <div className="segment">
          {TEMAN.map((t) => (
            <button key={t.id} aria-pressed={app.tema === t.id} onClick={() => app.setTema(t.id)}>
              {t.namn}
            </button>
          ))}
        </div>
        <p className="liten svag" style={{ marginTop: 10 }}>
          Auto följer telefonens eget läge. Ljust läge är samma gränssnitt med omvänd
          palett — gjort för motljus, när solen står i skärmen och det mörka blir en
          spegel. Kartan dämpas inte i ljust läge, så värmekartans guldskala får arbeta
          mot en ljus karta som den är byggd för.
        </p>
      </div>

      {/* --- Offline --- */}
      <div className="kort">
        <div className="kort-rubrik"><h3>Kartor för offline</h3></div>
        <p className="liten svag">
          Det finns sällan mobilnät där svampen står. Ladda hem karta, höjddata och
          skogstyper i förväg så fungerar kartan, GPS:en, skanningen och punktanalysen
          ändå.
        </p>
        <p className="mini svagast" style={{ marginTop: 8 }}>
          Skogsdatan kommer från Overpass, som stryper hårt och ofta failar om man
          frågar ute i skogen. Här får den några minuter och flera försök i stället —
          och sedan ligger den kvar i en vecka.
        </p>

        {plats ? (
          <>
            <div className="segment" style={{ margin: '12px 0 10px' }}>
              {RADIER.map((r) => (
                <button key={r} aria-pressed={radie === r} onClick={() => setRadie(r)}>
                  {r} km
                </button>
              ))}
            </div>
            <div className="liten svag" style={{ marginBottom: 12 }}>
              {LAGER[app.kartlager].namn} runt din position · ungefär {antal(uppskattat, 'ruta', 'rutor')}
              {uppskattat > 6000 ? ' — det tar en stund och en del utrymme' : ''}
            </div>

            {laddar ? (
              <>
                <div className="rad" style={{ gap: 10, marginBottom: 6 }}>
                  <div className="snurra" />
                  <span className="vaxa liten">
                    {laddar.vad} {laddar.klara} / {laddar.totalt}
                  </span>
                  <button className="mini svag" onClick={() => avbryt.current?.abort()}>Avbryt</button>
                </div>
                <div className="framstegsrad">
                  <i style={{ width: `${(laddar.klara / Math.max(1, laddar.totalt)) * 100}%` }} />
                </div>
              </>
            ) : (
              <button className="knapp primar bred" onClick={() => void laddaNed()}>
                <IkonNedladdning size={19} /> Ladda ner {radie} km härifrån
              </button>
            )}
          </>
        ) : (
          <p className="liten" style={{ marginTop: 10 }}>
            Slå på platsen först, så vet appen vilket område som ska sparas.
          </p>
        )}

        {klarText ? <div className="liten" style={{ marginTop: 10, color: 'var(--guld-ljus)' }}>{klarText}</div> : null}

        {skogsdata === 'klar' ? (
          <div className="liten" style={{ marginTop: 8, color: 'var(--gron)' }}>
            Skogsdata hämtad för {(FORHAMTNING_BREDD_M / 1000).toFixed(1)} km runt din position.
            Skanningar där hittar den utan nät.
          </div>
        ) : skogsdata === 'misslyckades' ? (
          <div className="liten" style={{ marginTop: 8, color: 'var(--orange)' }}>
            Skogsdatan gick inte att hämta — Overpass stryper hårt just nu. Kartan och
            höjddatan finns ändå, och du kan försöka igen om en stund. Utan den bygger
            skanningen bara på terrängen.
          </div>
        ) : null}

        <hr className="skiljare" />
        <div className="rad mellan liten" style={{ marginBottom: 6 }}>
          <span className="svag">Starta utan nät</span>
          <span className={kallstart === 'ja' ? 'fet' : 'svagast'}
                style={kallstart === 'ja' ? { color: 'var(--gron)' } : undefined}>
            {kallstart === 'ja' ? 'fungerar' : kallstart === 'nej' ? 'inte förberedd än' : 'okänt'}
          </span>
        </div>
        {kallstart === 'nej' ? (
          <p className="mini svagast" style={{ marginBottom: 8 }}>
            Ladda om sidan en gång med uppkoppling så förbereds den. I utvecklingsläge
            är det här alltid avstängt.
          </p>
        ) : null}
        <div className="rad mellan liten">
          <span className="svag">{antal(rutor, 'sparad ruta', 'sparade rutor')}</span>
          <span className="svagast">
            {lagring.anvant ? mb(lagring.anvant) : '–'}
            {lagring.kvot ? ` av ${mb(lagring.kvot)}` : ''}
          </span>
        </div>
        {rutor > 0 ? (
          bekraftaRensa ? (
            <div className="knapprad" style={{ marginTop: 10 }}>
              <button className="knapp smal" onClick={() => setBekraftaRensa(false)}>Behåll</button>
              <button
                className="knapp smal fara"
                onClick={async () => { await rensaRutor(); setBekraftaRensa(false); void uppdateraStatus() }}
              >
                Rensa allt
              </button>
            </div>
          ) : (
            <button className="knapp smal" style={{ marginTop: 10 }} onClick={() => setBekraftaRensa(true)}>
              Rensa nedladdade kartor
            </button>
          )
        ) : null}
      </div>

      {/* --- Vad appen lärt sig --- */}
      <div className="kort">
        <div className="kort-rubrik"><h3>Vad appen lärt sig av dig</h3></div>
        {larande.length === 0 ? (
          <p className="liten svag">
            Ingenting än. Modellen börjar med värden ur litteraturen som gäller Sverige i
            stort. Så fort du sparar fynd med habitatdata börjar den flytta sig mot din
            skog i stället — efter tio fynd av en art väger din erfarenhet lika tungt som
            utgångsvärdet.
          </p>
        ) : (
          <div className="delpoang">
            {larande.map((l) => (
              <div key={l.id}>
                <div className="rad mellan" style={{ marginBottom: 4 }}>
                  <span className="fet liten">{l.namn}</span>
                  <span className="mini svagast">{l.antal} fynd · {Math.round(l.styrka * 100)}% egen data</span>
                </div>
                <div className="stapel" style={{ marginBottom: 5 }}>
                  <i style={{ width: `${l.styrka * 100}%`, background: 'var(--guld)' }} />
                </div>
                {l.anmarkningar.map((a, i) => (
                  <div key={i} className="mini svag">· {a}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Data --- */}
      <div className="kort">
        <div className="kort-rubrik"><h3>Dina fynd</h3></div>
        <p className="liten svag">
          Fyndplatser är personlig egendom. De lämnar aldrig telefonen av sig själva —
          men de försvinner om du rensar webbläsardatan. Ta en säkerhetskopia.
        </p>

        <div className="rad mellan liten" style={{ marginTop: 12 }}>
          <span className="svag">Skyddad mot automatisk rensning</span>
          <span
            className={bestandig ? 'fet' : 'svagast'}
            style={bestandig ? { color: 'var(--gron)' } : undefined}
          >
            {bestandig === null ? '…' : bestandig ? 'ja' : 'nej'}
          </span>
        </div>
        {bestandig === false ? (
          <>
            <p className="mini svagast" style={{ marginTop: 6 }}>
              Webbläsaren kan rensa lagringen vid utrymmesbrist, och Safari gör det efter
              ungefär en veckas inaktivitet. Lägg till appen på hemskärmen så beviljas
              undantaget nästan alltid.
            </p>
            <button
              className="knapp smal"
              style={{ marginTop: 8 }}
              onClick={() => void begarBestandigLagring().then(setBestandig)}
            >
              Be om skydd nu
            </button>
          </>
        ) : null}
        <div className="knapprad" style={{ marginTop: 12 }}>
          <button className="knapp" onClick={exportera} disabled={app.fynd.length === 0}>
            Exportera
          </button>
          <button className="knapp" onClick={() => filRef.current?.click()}>Importera</button>
        </div>
        <input ref={filRef} type="file" accept="application/json" onChange={(e) => void importera(e)} style={{ display: 'none' }} />
      </div>

      {/* --- Källor --- */}
      <div className="kort">
        <div className="kort-rubrik"><h3>Var datan kommer ifrån</h3></div>
        <ul className="punktlista">
          <li><strong>OpenStreetMap</strong> via Overpass — skogstyp, myrar, vattendrag och stigar.</li>
          <li><strong>Terrängkakel</strong> (AWS Open Data, Terrarium) — höjddata på cirka tio meters upplösning, grunden för lutning, väderstreck och våtindex.</li>
          <li><strong>Open-Meteo</strong> (ERA5 och ICON) — nederbörd, marktemperatur och markfukt på 9–27 cm djup, 60 dygn bakåt och 16 framåt.</li>
          <li><strong>GBIF</strong> — rapporterade fynd, i Sverige mest från Artportalen.</li>
          <li><strong>OpenTopoMap</strong> och <strong>Esri</strong> — kartbilder.</li>
        </ul>
        <p className="mini svagast" style={{ marginTop: 10 }}>
          Kartdata © OpenStreetMaps bidragsgivare, ODbL. Tjänsterna är gratis och
          delvis idealt drivna — var snäll mot dem och skanna inte i onödan.
        </p>
      </div>

      {/* --- Ansvar --- */}
      <div className="varning">
        <div className="rad" style={{ gap: 9, marginBottom: 7 }}>
          <IkonVarning size={19} />
          <strong>Appen hittar platser, inte svampar</strong>
        </div>
        Modellen pekar ut var förutsättningarna är goda. Den kan inte se enskilda
        svampar, den vet inte om det avverkats i förrgår, och den kan inte artbestämma
        något åt dig. Ät bara svamp du själv är säker på.
      </div>

      <p className="mini svagast mitten" style={{ marginTop: 18 }}>
        Byggd för en enda användare. Trevlig tur.
      </p>
    </div>
  )
}
