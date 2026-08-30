import { useState } from 'react'
import { ARTER, HUVUDARTER, art } from '../data/arter.ts'
import { formateraKoord } from '../lib/geo.ts'
import { nyttId, sparaBild } from '../lib/db.ts'
import type { Find, Mangd, SpeciesId } from '../lib/types.ts'
import { IkonKamera, IkonStjarna } from './Ikoner.tsx'

const MANGDER: { id: Mangd; namn: string; beskrivning: string }[] = [
  { id: 'enstaka', namn: 'Enstaka', beskrivning: 'Någon enda' },
  { id: 'handfull', namn: 'Handfull', beskrivning: 'En näve' },
  { id: 'korg', namn: 'Korg', beskrivning: 'Rejält med svamp' },
  { id: 'jackpot', namn: 'Jackpot', beskrivning: 'Ett ställe att komma ihåg' },
]

export function FyndFormular({
  lat,
  lon,
  noggrannhet,
  befintligt,
  standardArt,
  onSpara,
  onAvbryt,
}: {
  lat: number
  lon: number
  noggrannhet: number | null
  befintligt?: Find
  standardArt: SpeciesId
  onSpara: (f: Find) => void
  onAvbryt: () => void
}) {
  const [artId, setArtId] = useState<SpeciesId>(befintligt?.art ?? standardArt)
  const [mangd, setMangd] = useState<Mangd>(befintligt?.mangd ?? 'handfull')
  const [anteckning, setAnteckning] = useState(befintligt?.anteckning ?? '')
  const [favorit, setFavorit] = useState(befintligt?.favorit ?? false)
  const [bilder, setBilder] = useState<string[]>(befintligt?.bilder ?? [])
  const [visaAllaArter, setVisaAllaArter] = useState(false)
  const [sparar, setSparar] = useState(false)

  const arterAttVisa = visaAllaArter ? ARTER.map((a) => a.id) : HUVUDARTER

  const laggTillBild = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filer = Array.from(e.target.files ?? [])
    const nya: string[] = []
    for (const f of filer) nya.push(await sparaBild(f))
    setBilder((b) => [...b, ...nya])
    e.target.value = ''
  }

  const spara = () => {
    setSparar(true)
    onSpara({
      id: befintligt?.id ?? nyttId(),
      lat,
      lon,
      noggrannhet,
      tid: befintligt?.tid ?? Date.now(),
      art: artId,
      mangd,
      anteckning: anteckning.trim(),
      bilder,
      favorit,
      habitat: befintligt?.habitat,
      vader: befintligt?.vader,
    })
  }

  return (
    <>
      <div className="liten svagast" style={{ marginBottom: 14 }}>
        {formateraKoord(lat, lon)}
        {noggrannhet !== null ? ` · ±${Math.round(noggrannhet)} m` : ''}
      </div>

      <div className="etikett" style={{ marginBottom: 8 }}>Art</div>
      <div className="chips" style={{ marginBottom: 6 }}>
        {arterAttVisa.map((id) => {
          const a = art(id)
          return (
            <button
              key={id}
              className="chip"
              aria-pressed={artId === id}
              onClick={() => setArtId(id)}
            >
              <span>{a.emoji}</span>
              {a.namn}
            </button>
          )
        })}
        {!visaAllaArter ? (
          <button className="chip" onClick={() => setVisaAllaArter(true)}>Annan…</button>
        ) : null}
      </div>

      <hr className="skiljare" />

      <div className="etikett" style={{ marginBottom: 8 }}>Hur mycket?</div>
      <div className="segment" style={{ marginBottom: 14 }}>
        {MANGDER.map((m) => (
          <button key={m.id} aria-pressed={mangd === m.id} onClick={() => setMangd(m.id)}>
            {m.namn}
          </button>
        ))}
      </div>

      <label className="falt">
        <span>Anteckning</span>
        <textarea
          value={anteckning}
          onChange={(e) => setAnteckning(e.target.value)}
          placeholder="Under den stora granen vid dikeskanten, ca 30 m från stigen…"
        />
      </label>

      <div className="rad" style={{ gap: 8, marginBottom: 14 }}>
        <label className="knapp vaxa" style={{ cursor: 'pointer' }}>
          <IkonKamera size={19} />
          {bilder.length ? `${bilder.length} bild${bilder.length === 1 ? '' : 'er'}` : 'Lägg till bild'}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={laggTillBild}
            style={{ display: 'none' }}
          />
        </label>
        <button
          className="knapp"
          aria-pressed={favorit}
          onClick={() => setFavorit((v) => !v)}
          style={favorit ? { background: 'var(--guld)', borderColor: 'var(--guld)', color: '#191203' } : undefined}
          title="Markera som ett av dina bästa ställen"
        >
          <IkonStjarna size={19} />
          Guldställe
        </button>
      </div>

      <div className="arkknappar">
        <button className="knapp" onClick={onAvbryt}>Avbryt</button>
        <button className="knapp primar" onClick={spara} disabled={sparar}>
          {befintligt ? 'Spara ändringar' : 'Spara fyndet'}
        </button>
      </div>
    </>
  )
}
