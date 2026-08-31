import { chansfarg } from '../lib/farg.ts'
import type { VaderDag } from '../lib/types.ts'
import { kernvikt, type Dagsprognos } from '../model/fruktsattning.ts'

const veckodag = (datum: string) =>
  new Date(datum + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'short' }).slice(0, 2)

/**
 * Nederbörd dag för dag, med artens fördröjningskärna som gul gradient.
 * Det är den mest talande bilden i hela appen: den visar att regnet väger
 * tyngst kring två veckor bakåt men att även gårdagens regn räknas — bandet
 * tonar, det klipper inte.
 */
export function Regndiagram({
  serie,
  idag,
  topp,
  bredd,
  dagar = 45,
}: {
  serie: VaderDag[]
  idag: number
  topp: number
  bredd: number
  dagar?: number
}) {
  const fran = Math.max(0, idag - dagar + 1)
  const till = Math.min(serie.length, idag + 8)
  const del = serie.slice(fran, till)
  const max = Math.max(8, ...del.map((d) => d.nederbord))
  const B = 4.6
  const G = 1.6
  const H = 66
  const bredd_px = del.length * (B + G)

  return (
    <div className="diagram">
      <svg viewBox={`0 0 ${bredd_px} ${H + 16}`} width="100%" height={H + 16} preserveAspectRatio="none">
        {/* Kärnvikten dag för dag — exakt den funktion som driver modellen. */}
        {del.map((d, i) => {
          const alder = idag - (fran + i)
          if (alder < 0) return null
          const w = kernvikt(alder, { topp, bredd })
          if (w < 0.03) return null
          return (
            <rect
              key={'vikt-' + d.datum}
              x={i * (B + G) - G / 2}
              y={0}
              width={B + G}
              height={H}
              fill="var(--gulmark)"
              opacity={w}
            />
          )
        })}
        {del.map((d, i) => {
          const h = Math.max(d.nederbord > 0 ? 1.5 : 0, (d.nederbord / max) * H)
          const framtid = fran + i > idag
          return (
            <rect
              key={d.datum}
              x={i * (B + G)}
              y={H - h}
              width={B}
              height={h}
              rx={1.4}
              fill={framtid ? 'color-mix(in srgb, var(--bla) 50%, transparent)' : 'var(--bla)'}
            />
          )
        })}
        <line x1={0} y1={H} x2={bredd_px} y2={H} stroke="var(--kant)" strokeWidth="1" />
        <line
          x1={(idag - fran) * (B + G) + B / 2}
          y1={0}
          x2={(idag - fran) * (B + G) + B / 2}
          y2={H + 4}
          stroke="var(--text-svag)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
      <div className="diagram-fot mini svagast">
        <span>{dagar} dygn sedan</span>
        <span style={{ color: 'var(--guld-text)' }}>mörkare gult = tyngre vikt</span>
        <span>prognos →</span>
      </div>
    </div>
  )
}

/** Chansen dag för dag framåt. Den bästa dagen får en ring. */
export function Prognosdiagram({ dagar }: { dagar: Dagsprognos[] }) {
  if (dagar.length === 0) return null
  const max = Math.max(...dagar.map((d) => d.chans))
  const bast = dagar.findIndex((d) => d.chans === max)
  return (
    <div className="prognosstapel">
      {dagar.map((d, i) => {
        const h = Math.max(4, d.chans * 100)
        return (
          <div key={d.datum} className={`prognosdag${i === bast && max > 0.05 ? ' bast' : ''}`}>
            <div className="stapelbox">
              <i style={{ height: `${h}%`, background: chansfarg(d.chans) }} />
            </div>
            <div className="mini siffror" style={{ color: i === bast ? 'var(--guld-text)' : 'var(--text-svag)' }}>
              {Math.round(d.chans * 100)}
            </div>
            {/* Datumsiffran är redundant när veckodagen står ovanför, och
                kolumnerna får mer luft utan den. */}
            <div className="mini svagast">{i === 0 ? 'idag' : veckodag(d.datum)}</div>
          </div>
        )
      })}
    </div>
  )
}
