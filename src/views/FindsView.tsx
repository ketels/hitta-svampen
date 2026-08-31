import { useMemo, useState } from 'react'
import { species as lookupSpecies } from '../data/species.ts'
import { plural, distance, formatDistance } from '../lib/geo.ts'
import { useApp } from '../state/app.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { FindDetail } from '../components/FindDetail.tsx'
import { IconPin, IconTrack, IconStar } from '../components/Icons.tsx'
import { speciesIcon, speciesColor, iconInk } from '../components/SpeciesIcons.tsx'
import type { Find, SpeciesId } from '../lib/types.ts'

type SortOrder = 'time' | 'nearness'

const dateText = (t: number) =>
  new Date(t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

export function FindsView() {
  const app = useApp()
  const [filter, setFilter] = useState<SpeciesId | 'all' | 'favorites'>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('time')
  const [selected, setSelected] = useState<Find | null>(null)
  const [showTracks, setShowTracks] = useState(false)

  const position = app.gps.position ?? app.lastPosition

  const speciesWithFinds = useMemo(() => {
    const s = new Set<SpeciesId>()
    for (const f of app.finds) s.add(f.species)
    return [...s]
  }, [app.finds])

  const list = useMemo(() => {
    let l = app.finds
    if (filter === 'favorites') l = l.filter((f) => f.favorite)
    else if (filter !== 'all') l = l.filter((f) => f.species === filter)
    if (sortOrder === 'nearness' && position) {
      l = [...l].sort((a, b) => distance(position, a) - distance(position, b))
    }
    return l
  }, [app.finds, filter, sortOrder, position])

  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear()
    const yearFinds = app.finds.filter((f) => new Date(f.time).getFullYear() === thisYear)
    const baskets = app.finds.filter((f) => f.amount === 'basket' || f.amount === 'jackpot').length
    return {
      total: app.finds.length,
      thisYear: yearFinds.length,
      baskets,
      favorites: app.finds.filter((f) => f.favorite).length,
    }
  }, [app.finds])

  if (app.finds.length === 0 && app.tracks.length === 0) {
    return (
      <div className="scroll">
        <div className="empty">
          <span className="emoji">🧺</span>
          <h3 style={{ marginBottom: 8 }}>Inga fynd än</h3>
          <p>
            Varje gång du hittar svamp, spara platsen. Kantarellmycel lever i decennier och
            kommer tillbaka på samma ställe år efter år — dina egna fyndplatser är den
            överlägset bästa informationen som finns.
          </p>
          <p className="small dim" style={{ marginTop: 12 }}>
            Appen lär sig dessutom av dem: efter tio fynd väger din erfarenhet lika tungt
            som modellens utgångsvärden.
          </p>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => app.setView('map')}>
            Öppna kartan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="scroll">
      <div className="metrics" style={{ marginBottom: 16 }}>
        <div className="metric">
          <div className="v">{stats.total}</div>
          <div className="e">fynd totalt</div>
        </div>
        <div className="metric">
          <div className="v">{stats.thisYear}</div>
          <div className="e">i år</div>
        </div>
        <div className="metric">
          <div className="v">{stats.baskets}</div>
          <div className="e">korgar</div>
        </div>
        <div className="metric">
          <div className="v">{stats.favorites}</div>
          <div className="e">guldställen</div>
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        <div className="chips row">
          <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            Alla
          </button>
          {stats.favorites > 0 ? (
            <button className="chip" aria-pressed={filter === 'favorites'} onClick={() => setFilter('favorites')}>
              ⭐ Guldställen
            </button>
          ) : null}
          {speciesWithFinds.map((id) => {
            const sp = lookupSpecies(id)
            const Icon = speciesIcon(id)
            return (
              <button key={id} className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                <Icon size={17} style={{ color: speciesColor(id) }} />
                {sp.name}
              </button>
            )
          })}
        </div>
      </div>

      {position ? (
        <div className="segment" style={{ marginBottom: 14 }}>
          <button aria-pressed={sortOrder === 'time'} onClick={() => setSortOrder('time')}>Senaste först</button>
          <button aria-pressed={sortOrder === 'nearness'} onClick={() => setSortOrder('nearness')}>Närmast först</button>
        </div>
      ) : null}

      <div className="find-list">
        {list.map((f) => {
          const sp = lookupSpecies(f.species)
          const d = position ? distance(position, f) : null
          return (
            <button key={f.id} className="find-row" onClick={() => setSelected(f)}>
              <span className="find-dot" style={{ background: sp.color, color: iconInk(sp.color) }}>
                {(() => { const Icon = speciesIcon(f.species); return <Icon size={19} /> })()}
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row" style={{ gap: 6 }}>
                  <span className="bold truncate">{sp.name}</span>
                  {f.favorite ? <IconStar size={13} /> : null}
                </span>
                <span className="tiny dimmer truncate" style={{ display: 'block' }}>
                  {dateText(f.time)}
                  {f.note ? ` · ${f.note}` : ''}
                </span>
              </span>
              {d !== null ? <span className="tiny num dim">{formatDistance(d)}</span> : null}
            </button>
          )
        })}
      </div>

      {app.tracks.length > 0 ? (
        <>
          <button
            className="btn wide"
            style={{ marginTop: 16 }}
            onClick={() => setShowTracks((v) => !v)}
          >
            <IconTrack size={18} /> {plural(app.tracks.length, 'inspelad tur', 'inspelade turer')}
          </button>
          {showTracks ? (
            <div className="find-list" style={{ marginTop: 10 }}>
              {app.tracks.map((t) => (
                <div key={t.id} className="find-row" style={{ cursor: 'default' }}>
                  <span className="find-dot" style={{ background: 'var(--blue)' }}><IconTrack size={15} /></span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="bold truncate" style={{ display: 'block' }}>{t.name}</span>
                    <span className="tiny dimmer">
                      {formatDistance(t.length)} · {Math.round((t.end - t.start) / 60000)} min
                    </span>
                  </span>
                  <button
                    className="tiny dim"
                    onClick={() => {
                      app.goTo({ lat: t.points[0]!.lat, lon: t.points[0]!.lon, label: 'Mot spårstart' })
                    }}
                    aria-label="Visa på kartan"
                  >
                    <IconPin size={17} />
                  </button>
                  <button className="tiny dim" onClick={() => void app.removeTrack(t.id)}>Ta bort</button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {selected ? (
        <Sheet
          title={lookupSpecies(selected.species).name}
          subtitle={new Date(selected.time).toLocaleDateString('sv-SE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
          onClose={() => setSelected(null)}
        >
          <FindDetail
            find={selected}
            onClose={() => setSelected(null)}
            onNavigate={() => {
              app.goTo({
                lat: selected.lat,
                lon: selected.lon,
                label: selected.species === 'other'
                  ? 'Mot fyndplats'
                  : `Mot ${lookupSpecies(selected.species).name}`,
              })
              setSelected(null)
            }}
          />
        </Sheet>
      ) : null}
    </div>
  )
}
