import { useState } from 'react'
import { SPECIES, MAIN_SPECIES, species as lookupSpecies } from '../data/species.ts'
import { formatCoord } from '../lib/geo.ts'
import { newId, savePhoto } from '../lib/db.ts'
import type { Find, Amount, SpeciesId } from '../lib/types.ts'
import { IconCamera, IconStar } from './Icons.tsx'
import { speciesIcon, speciesColor } from './SpeciesIcons.tsx'

const AMOUNTS: { id: Amount; name: string; description: string }[] = [
  { id: 'few', name: 'Enstaka', description: 'Någon enda' },
  { id: 'handful', name: 'Handfull', description: 'En näve' },
  { id: 'basket', name: 'Korg', description: 'Rejält med svamp' },
  { id: 'jackpot', name: 'Jackpot', description: 'Ett ställe att komma ihåg' },
]

export function FindForm({
  lat,
  lon,
  accuracy,
  existing,
  defaultSpecies,
  onSave,
  onCancel,
}: {
  lat: number
  lon: number
  accuracy: number | null
  existing?: Find
  defaultSpecies: SpeciesId
  onSave: (f: Find) => void
  onCancel: () => void
}) {
  const [speciesId, setSpeciesId] = useState<SpeciesId>(existing?.species ?? defaultSpecies)
  const [amount, setAmount] = useState<Amount>(existing?.amount ?? 'handful')
  const [note, setNote] = useState(existing?.note ?? '')
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const [showAllSpecies, setShowAllSpecies] = useState(false)
  const [saving, setSaving] = useState(false)

  const speciesToShow = showAllSpecies ? SPECIES.map((s) => s.id) : MAIN_SPECIES

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const added: string[] = []
    for (const f of files) added.push(await savePhoto(f))
    setPhotos((p) => [...p, ...added])
    e.target.value = ''
  }

  const save = () => {
    setSaving(true)
    onSave({
      id: existing?.id ?? newId(),
      lat,
      lon,
      accuracy,
      time: existing?.time ?? Date.now(),
      species: speciesId,
      amount,
      note: note.trim(),
      photos,
      favorite,
      habitat: existing?.habitat,
      weather: existing?.weather,
    })
  }

  return (
    <>
      <div className="small dimmer" style={{ marginBottom: 14 }}>
        {formatCoord(lat, lon)}
        {accuracy !== null ? ` · ±${Math.round(accuracy)} m` : ''}
      </div>

      <div className="label" style={{ marginBottom: 8 }}>Art</div>
      <div className="chips" style={{ marginBottom: 6 }}>
        {speciesToShow.map((id) => {
          const sp = lookupSpecies(id)
          const Icon = speciesIcon(id)
          return (
            <button
              key={id}
              className="chip"
              aria-pressed={speciesId === id}
              onClick={() => setSpeciesId(id)}
            >
              <Icon size={17} style={{ color: speciesColor(id) }} />
              {sp.name}
            </button>
          )
        })}
        {!showAllSpecies ? (
          <button className="chip" onClick={() => setShowAllSpecies(true)}>Annan…</button>
        ) : null}
      </div>

      <hr className="divider" />

      <div className="label" style={{ marginBottom: 8 }}>Hur mycket?</div>
      <div className="segment" style={{ marginBottom: 14 }}>
        {AMOUNTS.map((a) => (
          <button key={a.id} aria-pressed={amount === a.id} onClick={() => setAmount(a.id)}>
            {a.name}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Anteckning</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Under den stora granen vid dikeskanten, ca 30 m från stigen…"
        />
      </label>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <label className="btn grow" style={{ cursor: 'pointer' }}>
          <IconCamera size={19} />
          {photos.length ? `${photos.length} bild${photos.length === 1 ? '' : 'er'}` : 'Lägg till bild'}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={addPhoto}
            style={{ display: 'none' }}
          />
        </label>
        <button
          className="btn"
          aria-pressed={favorite}
          onClick={() => setFavorite((v) => !v)}
          style={favorite ? { background: 'var(--gold)', borderColor: 'var(--gold)', color: '#191203' } : undefined}
          title="Markera som ett av dina bästa ställen"
        >
          <IconStar size={19} />
          Guldställe
        </button>
      </div>

      <div className="sheet-actions">
        <button className="btn" onClick={onCancel}>Avbryt</button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {existing ? 'Spara ändringar' : 'Spara fyndet'}
        </button>
      </div>
    </>
  )
}
