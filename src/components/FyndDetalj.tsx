import { useEffect, useState } from 'react'
import { art } from '../data/arter.ts'
import { MARKTYP_NAMN } from '../data/overpass.ts'
import { hamtaBild } from '../lib/db.ts'
import { formateraAvstand, formateraKoord, kompass } from '../lib/geo.ts'
import { useApp } from '../state/app.tsx'
import type { Find } from '../lib/types.ts'
import { FyndFormular } from './FyndFormular.tsx'
import { fuktIOrd } from './PunktDetalj.tsx'
import { IkonNal, IkonPapperskorg } from './Ikoner.tsx'

const MANGD_TEXT: Record<Find['mangd'], string> = {
  enstaka: 'Enstaka',
  handfull: 'En handfull',
  korg: 'En korg',
  jackpot: 'Jackpot',
}

function Bilder({ ids }: { ids: string[] }) {
  const [urler, setUrler] = useState<string[]>([])

  useEffect(() => {
    let levande = true
    const skapade: string[] = []
    void (async () => {
      for (const id of ids) {
        const b = await hamtaBild(id)
        if (b) skapade.push(URL.createObjectURL(b))
      }
      if (levande) setUrler(skapade)
      else skapade.forEach((u) => URL.revokeObjectURL(u))
    })()
    return () => {
      levande = false
      skapade.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [ids])

  if (urler.length === 0) return null
  return (
    <div className="bildrad">
      {urler.map((u, i) => (
        <img key={i} src={u} alt="" loading="lazy" />
      ))}
    </div>
  )
}

export function FyndDetalj({
  fynd,
  onStang,
  onNavigera,
}: {
  fynd: Find
  onStang: () => void
  onNavigera: () => void
}) {
  const app = useApp()
  const [redigerar, setRedigerar] = useState(false)
  const [bekraftaRadera, setBekraftaRadera] = useState(false)
  const a = art(fynd.art)
  const plats = app.gps.plats
  const h = fynd.habitat

  if (redigerar) {
    return (
      <FyndFormular
        lat={fynd.lat}
        lon={fynd.lon}
        noggrannhet={fynd.noggrannhet}
        befintligt={fynd}
        standardArt={fynd.art}
        onSpara={(f) => { void app.spara(f); setRedigerar(false); onStang() }}
        onAvbryt={() => setRedigerar(false)}
      />
    )
  }

  return (
    <>
      <Bilder ids={fynd.bilder} />

      <div className="rad" style={{ gap: 10, marginBottom: 12 }}>
        <span className="chip" style={{ borderColor: a.farg }}>
          {a.emoji} {MANGD_TEXT[fynd.mangd]}
        </span>
        {fynd.favorit ? <span className="chip" aria-pressed="true">⭐ Guldställe</span> : null}
      </div>

      {fynd.anteckning ? (
        <div className="kort" style={{ whiteSpace: 'pre-wrap' }}>{fynd.anteckning}</div>
      ) : null}

      <div className="kort">
        <div className="etikett" style={{ marginBottom: 6 }}>Plats</div>
        <div className="liten" style={{ fontFamily: 'var(--siffror)' }}>{formateraKoord(fynd.lat, fynd.lon)}</div>
        {fynd.noggrannhet !== null ? (
          <div className="mini svagast">GPS-noggrannhet ±{Math.round(fynd.noggrannhet)} m</div>
        ) : null}
        {plats ? (
          <div className="liten svag" style={{ marginTop: 6 }}>
            {formateraAvstand(
              Math.hypot(
                (fynd.lat - plats.lat) * 111320,
                (fynd.lon - plats.lon) * 111320 * Math.cos((plats.lat * Math.PI) / 180),
              ),
            )} härifrån
          </div>
        ) : null}
      </div>

      {h ? (
        <div className="kort">
          <div className="etikett" style={{ marginBottom: 8 }}>Så såg marken ut här</div>
          <div className="faktarutor" style={{ marginBottom: 0 }}>
            <div className="faktaruta">
              <div className="etikett">Mark</div>
              <div className="fet">{MARKTYP_NAMN[h.marktyp]}</div>
            </div>
            <div className="faktaruta">
              <div className="etikett">Fuktighet</div>
              <div className="fet">{fuktIOrd(h.twi)}</div>
            </div>
            <div className="faktaruta">
              <div className="etikett">Lutning</div>
              <div className="fet">
                {h.lutning < 1 ? 'Plant' : `${h.lutning.toFixed(1)}°`}
              </div>
              {h.vaderstreck !== null ? <div className="mini svagast">mot {kompass(h.vaderstreck)}</div> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="kort liten svag">
          Habitatdatan för det här fyndet är inte hämtad än. Den fylls i automatiskt
          nästa gång du har uppkoppling.
        </div>
      )}

      {fynd.vader ? (
        <div className="kort">
          <div className="etikett" style={{ marginBottom: 8 }}>Vädret när du hittade den</div>
          <div className="matvarden">
            <div className="matvarde">
              <div className="v">{Math.round(fynd.vader.regn14)}</div>
              <div className="e">mm / 14 d</div>
            </div>
            <div className="matvarde">
              <div className="v">{fynd.vader.marktemp.toFixed(1)}°</div>
              <div className="e">i marken</div>
            </div>
            <div className="matvarde">
              <div className="v">{(fynd.vader.markfukt * 100).toFixed(0)}%</div>
              <div className="e">markfukt</div>
            </div>
            <div className="matvarde">
              <div className="v">{Math.round(fynd.vader.index * 100)}%</div>
              <div className="e">fruktsättning</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="knapprad" style={{ marginBottom: 8 }}>
        <button className="knapp" onClick={onNavigera}><IkonNal size={18} /> Navigera hit</button>
        <button className="knapp" onClick={() => setRedigerar(true)}>Ändra</button>
      </div>

      {bekraftaRadera ? (
        <div className="fara-ruta">
          <p style={{ marginBottom: 10 }}>
            Ta bort fyndet för gott? Ett ställe du hittat svamp på är svårt att komma ihåg igen.
          </p>
          <div className="knapprad">
            <button className="knapp" onClick={() => setBekraftaRadera(false)}>Behåll</button>
            <button
              className="knapp fara"
              onClick={() => { void app.taBort(fynd.id); onStang() }}
            >
              Ta bort
            </button>
          </div>
        </div>
      ) : (
        <button className="knapp fara bred" onClick={() => setBekraftaRadera(true)}>
          <IkonPapperskorg size={18} /> Ta bort fyndet
        </button>
      )}
    </>
  )
}
