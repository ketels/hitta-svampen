import { chanceColor, chanceWord, chanceAdvice } from '../lib/color.ts'
import type { ScorePart } from '../lib/types.ts'

/**
 * Large gauge for today's chance.
 *
 * The word sits inside the ring together with the number — they say the same
 * thing and never belonged apart. Outside the ring there is only the advice.
 */
export function ChanceGauge({
  percent,
  label,
  advice = true,
}: {
  percent: number
  /** Optional heading inside the ring. The forecast view has the species in
   *  the chip above. */
  label?: string
  advice?: boolean
}) {
  const p = Math.max(0, Math.min(100, percent))
  const color = chanceColor(p / 100)
  const R = 62
  const circumference = 2 * Math.PI * R
  // Three quarters of a turn feels like a gauge and not like a pie slice.
  const arc = 0.75
  return (
    <div className="gauge">
      <svg viewBox="0 0 160 160" width="184" height="184" aria-hidden="true">
        <circle
          cx="80" cy="80" r={R}
          fill="none" stroke="var(--surface-3)" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${circumference * arc} ${circumference}`}
          transform="rotate(135 80 80)"
        />
        <circle
          cx="80" cy="80" r={R}
          fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${circumference * arc * (p / 100)} ${circumference}`}
          transform="rotate(135 80 80)"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(.22,1,.36,1), stroke 0.5s' }}
        />
      </svg>
      <div className="gauge-center">
        <div className="num" style={{ fontSize: 46, lineHeight: 1, color }}>
          {Math.round(p)}
          <span style={{ fontSize: 20, marginLeft: 1 }}>%</span>
        </div>
        <div className="bold" style={{ color, fontSize: 17, marginTop: 2 }}>{chanceWord(p)}</div>
        {label ? <div className="label" style={{ marginTop: 4 }}>{label}</div> : null}
      </div>
      {advice ? (
        <div className="center dim" style={{ marginTop: -14, fontSize: 14 }}>
          {chanceAdvice(p)}
        </div>
      ) : null}
    </div>
  )
}

/** Compact bar with a label and a value. */
export function ScoreBar({
  name,
  value,
  reason,
  weight,
  kind = 'weight',
}: {
  name: string
  value: number
  reason?: string
  weight?: number
  kind?: 'weight' | 'factor'
}) {
  // Factors multiply the whole score rather than being weighed in, so a weight
  // percentage would be misleading for them.
  const note =
    kind === 'factor'
      ? 'avgör takhöjden'
      : weight !== undefined
        ? `vikt ${Math.round(weight * 100)}%`
        : null
  return (
    <div className="score-part">
      <div className="small bold">
        {name}
        {note ? <span className="dimmer tiny" style={{ fontWeight: 500 }}> · {note}</span> : null}
      </div>
      <div className="value" style={{ color: chanceColor(value) }}>{Math.round(value * 100)}</div>
      <div className="bar">
        <i style={{ width: `${Math.max(2, value * 100)}%`, background: chanceColor(value) }} />
      </div>
      {reason ? <div className="reason">{reason}</div> : null}
    </div>
  )
}

export function ScorePartList({ parts }: { parts: ScorePart[] }) {
  const weights = parts.filter((p) => (p.kind ?? 'weight') === 'weight')
  const factors = parts.filter((p) => p.kind === 'factor')
  return (
    <>
      <div className="score-parts">
        {weights.map((p) => (
          <ScoreBar key={p.name} name={p.name} value={p.value} reason={p.reason} weight={p.weight} />
        ))}
      </div>
      {factors.length ? (
        <>
          <hr className="divider" />
          <div className="score-parts">
            {factors.map((p) => (
              <ScoreBar key={p.name} name={p.name} value={p.value} reason={p.reason} kind="factor" />
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
