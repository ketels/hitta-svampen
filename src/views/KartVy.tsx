import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Karta, type KartHandtag } from '../components/Karta.tsx'
import { Ark } from '../components/Ark.tsx'
import { FyndFormular } from '../components/FyndFormular.tsx'
import { PunktDetalj } from '../components/PunktDetalj.tsx'
import { FyndDetalj } from '../components/FyndDetalj.tsx'
import {
  IkonKryss, IkonLager, IkonNal, IkonNed, IkonPlus, IkonRadar, IkonSikte, IkonSpar,
  IkonVarning,
} from '../components/Ikoner.tsx'
import { LAGER } from '../components/kartlager.ts'
import { art, HUVUDARTER } from '../data/arter.ts'
import { avstand, baring, formateraAvstand, kompass } from '../lib/geo.ts'
import { nyttId, sparaSpar } from '../lib/db.ts'
import { chansfarg, chansOrd, varmeGradient } from '../lib/farg.ts'
import { dagsljus, sedan } from '../lib/tid.ts'
import { useApp, type Kartlager } from '../state/app.tsx'
import type { Find, LatLng } from '../lib/types.ts'
import {
  analyseraPunkt, bedomFranSkanning, skanna, type Punktbedomning,
} from '../model/skanning.ts'
import { berikaFynd } from '../model/berika.ts'

type Skanlage = { steg: string; andel: number }

export function KartVy({ aktiv }: { aktiv: boolean }) {
  const app = useApp()
  const handtag = useRef<KartHandtag | null>(null)

  const [foljGPS, setFoljGPS] = useState(false)
  const [vald, setVald] = useState<LatLng | null>(null)
  const [bedomning, setBedomning] = useState<Punktbedomning | null>(null)
  const [bedomningFel, setBedomningFel] = useState<string | null>(null)
  const [laddarPunkt, setLaddarPunkt] = useState(false)
  const [skanlage, setSkanlage] = useState<Skanlage | null>(null)
  const [skanfel, setSkanfel] = useState<string | null>(null)
  const [ark, setArk] = useState<'punkt' | 'nyttFynd' | 'fynd' | 'lager' | null>(null)
  const [valtFynd, setValtFynd] = useState<Find | null>(null)
  const [varmelager, setVarmelager] = useState<'habitat' | 'chans'>('habitat')
  const [visaVarme, setVisaVarme] = useState(true)
  const [spelarIn, setSpelarIn] = useState(false)
  const [sparPunkter, setSparPunkter] = useState<{ lat: number; lon: number; t: number; alt: number | null }[]>([])
  const avbrytRef = useRef<AbortController | null>(null)

  const artData = art(app.valdArt)
  const plats = app.gps.plats

  /* --- Starta GPS när kartan visas första gången --- */
  useEffect(() => {
    if (aktiv && app.gps.status === 'av') {
      app.gps.starta()
      setFoljGPS(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv])

  useEffect(() => {
    if (aktiv) handtag.current?.karta?.invalidateSize()
  }, [aktiv])

  /* --- Flyg till målpunkt när en annan vy begär det --- */
  useEffect(() => {
    if (app.malpunkt && handtag.current) {
      handtag.current.flygTill(app.malpunkt.lat, app.malpunkt.lon, app.malpunkt.zoom)
      setFoljGPS(false)
    }
  }, [app.malpunkt])

  /* --- Spela in spår --- */
  useEffect(() => {
    if (!spelarIn || !plats) return
    setSparPunkter((p) => {
      const sista = p[p.length - 1]
      // Filtrera bort GPS-brus när man står still.
      if (sista && avstand(sista, plats) < 6) return p
      return [...p, { lat: plats.lat, lon: plats.lon, t: plats.tid, alt: plats.hojd }]
    })
  }, [spelarIn, plats])

  const avslutaSpar = useCallback(async () => {
    setSpelarIn(false)
    if (sparPunkter.length > 2) {
      let langd = 0
      for (let i = 1; i < sparPunkter.length; i++) langd += avstand(sparPunkter[i - 1]!, sparPunkter[i]!)
      await sparaSpar({
        id: nyttId(),
        namn: new Date(sparPunkter[0]!.t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }),
        start: sparPunkter[0]!.t,
        slut: sparPunkter[sparPunkter.length - 1]!.t,
        punkter: sparPunkter,
        langd,
      })
      await app.laddaOm()
    }
    setSparPunkter([])
  }, [sparPunkter, app])

  /* --- Bedöm en punkt man tryckt på --- */
  const bedomPunkt = useCallback(
    async (p: LatLng) => {
      setVald(p)
      setArk('punkt')
      setBedomningFel(null)
      const snabb = app.skanning && app.skanning.art === app.valdArt
        ? bedomFranSkanning(app.skanning, p, app.fynd)
        : null
      if (snabb) {
        setBedomning(snabb)
        return
      }
      setBedomning(null)
      setLaddarPunkt(true)
      avbrytRef.current?.abort()
      const ctrl = new AbortController()
      avbrytRef.current = ctrl
      try {
        setBedomning(await analyseraPunkt(p, app.valdArt, app.fynd, ctrl.signal))
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setBedomningFel(
            e instanceof Error && /nätverk|fetch|Failed/i.test(e.message)
              ? 'Ingen uppkoppling — kan inte analysera nya punkter offline.'
              : 'Kunde inte analysera punkten just nu.',
          )
        }
      } finally {
        if (!ctrl.signal.aborted) setLaddarPunkt(false)
      }
    },
    [app.skanning, app.valdArt, app.fynd],
  )

  /* --- Skanna området --- */
  const kor = useCallback(async () => {
    const karta = handtag.current?.karta
    if (!karta) return
    const c = karta.getCenter()
    // Radien följer det som faktiskt syns, men hålls inom rimliga gränser.
    const synligRadie = karta.distance(c, karta.getBounds().getNorthEast()) * 0.72
    const radie = Math.max(500, Math.min(2500, Math.round(synligRadie / 100) * 100))

    setSkanfel(null)
    setSkanlage({ steg: 'Startar', andel: 0 })
    avbrytRef.current?.abort()
    const ctrl = new AbortController()
    avbrytRef.current = ctrl
    try {
      const s = await skanna({
        centrum: { lat: c.lat, lon: c.lng },
        radieM: radie,
        art: app.valdArt,
        fynd: app.fynd,
        framsteg: (steg, andel) => setSkanlage({ steg, andel }),
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      app.setSkanning(s)
      setVisaVarme(true)
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setSkanfel(
          e instanceof Error && /höjddata|fetch|Failed|nätverk/i.test(e.message)
            ? 'Kunde inte hämta underlag. Kolla uppkopplingen och försök igen.'
            : 'Skanningen misslyckades.',
        )
      }
    } finally {
      if (!ctrl.signal.aborted) setSkanlage(null)
    }
  }, [app])

  /* --- Spara ett fynd --- */
  const sparaNytt = useCallback(
    async (f: Find) => {
      setArk(null)
      await app.spara(f)
      // Habitatdatan hämtas i bakgrunden så man aldrig väntar i skogen.
      void berikaFynd(f, [...app.fynd, f], app.skanning).then((b) => {
        if (b) void app.laddaOm()
      })
    },
    [app],
  )

  /**
   * Var fyndet hamnar. GPS först, sedan punkten man tryckt på, och som sista
   * utväg kartans mitt — bättre än en avstängd knapp när man står under en
   * gran och satelliterna inte hittar hem.
   */
  const [fyndplats, setFyndplats] = useState<
    { lat: number; lon: number; noggrannhet: number | null; kalla: 'gps' | 'punkt' | 'karta' } | null
  >(null)

  const oppnaNyttFynd = useCallback(() => {
    if (plats) {
      setFyndplats({ lat: plats.lat, lon: plats.lon, noggrannhet: plats.noggrannhet, kalla: 'gps' })
    } else if (vald) {
      setFyndplats({ lat: vald.lat, lon: vald.lon, noggrannhet: null, kalla: 'punkt' })
    } else {
      const c = handtag.current?.karta?.getCenter()
      if (!c) return
      setFyndplats({ lat: c.lat, lon: c.lng, noggrannhet: null, kalla: 'karta' })
    }
    setArk('nyttFynd')
  }, [plats, vald])

  /* --- Navigering mot målpunkt --- */
  const mal = app.malpunkt
  const navigering = useMemo(() => {
    if (!mal || !plats) return null
    return {
      avstand: avstand(plats, { lat: mal.lat, lon: mal.lon }),
      riktning: baring(plats, { lat: mal.lat, lon: mal.lon }),
    }
  }, [mal, plats])

  const skanningGaller = app.skanning?.art === app.valdArt
  /* Väder gånger säsong — hur mycket som står i skogen just nu, oberoende av
     var man befinner sig. Den platsberoende chansen får man genom att trycka
     på kartan; att kalla den här siffran "chans" vore missvisande. */
  const vaderlage =
    app.skanning && skanningGaller
      ? app.skanning.fruktsattning.index * app.skanning.sasong * 100
      : null

  const ljus = app.skanning ? dagsljus(app.skanning.vader.serie[app.skanning.vader.idag]) : null
  // En skanning som legat över natten har ett väderunderlag som hunnit bli
  // inaktuellt, även om terrängen förstås står kvar.
  const gammalSkanning = app.skanning ? Date.now() - app.skanning.tid > 14 * 3600e3 : false

  return (
    <>
      <Karta
        varmelager={visaVarme && skanningGaller ? varmelager : 'av'}
        vald={vald}
        onVald={(p) => { if (p) void bedomPunkt(p) }}
        onFynd={(f) => { setValtFynd(f); setArk('fynd') }}
        foljGPS={foljGPS}
        onDragAvFolj={() => setFoljGPS(false)}
        aktivtSparSpar={spelarIn ? sparPunkter : null}
        handtag={handtag}
      />

      {/* Kontroller uppe till höger */}
      <div className="kart-overlager">
        <div className="rad" style={{ alignItems: 'flex-start' }}>
          <div className="vaxa">
            {navigering ? (
              <div className="panel navpanel">
                <div>
                  <div className="etikett">Mot ditt mål</div>
                  <div className="rad" style={{ gap: 8 }}>
                    <span className="siffror" style={{ fontSize: 21 }}>{formateraAvstand(navigering.avstand)}</span>
                    <span className="liten svag">{kompass(navigering.riktning)}</span>
                  </div>
                </div>
                <div
                  className="navpil"
                  style={{
                    transform: `rotate(${navigering.riktning - (app.kompass.riktning ?? 0)}deg)`,
                  }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3 19 20l-7-4-7 4 7-17Z" fill="var(--guld)" /></svg>
                </div>
                <button className="stang" onClick={app.rensaMal} aria-label="Sluta navigera">
                  <IkonKryss size={16} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="kart-stapel">
            <button
              className="kart-knapp"
              aria-pressed={foljGPS}
              onClick={() => {
                if (app.gps.status === 'av') app.gps.starta()
                void app.kompass.be()
                setFoljGPS(true)
                if (plats) handtag.current?.flygTill(plats.lat, plats.lon)
              }}
              aria-label="Centrera på min position"
            >
              <IkonSikte size={21} />
            </button>
            <button className="kart-knapp" onClick={() => setArk('lager')} aria-label="Kartlager">
              <IkonLager size={21} />
            </button>
            <button
              className="kart-knapp"
              aria-pressed={spelarIn}
              onClick={() => (spelarIn ? void avslutaSpar() : setSpelarIn(true))}
              aria-label={spelarIn ? 'Avsluta spårinspelning' : 'Spela in spår'}
            >
              <IkonSpar size={21} />
            </button>
          </div>
        </div>
      </div>

      {/* Panel längst ned */}
      <div className="kart-fot">
        {skanlage ? (
          <div className="panel">
            <div className="rad" style={{ gap: 10 }}>
              <div className="snurra" />
              <div className="vaxa liten">{skanlage.steg}</div>
              <button className="mini svag" onClick={() => { avbrytRef.current?.abort(); setSkanlage(null) }}>
                Avbryt
              </button>
            </div>
            <div className="framstegsrad"><i style={{ width: `${skanlage.andel}%` }} /></div>
          </div>
        ) : null}

        {skanfel ? (
          <div className="panel" style={{ borderColor: '#5e2b28' }}>
            <div className="rad" style={{ gap: 10 }}>
              <div className="vaxa liten">{skanfel}</div>
              <button className="stang" onClick={() => setSkanfel(null)}><IkonKryss size={16} /></button>
            </div>
          </div>
        ) : null}

        <div className="panel">
          {/* Huvudet ligger kvar när panelen är hopfälld — det är där man
              fäller ut den igen, och det är dessutom enda stället som visar
              vald art när resten är dolt. */}
          <button
            className="panel-huvud"
            onClick={() => app.setPanelOppen(!app.panelOppen)}
            aria-expanded={app.panelOppen}
          >
            {app.panelOppen ? (
              <span className="etikett">Svampläge</span>
            ) : (
              <>
                <span className="artprick" style={{ background: artData.farg }} />
                <span className="fet liten">{artData.namn}</span>
                {vaderlage !== null ? (
                  <span className="liten" style={{ color: chansfarg(vaderlage / 100) }}>
                    · {chansOrd(vaderlage).toLowerCase()}
                  </span>
                ) : null}
              </>
            )}
            <span className="vaxa" />
            <IkonNed size={17} style={{ transform: app.panelOppen ? 'none' : 'rotate(180deg)' }} />
          </button>

          {app.panelOppen ? (
            <>
              <div className="chips rad" style={{ marginTop: 8, marginBottom: skanningGaller ? 10 : 0 }}>
                {HUVUDARTER.map((id) => {
                  const a = art(id)
                  return (
                    <button
                      key={id}
                      className="chip"
                      aria-pressed={app.valdArt === id}
                      onClick={() => app.setValdArt(id)}
                    >
                      <span>{a.emoji}</span>
                      {a.namn}
                    </button>
                  )
                })}
              </div>

              {skanningGaller && app.skanning ? (
                <>
                  <div className="rad mellan" style={{ marginBottom: 8, gap: 10 }}>
                    <div className="liten vaxa">
                      <span className="svag">Fruktsättning: </span>
                      <span className="fet" style={{ color: chansfarg((vaderlage ?? 0) / 100) }}>
                        {chansOrd(vaderlage ?? 0).toLowerCase()}
                      </span>
                    </div>
                    <button
                      className="mini fet"
                      style={{ color: 'var(--guld)', flexShrink: 0 }}
                      onClick={() => setVisaVarme((v) => !v)}
                    >
                      {visaVarme ? 'Dölj' : 'Visa'}
                    </button>
                  </div>

                  {app.skanning.landtackeSaknas ? (
                    <div className="rad mini" style={{ gap: 7, marginBottom: 8, color: 'var(--orange)' }}>
                      <IkonVarning size={15} />
                      <span className="vaxa">
                        Kartdatan gick inte att hämta — poängen bygger bara på terrängen.
                      </span>
                    </div>
                  ) : null}

                  {ljus?.text || gammalSkanning ? (
                    <div className="rad mini svagast" style={{ gap: 6, marginBottom: 8 }}>
                      {ljus?.text ? <span>{ljus.text}</span> : null}
                      {gammalSkanning ? (
                        <span style={{ color: 'var(--orange)' }}>
                          · skannad {sedan(app.skanning.tid)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {visaVarme ? (
                    <div className="legend">
                      <span className="mini svagast">Svagt</span>
                      <div
                        className="skala"
                        style={{ background: `linear-gradient(90deg, ${varmeGradient(app.kartlager === 'satellit')})` }}
                      />
                      <span className="mini svagast">Starkt</span>
                      <div className="segment" style={{ marginLeft: 4, padding: 2 }}>
                        <button
                          aria-pressed={varmelager === 'habitat'}
                          onClick={() => setVarmelager('habitat')}
                          style={{ minHeight: 28, fontSize: 12, padding: '0 9px' }}
                        >
                          Mark
                        </button>
                        <button
                          aria-pressed={varmelager === 'chans'}
                          onClick={() => setVarmelager('chans')}
                          style={{ minHeight: 28, fontSize: 12, padding: '0 9px' }}
                        >
                          Idag
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="knapprad">
          <button className="knapp" onClick={() => void kor()} disabled={!!skanlage}>
            <IkonRadar size={19} />
            {app.skanning && skanningGaller ? 'Skanna om' : 'Skanna'}
          </button>
          <button className="knapp primar" onClick={oppnaNyttFynd}>
            <IkonPlus size={19} />
            Spara fynd
          </button>
        </div>
      </div>

      {/* Ark */}
      {ark === 'punkt' ? (
        <Ark
          titel={laddarPunkt ? 'Analyserar…' : bedomning ? `${Math.round(bedomning.chans)}% chans` : 'Punkt'}
          underrubrik={artData.namn}
          onStang={() => { setArk(null); setVald(null) }}
          fot={
            vald ? (
              <div className="knapprad">
                <button className="knapp" onClick={() => { app.gaTill(vald.lat, vald.lon); setArk(null) }}>
                  <IkonNal size={18} /> Navigera hit
                </button>
                <button className="knapp primar" onClick={oppnaNyttFynd}>
                  <IkonPlus size={18} /> Fynd här
                </button>
              </div>
            ) : null
          }
        >
          {laddarPunkt ? (
            <div className="tom">
              <div className="snurra" style={{ margin: '0 auto 14px', width: 26, height: 26 }} />
              Hämtar höjddata, skogstyp och väder för punkten…
            </div>
          ) : bedomningFel ? (
            <div className="fara-ruta">{bedomningFel}</div>
          ) : bedomning ? (
            <PunktDetalj b={bedomning} artId={app.valdArt} />
          ) : null}
        </Ark>
      ) : null}

      {ark === 'nyttFynd' && fyndplats ? (
        <Ark
          titel="Nytt fynd"
          underrubrik={
            fyndplats.kalla === 'gps'
              ? 'På din GPS-position'
              : fyndplats.kalla === 'punkt'
                ? 'På punkten du valde'
                : 'Mitt på kartan — flytta kartan om det inte stämmer'
          }
          onStang={() => setArk(null)}
        >
          <FyndFormular
            lat={fyndplats.lat}
            lon={fyndplats.lon}
            noggrannhet={fyndplats.noggrannhet}
            standardArt={app.valdArt}
            onSpara={(f) => void sparaNytt(f)}
            onAvbryt={() => setArk(null)}
          />
        </Ark>
      ) : null}

      {ark === 'fynd' && valtFynd ? (
        <Ark
          titel={art(valtFynd.art).namn}
          underrubrik={new Date(valtFynd.tid).toLocaleDateString('sv-SE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
          onStang={() => setArk(null)}
        >
          <FyndDetalj
            fynd={valtFynd}
            onStang={() => setArk(null)}
            onNavigera={() => { app.gaTill(valtFynd.lat, valtFynd.lon); setArk(null) }}
          />
        </Ark>
      ) : null}

      {ark === 'lager' ? (
        <Ark titel="Kartlager" onStang={() => setArk(null)}>
          <div className="segment" style={{ marginBottom: 14 }}>
            {(Object.keys(LAGER) as Kartlager[]).map((id) => (
              <button key={id} aria-pressed={app.kartlager === id} onClick={() => app.setKartlager(id)}>
                {LAGER[id].namn}
              </button>
            ))}
          </div>
          <p className="liten svag">
            Terrängkartan visar höjdkurvor och skogsmark och är oftast den mest användbara
            i skogen. Satellitbilden avslöjar hyggen och glesa partier som kartdatan inte hunnit med.
          </p>
          <hr className="skiljare" />
          <button
            className="knapp bred"
            aria-pressed={app.visaObservationer}
            onClick={() => app.setVisaObservationer(!app.visaObservationer)}
            style={app.visaObservationer ? { borderColor: 'var(--guld-mork)' } : undefined}
          >
            {app.visaObservationer ? 'Dölj' : 'Visa'} rapporterade fynd från Artportalen
          </button>
          <p className="liten svag" style={{ marginTop: 10 }}>
            Vita prickar är fynd andra rapporterat in via GBIF. De är ofta avrundade till
            närmaste hundra meter, så se dem som en vink om att arten finns i skogen —
            inte som en skattkarta.
          </p>
        </Ark>
      ) : null}
    </>
  )
}
