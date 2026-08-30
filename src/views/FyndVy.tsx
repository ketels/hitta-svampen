import { useMemo, useState } from 'react'
import { art } from '../data/arter.ts'
import { antal, avstand, formateraAvstand } from '../lib/geo.ts'
import { useApp } from '../state/app.tsx'
import { Ark } from '../components/Ark.tsx'
import { FyndDetalj } from '../components/FyndDetalj.tsx'
import { IkonNal, IkonSpar, IkonStjarna } from '../components/Ikoner.tsx'
import type { Find, SpeciesId } from '../lib/types.ts'

type Sortering = 'tid' | 'narhet'

const datumText = (t: number) =>
  new Date(t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

export function FyndVy() {
  const app = useApp()
  const [filter, setFilter] = useState<SpeciesId | 'alla' | 'favoriter'>('alla')
  const [sortering, setSortering] = useState<Sortering>('tid')
  const [valt, setValt] = useState<Find | null>(null)
  const [visaSpar, setVisaSpar] = useState(false)

  const plats = app.gps.plats ?? app.sistaPlats

  const arterMedFynd = useMemo(() => {
    const s = new Set<SpeciesId>()
    for (const f of app.fynd) s.add(f.art)
    return [...s]
  }, [app.fynd])

  const listan = useMemo(() => {
    let l = app.fynd
    if (filter === 'favoriter') l = l.filter((f) => f.favorit)
    else if (filter !== 'alla') l = l.filter((f) => f.art === filter)
    if (sortering === 'narhet' && plats) {
      l = [...l].sort((a, b) => avstand(plats, a) - avstand(plats, b))
    }
    return l
  }, [app.fynd, filter, sortering, plats])

  const statistik = useMemo(() => {
    const iAr = new Date().getFullYear()
    const arsfynd = app.fynd.filter((f) => new Date(f.tid).getFullYear() === iAr)
    const korgar = app.fynd.filter((f) => f.mangd === 'korg' || f.mangd === 'jackpot').length
    return { totalt: app.fynd.length, iAr: arsfynd.length, korgar, favoriter: app.fynd.filter((f) => f.favorit).length }
  }, [app.fynd])

  if (app.fynd.length === 0 && app.spar.length === 0) {
    return (
      <div className="rullar">
        <div className="tom">
          <span className="emoji">🧺</span>
          <h3 style={{ marginBottom: 8 }}>Inga fynd än</h3>
          <p>
            Varje gång du hittar svamp, spara platsen. Kantarellmycel lever i decennier och
            kommer tillbaka på samma ställe år efter år — dina egna fyndplatser är den
            överlägset bästa informationen som finns.
          </p>
          <p className="liten svag" style={{ marginTop: 12 }}>
            Appen lär sig dessutom av dem: efter tio fynd väger din erfarenhet lika tungt
            som modellens utgångsvärden.
          </p>
          <button className="knapp primar" style={{ marginTop: 16 }} onClick={() => app.setVy('karta')}>
            Öppna kartan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rullar">
      <div className="matvarden" style={{ marginBottom: 16 }}>
        <div className="matvarde">
          <div className="v">{statistik.totalt}</div>
          <div className="e">fynd totalt</div>
        </div>
        <div className="matvarde">
          <div className="v">{statistik.iAr}</div>
          <div className="e">i år</div>
        </div>
        <div className="matvarde">
          <div className="v">{statistik.korgar}</div>
          <div className="e">korgar</div>
        </div>
        <div className="matvarde">
          <div className="v">{statistik.favoriter}</div>
          <div className="e">guldställen</div>
        </div>
      </div>

      <div className="chips rad" style={{ marginBottom: 10 }}>
        <button className="chip" aria-pressed={filter === 'alla'} onClick={() => setFilter('alla')}>
          Alla
        </button>
        {statistik.favoriter > 0 ? (
          <button className="chip" aria-pressed={filter === 'favoriter'} onClick={() => setFilter('favoriter')}>
            ⭐ Guldställen
          </button>
        ) : null}
        {arterMedFynd.map((id) => {
          const a = art(id)
          return (
            <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              <span>{a.emoji}</span>
              {a.namn}
            </button>
          )
        })}
      </div>

      {plats ? (
        <div className="segment" style={{ marginBottom: 14 }}>
          <button aria-pressed={sortering === 'tid'} onClick={() => setSortering('tid')}>Senaste först</button>
          <button aria-pressed={sortering === 'narhet'} onClick={() => setSortering('narhet')}>Närmast först</button>
        </div>
      ) : null}

      <div className="fyndlista">
        {listan.map((f) => {
          const a = art(f.art)
          const d = plats ? avstand(plats, f) : null
          return (
            <button key={f.id} className="fyndrad" onClick={() => setValt(f)}>
              <span className="fyndprick" style={{ background: a.farg }}>{a.emoji}</span>
              <span className="vaxa" style={{ minWidth: 0 }}>
                <span className="rad" style={{ gap: 6 }}>
                  <span className="fet trunka">{a.namn}</span>
                  {f.favorit ? <IkonStjarna size={13} /> : null}
                </span>
                <span className="mini svagast trunka" style={{ display: 'block' }}>
                  {datumText(f.tid)}
                  {f.anteckning ? ` · ${f.anteckning}` : ''}
                </span>
              </span>
              {d !== null ? <span className="mini siffror svag">{formateraAvstand(d)}</span> : null}
            </button>
          )
        })}
      </div>

      {app.spar.length > 0 ? (
        <>
          <button
            className="knapp bred"
            style={{ marginTop: 16 }}
            onClick={() => setVisaSpar((v) => !v)}
          >
            <IkonSpar size={18} /> {antal(app.spar.length, 'inspelad tur', 'inspelade turer')}
          </button>
          {visaSpar ? (
            <div className="fyndlista" style={{ marginTop: 10 }}>
              {app.spar.map((s) => (
                <div key={s.id} className="fyndrad" style={{ cursor: 'default' }}>
                  <span className="fyndprick" style={{ background: '#4fa3d9' }}><IkonSpar size={15} /></span>
                  <span className="vaxa" style={{ minWidth: 0 }}>
                    <span className="fet trunka" style={{ display: 'block' }}>{s.namn}</span>
                    <span className="mini svagast">
                      {formateraAvstand(s.langd)} · {Math.round((s.slut - s.start) / 60000)} min
                    </span>
                  </span>
                  <button
                    className="mini svag"
                    onClick={() => { app.gaTill(s.punkter[0]!.lat, s.punkter[0]!.lon) }}
                    aria-label="Visa på kartan"
                  >
                    <IkonNal size={17} />
                  </button>
                  <button className="mini svag" onClick={() => void app.taBortSpar(s.id)}>Ta bort</button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {valt ? (
        <Ark
          titel={art(valt.art).namn}
          underrubrik={new Date(valt.tid).toLocaleDateString('sv-SE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
          onStang={() => setValt(null)}
        >
          <FyndDetalj
            fynd={valt}
            onStang={() => setValt(null)}
            onNavigera={() => { app.gaTill(valt.lat, valt.lon); setValt(null) }}
          />
        </Ark>
      ) : null}
    </div>
  )
}
