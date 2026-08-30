import { useCallback, useEffect, useMemo, useState } from 'react'
import { ARTER, art, HUVUDARTER } from '../data/arter.ts'
import { hamtaVader, type Vaderserie } from '../data/vader.ts'
import { chansfarg } from '../lib/farg.ts'
import { useApp } from '../state/app.tsx'
import {
  beraknaFruktsattning, prognosframat, sasongsfaktor, sasongsText,
} from '../model/fruktsattning.ts'
import { anpassaArt } from '../model/personlig.ts'
import { Chansmatare } from '../components/Poang.tsx'
import { artIkon, artfarg } from '../components/Artikoner.tsx'
import { Prognosdiagram, Regndiagram } from '../components/Diagram.tsx'
import { IkonSikte, IkonSol } from '../components/Ikoner.tsx'
import { dagsljus } from '../lib/tid.ts'

/* "Visa alla nio arter" läser bättre än "Visa alla 9 arter", och antalet ska
   räknas fram och inte stå skrivet i klartext. */
const RAKNEORD = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv']
const rakneord = (n: number) => RAKNEORD[n] ?? String(n)

/** Hur många arter listan visar innan man ber om resten. */
const ARTER_I_KORTLISTAN = 5

export function PrognosVy() {
  const app = useApp()
  const [vader, setVader] = useState<Vaderserie | null>(null)
  const [laddar, setLaddar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)
  const [allaArter, setAllaArter] = useState(false)

  const plats = app.gps.plats ?? app.sistaPlats

  const hamta = useCallback(async () => {
    if (!plats) return
    setLaddar(true)
    setFel(null)
    try {
      setVader(await hamtaVader(plats.lat, plats.lon))
    } catch {
      setFel('Kunde inte hämta vädret. Prognosen behöver uppkoppling minst en gång per dag.')
    } finally {
      setLaddar(false)
    }
  }, [plats])

  useEffect(() => {
    void hamta()
  }, [hamta])

  const artData = useMemo(
    () => anpassaArt(art(app.valdArt), app.fynd).art,
    [app.valdArt, app.fynd],
  )

  const analys = useMemo(() => {
    if (!vader || !plats) return null
    const idagDatum = vader.serie[vader.idag]!.datum
    const f = beraknaFruktsattning(vader.serie, artData, idagDatum)
    const s = sasongsfaktor(artData, new Date(), plats.lat)
    const framat = prognosframat(vader.serie, artData, plats.lat, vader.idag, 16)
    const bast = framat.reduce((a, b) => (b.chans > a.chans ? b : a), framat[0]!)
    return { f, s, framat, bast, chans: f.index * s * 100 }
  }, [vader, artData, plats])

  /** Vilka arter som är värda att leta efter just nu. */
  const artlage = useMemo(() => {
    if (!vader || !plats) return []
    const idagDatum = vader.serie[vader.idag]!.datum
    return ARTER.filter((a) => a.id !== 'annat')
      .map((bas) => {
        const { art: a } = anpassaArt(bas, app.fynd)
        const f = beraknaFruktsattning(vader.serie, a, idagDatum)
        const s = sasongsfaktor(a, new Date(), plats.lat)
        return { art: a, index: f.index, sasong: s, chans: f.index * s * 100 }
      })
      .sort((a, b) => b.chans - a.chans)
  }, [vader, plats, app.fynd])

  if (!plats) {
    return (
      <div className="rullar">
        <div className="tom">
          <span className="emoji">📍</span>
          <p>Prognosen behöver veta var du är — vädret skiljer sig rejält mellan grannskogar.</p>
          <button className="knapp primar" onClick={app.gps.starta} style={{ marginTop: 12 }}>
            <IkonSikte size={18} /> Slå på platsen
          </button>
          {app.gps.meddelande ? <p className="liten svag" style={{ marginTop: 12 }}>{app.gps.meddelande}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="rullar">
      <div className="chipsrad" style={{ marginBottom: 14 }}>
        <div className="chips rad">
          {HUVUDARTER.map((id) => {
            const a = art(id)
            const Ikon = artIkon(id)
            return (
              <button key={id} className="chip" aria-pressed={app.valdArt === id} onClick={() => app.setValdArt(id)}>
                <Ikon size={17} style={{ color: artfarg(id) }} />
                {a.namn}
              </button>
            )
          })}
        </div>
      </div>

      {laddar && !vader ? (
        <div className="tom">
          <div className="snurra" style={{ margin: '0 auto 14px', width: 26, height: 26 }} />
          Hämtar 60 dygn väderhistorik…
        </div>
      ) : fel ? (
        <div className="fara-ruta">{fel}</div>
      ) : analys && vader ? (
        <>
          {/* Arten står redan i chipset ovanför, så mätaren behöver ingen
              egen etikett. Dagsljus och säsong delar fotrad: båda svarar på
              hur långt fram vi är, det ena på dygnet och det andra på året. */}
          <div className="kort" style={{ padding: '18px 14px 16px' }}>
            <Chansmatare procent={analys.chans} />
            <div className="matarfot">
              {(() => {
                const ljus = dagsljus(vader.serie[vader.idag])
                return ljus.text ? (
                  <span>
                    <IkonSol size={15} />
                    {ljus.text}
                  </span>
                ) : null
              })()}
              <span>{sasongsText(artData, new Date(), plats.lat)}</span>
            </div>
            {vader.gammal ? (
              <div className="mini svagast mitten" style={{ marginTop: 10 }}>
                Sparad data — appen har inte nått nätet på ett tag
              </div>
            ) : null}
          </div>

          {/* Bästa dagen var den enda anledningen att titta under diagrammet.
              Nu står den ovanför det, i kort form. */}
          <div className="kort">
            <div className="kort-rubrik">
              <h3>Kommande dygn</h3>
              {analys.bast.chans > analys.framat[0]!.chans * 1.12 && analys.bast.chans > 0.1 ? (
                <span className="liten" style={{ color: 'var(--guld-ljus)' }}>
                  Bäst {new Date(analys.bast.datum + 'T12:00:00').toLocaleDateString('sv-SE', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  }).replace('.', '')} · {Math.round(analys.bast.chans * 100)} %
                </span>
              ) : (
                <span className="liten svag">
                  {analys.chans > 30 ? 'Redan så bra det blir' : 'Ingen förbättring i sikte'}
                </span>
              )}
            </div>
            <Prognosdiagram dagar={analys.framat.slice(0, 12)} />
          </div>

          <div className="kort">
            <div className="kort-rubrik">
              <h3>Regnet som räknas</h3>
            </div>
            <p className="liten svag">
              {artData.namn} reagerar på regn som föll för ungefär {artData.regnfordrojning.topp} dygn
              sedan — det är det gulmarkerade fönstret. Gårdagens skyfall syns inte i korgen förrän
              om ett par veckor.
            </p>
            <Regndiagram
              serie={vader.serie}
              idag={vader.idag}
              topp={artData.regnfordrojning.topp}
              bredd={artData.regnfordrojning.bredd}
            />
            {/* Regnet i fördröjningsfönstret är den siffra hela modellen
                bygger på och den enda som förtjänar guld. */}
            <div className="varderutor" style={{ marginTop: 14 }}>
              <div className="varderuta">
                <span className="e">I fönstret</span>
                <span className="v" style={{ color: 'var(--guld-text)' }}>
                  {Math.round(analys.f.regnFonsterMm)} mm
                </span>
              </div>
              <div className="varderuta">
                <span className="e">30 dygn</span>
                <span className="v">{Math.round(analys.f.regn30)} mm</span>
              </div>
              <div className="varderuta">
                <span className="e">7 dygn</span>
                <span className="v">{Math.round(analys.f.regn7)} mm</span>
              </div>
              <div className="varderuta">
                <span className="e">Sen regn</span>
                <span className="v">
                  {analys.f.dagarSedanRegn === null ? '30+ dygn' : `${analys.f.dagarSedanRegn} dygn`}
                </span>
              </div>
            </div>
          </div>

          <div className="kort">
            <div className="kort-rubrik">
              <h3>Marken just nu</h3>
            </div>
            <div className="matvarden" style={{ marginBottom: 12 }}>
              <div className="matvarde">
                <div className="v" style={{ color: chansfarg(analys.f.markfukt) }}>
                  {(analys.f.medelMarkfukt * 100).toFixed(0)}%
                </div>
                <div className="e">markfukt 9–27 cm</div>
              </div>
              <div className="matvarde">
                <div className="v" style={{ color: chansfarg(analys.f.marktemp) }}>
                  {analys.f.medelMarktemp.toFixed(1)}°
                </div>
                <div className="e">marktemp 6 cm</div>
              </div>
              <div className="matvarde">
                <div className="v" style={{ color: chansfarg(analys.f.index) }}>
                  {Math.round(analys.f.index * 100)}%
                </div>
                <div className="e">fruktsättning</div>
              </div>
            </div>
            <ul className="punktlista">
              {analys.f.forklaring.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>

          <div className="kort">
            <div className="kort-rubrik">
              <h3>Vad som står i skogen nu</h3>
            </div>
            <div className="artlage">
              {(allaArter ? artlage : artlage.slice(0, ARTER_I_KORTLISTAN)).map((a) => {
                const Ikon = artIkon(a.art.id)
                return (
                <button
                  key={a.art.id}
                  className="artrad"
                  onClick={() => app.setValdArt(a.art.id)}
                  aria-pressed={app.valdArt === a.art.id}
                >
                  <span className="artikon"><Ikon size={17} style={{ color: artfarg(a.art.id) }} /></span>
                  <span className="vaxa trunka fet liten">{a.art.namn}</span>
                  <span className="stapel" style={{ width: 74 }}>
                    <i style={{ width: `${Math.max(2, a.chans)}%`, background: chansfarg(a.chans / 100) }} />
                  </span>
                  <span className="siffror liten" style={{ width: 34, textAlign: 'right', color: chansfarg(a.chans / 100) }}>
                    {Math.round(a.chans)}%
                  </span>
                </button>
                )
              })}
            </div>
            {artlage.length > ARTER_I_KORTLISTAN ? (
              <button className="visa-alla" onClick={() => setAllaArter((v) => !v)} aria-expanded={allaArter}>
                {allaArter ? 'Visa färre' : `Visa alla ${rakneord(artlage.length)} arter`}
              </button>
            ) : null}
          </div>

          <p className="mini svagast mitten" style={{ marginTop: 4 }}>
            Väderdata från Open-Meteo (ERA5 och ICON). Position {plats.lat.toFixed(3)}, {plats.lon.toFixed(3)}.
          </p>
        </>
      ) : null}
    </div>
  )
}
