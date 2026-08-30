import { useMemo, useState } from 'react'
import { ARTER, art } from '../data/arter.ts'
import { chansfarg } from '../lib/farg.ts'
import { sasongsfaktor } from '../model/fruktsattning.ts'
import { anpassaArt } from '../model/personlig.ts'
import { useApp } from '../state/app.tsx'
import { Ark } from '../components/Ark.tsx'
import { IkonNed, IkonVarning } from '../components/Ikoner.tsx'
import type { Species } from '../lib/types.ts'

const MANADER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Årsband som visar när arten går att hitta, med dagens datum markerad. */
function Sasongsband({ artData, lat }: { artData: Species; lat: number }) {
  const idag = new Date()
  const dagnr = Math.floor(
    (Date.UTC(idag.getFullYear(), idag.getMonth(), idag.getDate()) - Date.UTC(idag.getFullYear(), 0, 1)) / 864e5,
  ) + 1
  const varden = useMemo(() => {
    const ut: number[] = []
    for (let d = 1; d <= 366; d += 3) {
      const datum = new Date(idag.getFullYear(), 0, d)
      ut.push(sasongsfaktor(artData, datum, lat))
    }
    return ut
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artData, lat])

  return (
    <div className="sasong">
      <div className="sasongsband">
        {varden.map((v, i) => (
          <i key={i} style={{ background: v === 0 ? 'var(--yta-3)' : chansfarg(0.35 + v * 0.6), opacity: v === 0 ? 1 : 0.5 + v * 0.5 }} />
        ))}
        <span className="idagmark" style={{ left: `${(dagnr / 366) * 100}%` }} />
      </div>
      <div className="sasongsmanader mini svagast">
        {MANADER.map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  )
}

export function ArtVy() {
  const app = useApp()
  const [oppen, setOppen] = useState<string | null>(null)
  const [visaSakerhet, setVisaSakerhet] = useState(false)
  const plats = app.gps.plats ?? app.sistaPlats
  const lat = plats?.lat ?? 59.5

  const arter = useMemo(
    () =>
      ARTER.filter((a) => a.id !== 'annat')
        .map((bas) => {
          const { art: a } = anpassaArt(bas, app.fynd)
          return { bas, a, sasong: sasongsfaktor(a, new Date(), lat) }
        })
        .sort((x, y) => y.sasong - x.sasong),
    [app.fynd, lat],
  )

  const vald = oppen ? art(oppen as never) : null

  return (
    <div className="rullar">
      <button className="varning" style={{ width: '100%', textAlign: 'left', marginBottom: 14 }} onClick={() => setVisaSakerhet(true)}>
        <div className="rad" style={{ gap: 10 }}>
          <IkonVarning size={20} />
          <span className="vaxa">
            <strong>Ät aldrig en svamp för att en app säger att den är ätlig.</strong>{' '}
            Tryck här för det korta som faktiskt gäller.
          </span>
          <IkonNed size={18} />
        </div>
      </button>

      {arter.map(({ a, sasong }) => (
        <button key={a.id} className="kort artkort" onClick={() => setOppen(a.id)}>
          <div className="rad" style={{ gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 26 }}>{a.emoji}</span>
            <span className="vaxa" style={{ minWidth: 0 }}>
              <span className="rad" style={{ gap: 8 }}>
                <h3 className="trunka">{a.namn}</h3>
                {sasong > 0.6 ? <span className="marke">i säsong</span> : null}
              </span>
              <span className="mini svagast" style={{ fontStyle: 'italic' }}>{a.latin}</span>
            </span>
            <IkonNed size={18} />
          </div>
          <p className="liten svag" style={{ textAlign: 'left' }}>{a.var}</p>
          <Sasongsband artData={a} lat={lat} />
        </button>
      ))}

      {vald ? (
        <Ark titel={`${vald.emoji} ${vald.namn}`} underrubrik={vald.latin} onStang={() => setOppen(null)}>
          <div className="kort">
            <div className="etikett" style={{ marginBottom: 6 }}>Var den växer</div>
            <p className="liten">{vald.var}</p>
            <div className="etikett" style={{ margin: '12px 0 6px' }}>Trädslag den lever med</div>
            <div className="chips">
              {vald.vardar.map((v) => <span key={v} className="chip" style={{ minHeight: 30, fontSize: 13 }}>{v}</span>)}
            </div>
          </div>

          <div className="kort">
            <div className="etikett" style={{ marginBottom: 8 }}>Säsong där du är</div>
            <Sasongsband artData={vald} lat={lat} />
          </div>

          {vald.kannetecken.length ? (
            <div className="kort">
              <div className="etikett" style={{ marginBottom: 8 }}>Så känner du igen den</div>
              <ul className="punktlista" style={{ color: 'var(--text)' }}>
                {vald.kannetecken.map((k, i) => <li key={i}>{k}</li>)}
              </ul>
            </div>
          ) : null}

          {vald.forvaxling.length ? (
            <div className="fara-ruta" style={{ marginBottom: 12 }}>
              <div className="rad" style={{ gap: 8, marginBottom: 8 }}>
                <IkonVarning size={18} />
                <strong>Kan förväxlas med</strong>
              </div>
              <ul className="punktlista" style={{ color: 'var(--text)' }}>
                {vald.forvaxling.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="kort">
            <div className="etikett" style={{ marginBottom: 8 }}>Vad modellen vet om arten</div>
            <div className="matvarden">
              <div className="matvarde">
                <div className="v">{vald.regnfordrojning.topp}</div>
                <div className="e">dygn efter regn</div>
              </div>
              <div className="matvarde">
                <div className="v">{vald.marktemp.opt}°</div>
                <div className="e">bäst marktemp</div>
              </div>
              <div className="matvarde">
                <div className="v">{(vald.markfukt.opt * 100).toFixed(0)}%</div>
                <div className="e">bäst markfukt</div>
              </div>
              <div className="matvarde">
                <div className="v">{vald.frosttalig ? 'Ja' : 'Nej'}</div>
                <div className="e">tål frost</div>
              </div>
            </div>
          </div>

          <button
            className="knapp primar bred"
            onClick={() => { app.setValdArt(vald.id); app.setVy('karta'); setOppen(null) }}
          >
            Leta efter {vald.namn.toLowerCase()} på kartan
          </button>
        </Ark>
      ) : null}

      {visaSakerhet ? (
        <Ark titel="Innan du äter något" onStang={() => setVisaSakerhet(false)}>
          <div className="fara-ruta" style={{ marginBottom: 14 }}>
            Den här appen hjälper dig hitta <em>platser</em>. Den kan inte artbestämma
            svamp åt dig, och den vet inte vad som ligger i din korg.
          </div>
          <ul className="punktlista" style={{ color: 'var(--text)', fontSize: 14.5 }}>
            <li>Ät bara svamp du själv är helt säker på. Tveksam betyder nej.</li>
            <li>
              Lär dig en art i taget, tillsammans med dess farliga dubbelgångare. Att kunna
              kantarell säkert är mer värt än att känna igen tjugo svampar ungefär.
            </li>
            <li>
              Gå på flera kännetecken samtidigt — färg räcker aldrig. För kantarell:
              gult kött rakt igenom, ribbor som löper ned på foten, aprikosdoft.
            </li>
            <li>
              Toppig giftspindling växer i samma mossiga granskog som kantarellen och har
              gett svenskar njurtransplantationer. Den har äkta skivor och tydlig fot.
            </li>
            <li>Plocka aldrig svamp som är gammal, mögligt eller full av mask.</li>
            <li>
              Vid misstanke om förgiftning: ring 112 eller Giftinformationscentralen
              på 010-456 6700. Spara en bit av svampen.
            </li>
            <li>
              Vill du bli säker — gå på en svamputflykt med Sveriges Mykologiska Förening
              eller en lokal svampkonsulent. Ingen app slår någon som pekar i skogen.
            </li>
          </ul>
          <hr className="skiljare" />
          <p className="liten svag">
            Allemansrätten ger dig rätt att plocka matsvamp i skog och mark, men inte i
            naturreservat med plockförbud, inte på tomtmark och inte i planteringar.
            Kolla skyltar och reservatsföreskrifter.
          </p>
        </Ark>
      ) : null}
    </div>
  )
}
