import { chanceColor } from '../lib/color.ts'
import type { WeatherDay } from '../lib/types.ts'
import { kernelWeight, type DayForecast } from '../model/fruiting.ts'

const weekday = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'short' }).slice(0, 2)

/**
 * Precipitation day by day, with the species' lag kernel as a gold gradient.
 * It is the most telling picture in the whole app: it shows that rain weighs
 * heaviest around two weeks back but that yesterday's rain counts too — the
 * band fades, it does not cut off.
 */
export function RainChart({
  days,
  today,
  peak,
  width,
  dayCount = 45,
}: {
  days: WeatherDay[]
  today: number
  peak: number
  width: number
  dayCount?: number
}) {
  const from = Math.max(0, today - dayCount + 1)
  const to = Math.min(days.length, today + 8)
  const slice = days.slice(from, to)
  const max = Math.max(8, ...slice.map((d) => d.precipitation))
  const BAR = 4.6
  const GAP = 1.6
  const H = 66
  const widthPx = slice.length * (BAR + GAP)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${widthPx} ${H + 16}`} width="100%" height={H + 16} preserveAspectRatio="none">
        {/* The kernel weight day by day — exactly the function driving the model. */}
        {slice.map((d, i) => {
          const age = today - (from + i)
          if (age < 0) return null
          const w = kernelWeight(age, { peak, width })
          if (w < 0.03) return null
          return (
            <rect
              key={'weight-' + d.date}
              x={i * (BAR + GAP) - GAP / 2}
              y={0}
              width={BAR + GAP}
              height={H}
              fill="var(--gold-wash)"
              opacity={w}
            />
          )
        })}
        {slice.map((d, i) => {
          const h = Math.max(d.precipitation > 0 ? 1.5 : 0, (d.precipitation / max) * H)
          const future = from + i > today
          return (
            <rect
              key={d.date}
              x={i * (BAR + GAP)}
              y={H - h}
              width={BAR}
              height={h}
              rx={1.4}
              fill={future ? 'color-mix(in srgb, var(--blue) 50%, transparent)' : 'var(--blue)'}
            />
          )
        })}
        <line x1={0} y1={H} x2={widthPx} y2={H} stroke="var(--border)" strokeWidth="1" />
        <line
          x1={(today - from) * (BAR + GAP) + BAR / 2}
          y1={0}
          x2={(today - from) * (BAR + GAP) + BAR / 2}
          y2={H + 4}
          stroke="var(--text-dim)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
      <div className="chart-foot tiny dimmer">
        <span>{dayCount} dygn sedan</span>
        <span style={{ color: 'var(--gold-text)' }}>mörkare gult = tyngre vikt</span>
        <span>prognos →</span>
      </div>
    </div>
  )
}

/** The chance day by day ahead. The best day gets a ring. */
export function ForecastChart({ days }: { days: DayForecast[] }) {
  if (days.length === 0) return null
  const max = Math.max(...days.map((d) => d.chance))
  const best = days.findIndex((d) => d.chance === max)
  return (
    <div className="forecast-bars">
      {days.map((d, i) => {
        const h = Math.max(4, d.chance * 100)
        return (
          <div key={d.date} className={`forecast-day${i === best && max > 0.05 ? ' best' : ''}`}>
            <div className="bar-box">
              <i style={{ height: `${h}%`, background: chanceColor(d.chance) }} />
            </div>
            <div className="tiny num" style={{ color: i === best ? 'var(--gold-text)' : 'var(--text-dim)' }}>
              {Math.round(d.chance * 100)}
            </div>
            {/* The date number is redundant when the weekday sits above it, and
                the columns get more air without it. */}
            <div className="tiny dimmer">{i === 0 ? 'idag' : weekday(d.date)}</div>
          </div>
        )
      })}
    </div>
  )
}
