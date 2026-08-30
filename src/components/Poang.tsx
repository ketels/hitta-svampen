import { chansfarg, chansOrd, chansRad } from '../lib/farg.ts'
import type { Delpoang } from '../lib/types.ts'

/**
 * Stor mätare för dagens chans.
 *
 * Ordet står inne i ringen tillsammans med siffran — de säger samma sak och
 * hörde aldrig hemma på var sitt håll. Utanför ringen står bara rådet.
 */
export function Chansmatare({
  procent,
  etikett,
  rad = true,
}: {
  procent: number
  /** Valfri överrubrik i ringen. Prognosvyn har arten i chipset ovanför. */
  etikett?: string
  rad?: boolean
}) {
  const p = Math.max(0, Math.min(100, procent))
  const farg = chansfarg(p / 100)
  const R = 62
  const omkrets = 2 * Math.PI * R
  // Tre fjärdedels varv känns som en mätare och inte som en tårtbit.
  const del = 0.75
  return (
    <div className="matare">
      <svg viewBox="0 0 160 160" width="184" height="184" aria-hidden="true">
        <circle
          cx="80" cy="80" r={R}
          fill="none" stroke="var(--yta-3)" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${omkrets * del} ${omkrets}`}
          transform="rotate(135 80 80)"
        />
        <circle
          cx="80" cy="80" r={R}
          fill="none" stroke={farg} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${omkrets * del * (p / 100)} ${omkrets}`}
          transform="rotate(135 80 80)"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(.22,1,.36,1), stroke 0.5s' }}
        />
      </svg>
      <div className="matare-mitt">
        <div className="siffror" style={{ fontSize: 46, lineHeight: 1, color: farg }}>
          {Math.round(p)}
          <span style={{ fontSize: 20, marginLeft: 1 }}>%</span>
        </div>
        <div className="fet" style={{ color: farg, fontSize: 17, marginTop: 2 }}>{chansOrd(p)}</div>
        {etikett ? <div className="etikett" style={{ marginTop: 4 }}>{etikett}</div> : null}
      </div>
      {rad ? (
        <div className="mitten svag" style={{ marginTop: -14, fontSize: 14 }}>
          {chansRad(p)}
        </div>
      ) : null}
    </div>
  )
}

/** Kompakt stapel med etikett och värde. */
export function Poangstapel({
  namn,
  varde,
  motivering,
  vikt,
  typ = 'vikt',
}: {
  namn: string
  varde: number
  motivering?: string
  vikt?: number
  typ?: 'vikt' | 'faktor'
}) {
  // Faktorer multiplicerar hela poängen i stället för att vägas in, så en
  // viktprocent vore missvisande för dem.
  const anmarkning =
    typ === 'faktor'
      ? 'avgör takhöjden'
      : vikt !== undefined
        ? `vikt ${Math.round(vikt * 100)}%`
        : null
  return (
    <div className="delpoang-rad">
      <div className="liten fet">
        {namn}
        {anmarkning ? <span className="svagast mini" style={{ fontWeight: 500 }}> · {anmarkning}</span> : null}
      </div>
      <div className="varde" style={{ color: chansfarg(varde) }}>{Math.round(varde * 100)}</div>
      <div className="stapel">
        <i style={{ width: `${Math.max(2, varde * 100)}%`, background: chansfarg(varde) }} />
      </div>
      {motivering ? <div className="motiv">{motivering}</div> : null}
    </div>
  )
}

export function Delpoangslista({ delar }: { delar: Delpoang[] }) {
  const vikter = delar.filter((d) => (d.typ ?? 'vikt') === 'vikt')
  const faktorer = delar.filter((d) => d.typ === 'faktor')
  return (
    <>
      <div className="delpoang">
        {vikter.map((d) => (
          <Poangstapel key={d.namn} namn={d.namn} varde={d.varde} motivering={d.motivering} vikt={d.vikt} />
        ))}
      </div>
      {faktorer.length ? (
        <>
          <hr className="skiljare" />
          <div className="delpoang">
            {faktorer.map((d) => (
              <Poangstapel key={d.namn} namn={d.namn} varde={d.varde} motivering={d.motivering} typ="faktor" />
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
