import { species as lookupSpecies } from '../data/species.ts'
import { LAND_TYPE_NAME } from '../data/overpass.ts'
import { chanceColor, chanceWord } from '../lib/color.ts'
import { formatDistance, compass } from '../lib/geo.ts'
import type { SpeciesId } from '../lib/types.ts'
import { hostName } from '../model/habitat.ts'
import type { PointAssessment } from '../model/scan.ts'
import { ScorePartList } from './Score.tsx'

/** A word for how wet it is, instead of an index value nobody can interpret. */
export function moistureInWords(twi: number): string {
  if (twi < 6) return 'Torr ås'
  if (twi < 7.5) return 'Väldränerat'
  if (twi < 9) return 'Friskt'
  if (twi < 10.5) return 'Fuktigt'
  if (twi < 12.5) return 'Blött'
  return 'Vattensjukt'
}

function Fact({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <div className="fact">
      <div className="label">{label}</div>
      <div className="bold">{value}</div>
      {extra ? <div className="tiny dimmer">{extra}</div> : null}
    </div>
  )
}

export function PointDetail({
  assessment,
  speciesId,
  compact = false,
}: {
  assessment: PointAssessment
  speciesId: SpeciesId
  compact?: boolean
}) {
  const sp = lookupSpecies(speciesId)
  const s = assessment.sample
  const habitatPercent = Math.round(assessment.habitat * 100)

  const limiterText =
    assessment.season < 0.05
      ? `${sp.name} är inte i säsong just nu`
      : assessment.fruiting.limiter === 'water'
        ? 'Vädret håller tillbaka — för lite fukt i marken'
        : assessment.fruiting.limiter === 'temperature'
          ? 'Vädret håller tillbaka — marktemperaturen passar inte'
          : assessment.fruiting.limiter === 'frost'
            ? 'Frosten har avslutat säsongen här'
            : assessment.fruiting.limiter === 'drought'
              ? 'Lång torka gör att mycelet är sent på det'
              : habitatPercent >= 65
                ? 'Både marken och vädret talar för det här stället'
                : 'Vädret är okej — det är marken som avgör'

  return (
    <>
      {assessment.landCoverMissing ? (
        <div className="warning" style={{ marginBottom: 12 }}>
          <strong>Utan kartdata.</strong> OpenStreetMap gick inte att nå, så marktypen är
          okänd och poängen bygger bara på terrängen. Siffran är trubbigare än vanligt —
          den kan inte se skillnad på granskog och åker.
        </div>
      ) : null}
      <div className="card" style={{ borderColor: chanceColor(assessment.chance / 100) }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="label">Chans idag</div>
            <div className="num" style={{ fontSize: 38, lineHeight: 1.1, color: chanceColor(assessment.chance / 100) }}>
              {Math.round(assessment.chance)}%
            </div>
            <div className="small bold" style={{ color: chanceColor(assessment.chance / 100) }}>
              {chanceWord(assessment.chance)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="label">Habitat</div>
            <div className="num" style={{ fontSize: 26, color: chanceColor(assessment.habitat) }}>{habitatPercent}%</div>
            <div className="tiny dimmer">oberoende av väder</div>
          </div>
        </div>
        <div className="small dim" style={{ marginTop: 10 }}>{limiterText}</div>
      </div>

      <div className="facts">
        <Fact
          label="Mark"
          value={LAND_TYPE_NAME[s.landType]}
          extra={s.treeSpecies.length ? s.treeSpecies.map(hostName).join(', ') : undefined}
        />
        <Fact label="Fuktighet" value={moistureInWords(s.twi)} extra={`våtindex ${s.twi.toFixed(1)}`} />
        <Fact
          label="Lutning"
          value={s.slope < 1 ? 'Plant' : `${s.slope.toFixed(1)}°`}
          extra={s.aspect === null ? undefined : `mot ${compass(s.aspect)}`}
        />
        <Fact label="Höjd" value={`${Math.round(s.elevation)} m`} extra="över havet" />
        <Fact label="Vatten" value={s.toWater === null ? '–' : formatDistance(s.toWater)} extra="till dike eller bäck" />
        <Fact label="Stig eller bryn" value={s.toEdge === null ? '–' : formatDistance(s.toEdge)} extra="till närmaste kant" />
      </div>

      {!compact ? (
        <>
          <div className="card">
            <div className="card-head">
              <h3>Vad poängen består av</h3>
            </div>
            <ScorePartList parts={assessment.parts} />
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Vädret bakom siffran</h3>
              <span className="num small" style={{ color: chanceColor(assessment.fruiting.index) }}>
                {Math.round(assessment.fruiting.index * 100)}%
              </span>
            </div>
            <div className="metrics" style={{ marginBottom: 12 }}>
              <div className="metric">
                <div className="v">{Math.round(assessment.fruiting.rain14)}</div>
                <div className="e">mm / 14 d</div>
              </div>
              <div className="metric">
                <div className="v">{Math.round(assessment.fruiting.rain30)}</div>
                <div className="e">mm / 30 d</div>
              </div>
              <div className="metric">
                <div className="v">{assessment.fruiting.meanSoilTemp.toFixed(1)}°</div>
                <div className="e">i marken</div>
              </div>
              <div className="metric">
                <div className="v">{(assessment.fruiting.meanSoilMoisture * 100).toFixed(0)}%</div>
                <div className="e">markfukt</div>
              </div>
            </div>
            <ul className="bullets">
              {assessment.fruiting.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  )
}
