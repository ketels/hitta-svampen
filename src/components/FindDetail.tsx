import { useEffect, useState } from 'react'
import { species as lookupSpecies } from '../data/species.ts'
import { LAND_TYPE_NAME } from '../data/landCover.ts'
import { loadPhoto } from '../lib/db.ts'
import { formatDistance, formatCoord, compass } from '../lib/geo.ts'
import { useApp } from '../state/app.tsx'
import type { Find } from '../lib/types.ts'
import { FindForm } from './FindForm.tsx'
import { moistureInWords } from './PointDetail.tsx'
import { IconPin, IconTrash } from './Icons.tsx'
import { speciesIcon, speciesColor } from './SpeciesIcons.tsx'

const AMOUNT_TEXT: Record<Find['amount'], string> = {
  few: 'Enstaka',
  handful: 'En handfull',
  basket: 'En korg',
  jackpot: 'Jackpot',
}

function Photos({ ids }: { ids: string[] }) {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    const created: string[] = []
    void (async () => {
      for (const id of ids) {
        const b = await loadPhoto(id)
        if (b) created.push(URL.createObjectURL(b))
      }
      if (alive) setUrls(created)
      else created.forEach((u) => URL.revokeObjectURL(u))
    })()
    return () => {
      alive = false
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [ids])

  if (urls.length === 0) return null
  return (
    <div className="photo-row">
      {urls.map((u, i) => (
        <img key={i} src={u} alt="" loading="lazy" />
      ))}
    </div>
  )
}

export function FindDetail({
  find,
  onClose,
  onNavigate,
}: {
  find: Find
  onClose: () => void
  onNavigate: () => void
}) {
  const app = useApp()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const sp = lookupSpecies(find.species)
  const position = app.gps.position
  const h = find.habitat

  if (editing) {
    return (
      <FindForm
        lat={find.lat}
        lon={find.lon}
        accuracy={find.accuracy}
        existing={find}
        defaultSpecies={find.species}
        onSave={(f) => { void app.save(f); setEditing(false); onClose() }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
      <Photos ids={find.photos} />

      <div className="row" style={{ gap: 10, marginBottom: 12 }}>
        <span className="chip" style={{ borderColor: sp.color }}>
          {(() => {
            const Icon = speciesIcon(find.species)
            return <Icon size={17} style={{ color: speciesColor(find.species) }} />
          })()}
          {AMOUNT_TEXT[find.amount]}
        </span>
        {find.favorite ? <span className="chip" aria-pressed="true">⭐ Guldställe</span> : null}
      </div>

      {find.note ? (
        <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{find.note}</div>
      ) : null}

      <div className="card">
        <div className="label" style={{ marginBottom: 6 }}>Plats</div>
        <div className="small" style={{ fontFamily: 'var(--num-font)' }}>{formatCoord(find.lat, find.lon)}</div>
        {find.accuracy !== null ? (
          <div className="tiny dimmer">GPS-noggrannhet ±{Math.round(find.accuracy)} m</div>
        ) : null}
        {position ? (
          <div className="small dim" style={{ marginTop: 6 }}>
            {formatDistance(
              Math.hypot(
                (find.lat - position.lat) * 111320,
                (find.lon - position.lon) * 111320 * Math.cos((position.lat * Math.PI) / 180),
              ),
            )} härifrån
          </div>
        ) : null}
      </div>

      {h ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>Så såg marken ut här</div>
          <div className="facts" style={{ marginBottom: 0 }}>
            <div className="fact">
              <div className="label">Mark</div>
              <div className="bold">{LAND_TYPE_NAME[h.landType]}</div>
            </div>
            <div className="fact">
              <div className="label">Fuktighet</div>
              <div className="bold">{moistureInWords(h.twi)}</div>
            </div>
            <div className="fact">
              <div className="label">Lutning</div>
              <div className="bold">
                {h.slope < 1 ? 'Plant' : `${h.slope.toFixed(1)}°`}
              </div>
              {h.aspect !== null ? <div className="tiny dimmer">mot {compass(h.aspect)}</div> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="card small dim">
          Habitatdatan för det här fyndet är inte hämtad än. Den fylls i automatiskt
          nästa gång du har uppkoppling.
        </div>
      )}

      {find.weather ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>Vädret när du hittade den</div>
          <div className="metrics">
            <div className="metric">
              <div className="v">{Math.round(find.weather.rain14)}</div>
              <div className="e">mm / 14 d</div>
            </div>
            <div className="metric">
              <div className="v">{find.weather.soilTemp.toFixed(1)}°</div>
              <div className="e">i marken</div>
            </div>
            <div className="metric">
              <div className="v">{(find.weather.soilMoisture * 100).toFixed(0)}%</div>
              <div className="e">markfukt</div>
            </div>
            <div className="metric">
              <div className="v">{Math.round(find.weather.index * 100)}%</div>
              <div className="e">fruktsättning</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={onNavigate}><IconPin size={18} /> Navigera hit</button>
        <button className="btn" onClick={() => setEditing(true)}>Ändra</button>
      </div>

      {confirmDelete ? (
        <div className="danger-box">
          <p style={{ marginBottom: 10 }}>
            Ta bort fyndet för gott? Ett ställe du hittat svamp på är svårt att komma ihåg igen.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={() => setConfirmDelete(false)}>Behåll</button>
            <button
              className="btn danger"
              onClick={() => { void app.remove(find.id); onClose() }}
            >
              Ta bort
            </button>
          </div>
        </div>
      ) : (
        <button className="btn danger wide" onClick={() => setConfirmDelete(true)}>
          <IconTrash size={18} /> Ta bort fyndet
        </button>
      )}
    </>
  )
}
