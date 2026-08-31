import { useMemo, useState } from 'react'
import { SPECIES, species as lookupSpecies } from '../data/species.ts'
import { chanceColor } from '../lib/color.ts'
import { seasonFactor } from '../model/fruiting.ts'
import { adaptSpecies } from '../model/personalize.ts'
import { hostName } from '../model/habitat.ts'
import { useApp } from '../state/app.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { IconChevronDown, IconWarning } from '../components/Icons.tsx'
import { speciesIcon, speciesColor } from '../components/SpeciesIcons.tsx'
import type { Species, SpeciesId } from '../lib/types.ts'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** A year band showing when the species can be found, with today marked. */
function SeasonBand({ speciesData, lat }: { speciesData: Species; lat: number }) {
  const today = new Date()
  const dayNumber =
    Math.floor(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(today.getFullYear(), 0, 1)) / 864e5,
    ) + 1
  const values = useMemo(() => {
    const out: number[] = []
    for (let d = 1; d <= 366; d += 3) {
      const date = new Date(today.getFullYear(), 0, d)
      out.push(seasonFactor(speciesData, date, lat))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesData, lat])

  return (
    <div className="season">
      <div className="season-band">
        {values.map((v, i) => (
          <i
            key={i}
            style={{
              background: v === 0 ? 'var(--surface-3)' : chanceColor(0.35 + v * 0.6),
              opacity: v === 0 ? 1 : 0.5 + v * 0.5,
            }}
          />
        ))}
        <span className="today-mark" style={{ left: `${(dayNumber / 366) * 100}%` }} />
      </div>
      <div className="season-months tiny dimmer">
        {MONTHS.map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  )
}

export function SpeciesView() {
  const app = useApp()
  const [open, setOpen] = useState<SpeciesId | null>(null)
  const [showSafety, setShowSafety] = useState(false)
  const position = app.gps.position ?? app.lastPosition
  const lat = position?.lat ?? 59.5

  const list = useMemo(
    () =>
      SPECIES.filter((s) => s.id !== 'other')
        .map((base) => {
          const { species: sp } = adaptSpecies(base, app.finds)
          return { base, sp, season: seasonFactor(sp, new Date(), lat) }
        })
        .sort((x, y) => y.season - x.season),
    [app.finds, lat],
  )

  const selected = open ? lookupSpecies(open) : null

  return (
    <div className="scroll">
      <button className="warning" style={{ width: '100%', textAlign: 'left', marginBottom: 14 }} onClick={() => setShowSafety(true)}>
        <div className="row" style={{ gap: 10 }}>
          <IconWarning size={20} />
          <span className="grow">
            <strong>Ät aldrig en svamp för att en app säger att den är ätlig.</strong>{' '}
            Tryck här för det korta som faktiskt gäller.
          </span>
          <IconChevronDown size={18} />
        </div>
      </button>

      {list.map(({ sp, season }) => (
        <button key={sp.id} className="card species-card" onClick={() => setOpen(sp.id)}>
          <div className="row" style={{ gap: 12, marginBottom: 10 }}>
            {(() => { const Icon = speciesIcon(sp.id); return <Icon size={26} style={{ color: speciesColor(sp.id) }} /> })()}
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="row" style={{ gap: 8 }}>
                <h3 className="truncate">{sp.name}</h3>
                {season > 0.6 ? <span className="badge">i säsong</span> : null}
              </span>
              <span className="tiny dimmer" style={{ fontStyle: 'italic' }}>{sp.latin}</span>
            </span>
            <IconChevronDown size={18} />
          </div>
          <p className="small dim" style={{ textAlign: 'left' }}>{sp.where}</p>
          <SeasonBand speciesData={sp} lat={lat} />
        </button>
      ))}

      {selected ? (
        <Sheet
          title={
            <span className="row" style={{ gap: 9 }}>
              {(() => { const Icon = speciesIcon(selected.id); return <Icon size={22} style={{ color: speciesColor(selected.id) }} /> })()}
              {selected.name}
            </span>
          }
          subtitle={selected.latin}
          onClose={() => setOpen(null)}
        >
          <div className="card">
            <div className="label" style={{ marginBottom: 6 }}>Var den växer</div>
            <p className="small">{selected.where}</p>
            <div className="label" style={{ margin: '12px 0 6px' }}>Trädslag den lever med</div>
            <div className="chips">
              {selected.hosts.map((h) => (
                <span key={h} className="chip" style={{ minHeight: 30, fontSize: 13 }}>{hostName(h)}</span>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>Säsong där du är</div>
            <SeasonBand speciesData={selected} lat={lat} />
          </div>

          {selected.features.length ? (
            <div className="card">
              <div className="label" style={{ marginBottom: 8 }}>Så känner du igen den</div>
              <ul className="bullets" style={{ color: 'var(--text)' }}>
                {selected.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          ) : null}

          {selected.lookalikes.length ? (
            <div className="danger-box" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <IconWarning size={18} />
                <strong>Kan förväxlas med</strong>
              </div>
              <ul className="bullets" style={{ color: 'var(--text)' }}>
                {selected.lookalikes.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>Vad modellen vet om arten</div>
            <div className="metrics">
              <div className="metric">
                <div className="v">{selected.rainLag.peak}</div>
                <div className="e">dygn efter regn</div>
              </div>
              <div className="metric">
                <div className="v">{selected.soilTemp.opt}°</div>
                <div className="e">bäst marktemp</div>
              </div>
              <div className="metric">
                <div className="v">{(selected.soilMoisture.opt * 100).toFixed(0)}%</div>
                <div className="e">bäst markfukt</div>
              </div>
              <div className="metric">
                <div className="v">{selected.frostHardy ? 'Ja' : 'Nej'}</div>
                <div className="e">tål frost</div>
              </div>
            </div>
          </div>

          <button
            className="btn primary wide"
            onClick={() => { app.setSelectedSpecies(selected.id); app.setView('map'); setOpen(null) }}
          >
            Leta efter {selected.name.toLowerCase()} på kartan
          </button>
        </Sheet>
      ) : null}

      {showSafety ? (
        <Sheet title="Innan du äter något" onClose={() => setShowSafety(false)}>
          <div className="danger-box" style={{ marginBottom: 14 }}>
            Den här appen hjälper dig hitta <em>platser</em>. Den kan inte artbestämma
            svamp åt dig, och den vet inte vad som ligger i din korg.
          </div>
          <ul className="bullets" style={{ color: 'var(--text)', fontSize: 14.5 }}>
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
          <hr className="divider" />
          <p className="small dim">
            Allemansrätten ger dig rätt att plocka matsvamp i skog och mark, men inte i
            naturreservat med plockförbud, inte på tomtmark och inte i planteringar.
            Kolla skyltar och reservatsföreskrifter.
          </p>
        </Sheet>
      ) : null}
    </div>
  )
}
