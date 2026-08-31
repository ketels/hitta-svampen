import { useCallback, useEffect, useMemo, useState } from 'react'
import { SPECIES, species as lookupSpecies, MAIN_SPECIES } from '../data/species.ts'
import { fetchWeather, type WeatherSeries } from '../data/weather.ts'
import { chanceColor } from '../lib/color.ts'
import { useApp } from '../state/app.tsx'
import { computeFruiting, forecastAhead, seasonFactor, seasonText } from '../model/fruiting.ts'
import { adaptSpecies } from '../model/personalize.ts'
import { ChanceGauge } from '../components/Score.tsx'
import { speciesIcon, speciesColor } from '../components/SpeciesIcons.tsx'
import { ForecastChart, RainChart } from '../components/Charts.tsx'
import { IconCrosshair, IconSun } from '../components/Icons.tsx'
import { daylight } from '../lib/time.ts'

/* "Visa alla nio arter" reads better than "Visa alla 9 arter", and the count
   should be derived rather than written out in plain text. */
const NUMBER_WORDS = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv']
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

/** How many species the list shows before you ask for the rest. */
const SPECIES_IN_SHORT_LIST = 5

/**
 * Moisture as a percentage on the scale the score is actually computed in:
 * relative extractable water against the site's own climatology when there is
 * one, otherwise raw m³/m³. The number has to belong with its own colour — an
 * absolute moisture value coloured by a REW score contradicts itself for
 * whoever reads it.
 *
 * Below the site's driest state REW goes negative, and then "<0" says more
 * than a negative number: the ground is drier than it usually gets, and by how
 * much does not matter to someone deciding whether to go out.
 */
function moisturePercent(rew: number | null, absolute: number): string {
  if (rew === null) return `${Math.round(absolute * 100)}%`
  return rew < 0 ? '<0%' : `${Math.round(rew * 100)}%`
}

export function ForecastView() {
  const app = useApp()
  const [weather, setWeather] = useState<WeatherSeries | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allSpecies, setAllSpecies] = useState(false)

  const position = app.gps.position ?? app.lastPosition

  const load = useCallback(async () => {
    if (!position) return
    setLoading(true)
    setError(null)
    try {
      setWeather(await fetchWeather(position.lat, position.lon))
    } catch {
      setError('Kunde inte hämta vädret. Prognosen behöver uppkoppling minst en gång per dag.')
    } finally {
      setLoading(false)
    }
  }, [position])

  useEffect(() => {
    void load()
  }, [load])

  const speciesData = useMemo(
    () => adaptSpecies(lookupSpecies(app.selectedSpecies), app.finds).species,
    [app.selectedSpecies, app.finds],
  )

  const analysis = useMemo(() => {
    if (!weather || !position) return null
    const todayDate = weather.days[weather.today]!.date
    const f = computeFruiting(weather.days, speciesData, todayDate)
    const s = seasonFactor(speciesData, new Date(), position.lat)
    const ahead = forecastAhead(weather.days, speciesData, position.lat, weather.today, 16)
    const best = ahead.reduce((a, b) => (b.chance > a.chance ? b : a), ahead[0]!)
    return { f, s, ahead, best, chance: f.index * s * 100 }
  }, [weather, speciesData, position])

  /** Which species are worth looking for right now. */
  const speciesStatus = useMemo(() => {
    if (!weather || !position) return []
    const todayDate = weather.days[weather.today]!.date
    return SPECIES.filter((s) => s.id !== 'other')
      .map((base) => {
        const { species: sp } = adaptSpecies(base, app.finds)
        const f = computeFruiting(weather.days, sp, todayDate)
        const s = seasonFactor(sp, new Date(), position.lat)
        return { species: sp, index: f.index, season: s, chance: f.index * s * 100 }
      })
      .sort((a, b) => b.chance - a.chance)
  }, [weather, position, app.finds])

  if (!position) {
    return (
      <div className="scroll">
        <div className="empty">
          <span className="emoji">📍</span>
          <p>Prognosen behöver veta var du är — vädret skiljer sig rejält mellan grannskogar.</p>
          <button className="btn primary" onClick={app.gps.start} style={{ marginTop: 12 }}>
            <IconCrosshair size={18} /> Slå på platsen
          </button>
          {app.gps.message ? <p className="small dim" style={{ marginTop: 12 }}>{app.gps.message}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="scroll">
      <div className="chip-row" style={{ marginBottom: 14 }}>
        <div className="chips row">
          {MAIN_SPECIES.map((id) => {
            const sp = lookupSpecies(id)
            const Icon = speciesIcon(id)
            return (
              <button key={id} className="chip" aria-pressed={app.selectedSpecies === id} onClick={() => app.setSelectedSpecies(id)}>
                <Icon size={17} style={{ color: speciesColor(id) }} />
                {sp.name}
              </button>
            )
          })}
        </div>
      </div>

      {loading && !weather ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto 14px', width: 26, height: 26 }} />
          Hämtar 60 dygn väderhistorik…
        </div>
      ) : error ? (
        <div className="danger-box">{error}</div>
      ) : analysis && weather ? (
        <>
          {/* The species already appears in the chip above, so the gauge needs
              no label of its own. Daylight and season share a footer row: both
              answer how far along we are, one in the day and the other in the
              year. */}
          <div className="card" style={{ padding: '18px 14px 16px' }}>
            <ChanceGauge percent={analysis.chance} />
            <div className="gauge-foot">
              {(() => {
                const light = daylight(weather.days[weather.today])
                return light.text ? (
                  <span>
                    <IconSun size={15} />
                    {light.text}
                  </span>
                ) : null
              })()}
              <span>{seasonText(speciesData, new Date(), position.lat)}</span>
            </div>
            {weather.stale ? (
              <div className="tiny dimmer center" style={{ marginTop: 10 }}>
                Sparad data — appen har inte nått nätet på ett tag
              </div>
            ) : null}
          </div>

          {/* The best day was the only reason to look below the chart. It now
              sits above it, in short form. */}
          <div className="card">
            <div className="card-head">
              <h3>Kommande dygn</h3>
              {analysis.best.chance > analysis.ahead[0]!.chance * 1.12 && analysis.best.chance > 0.1 ? (
                <span className="small" style={{ color: 'var(--gold-light)' }}>
                  Bäst {new Date(analysis.best.date + 'T12:00:00').toLocaleDateString('sv-SE', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  }).replace('.', '')} · {Math.round(analysis.best.chance * 100)} %
                </span>
              ) : (
                <span className="small dim">
                  {analysis.chance > 30 ? 'Redan så bra det blir' : 'Ingen förbättring i sikte'}
                </span>
              )}
            </div>
            <ForecastChart days={analysis.ahead.slice(0, 12)} />
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Regnet som räknas</h3>
            </div>
            <p className="small dim">
              Allt regn räknas, men med olika vikt: tyngst väger det som föll för ungefär{' '}
              {speciesData.rainLag.peak} dygn sedan — gradienten visar vikten dag för dag.
              Första millimetern varje regndygn stannar i trädkronorna och räknas bort.
              Gårdagens skyfall väger lätt för ny fruktsättning men håller ytan fuktig och
              gynnar svamp som redan är på väg upp.
            </p>
            <RainChart
              days={weather.days}
              today={weather.today}
              peak={speciesData.rainLag.peak}
              width={speciesData.rainLag.width}
            />
            {/* The weighted rain is the number the whole model is built on and
                the only one that deserves gold. */}
            <div className="value-grid" style={{ marginTop: 14 }}>
              <div className="value-cell">
                <span className="e">Viktat regn</span>
                <span className="v" style={{ color: 'var(--gold-text)' }}>
                  {analysis.f.rainInWindow.toFixed(1)} mm/d
                </span>
              </div>
              <div className="value-cell">
                <span className="e">30 dygn</span>
                <span className="v">{Math.round(analysis.f.rain30)} mm</span>
              </div>
              <div className="value-cell">
                <span className="e">7 dygn</span>
                <span className="v">{Math.round(analysis.f.rain7)} mm</span>
              </div>
              <div className="value-cell">
                <span className="e">Sen regn</span>
                <span className="v">
                  {analysis.f.daysSinceRain === null ? '30+ dygn' : `${analysis.f.daysSinceRain} dygn`}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Marken just nu</h3>
            </div>
            {/* Without this line the moisture figures are inexplicable: 30 %
                can be red in a spot that is normally wetter, and it looks like
                a bug in the app rather than like drought. */}
            {analysis.f.normalized ? (
              <p className="small dim">
                Fukten vägs mot platsens egen 15-årsklimatologi — 0 % är det torraste den här
                marken brukar bli, 100 % det blötaste. Samma absoluta fuktvärde betyder olika
                saker i en sandig tallmo och i en lerig granskog.
              </p>
            ) : null}
            <div className="metrics" style={{ marginBottom: 12 }}>
              <div className="metric">
                <div className="v" style={{ color: chanceColor(analysis.f.surfaceMoisture) }}>
                  {moisturePercent(analysis.f.meanSurfaceRew, analysis.f.meanSurfaceMoisture)}
                </div>
                <div className="e">ytfukt 3–9 cm</div>
              </div>
              <div className="metric">
                <div className="v" style={{ color: chanceColor(analysis.f.soilMoisture) }}>
                  {moisturePercent(analysis.f.meanDeepRew, analysis.f.meanSoilMoisture)}
                </div>
                <div className="e">djupfukt 9–27 cm</div>
              </div>
              <div className="metric">
                <div className="v" style={{ color: chanceColor(analysis.f.soilTemp) }}>
                  {analysis.f.meanSoilTemp.toFixed(1)}°
                </div>
                <div className="e">marktemp 6 cm</div>
              </div>
              <div className="metric">
                <div className="v" style={{ color: chanceColor(analysis.f.index) }}>
                  {Math.round(analysis.f.index * 100)}%
                </div>
                <div className="e">fruktsättning</div>
              </div>
            </div>
            <ul className="bullets">
              {analysis.f.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Vad som står i skogen nu</h3>
            </div>
            <div className="species-list">
              {(allSpecies ? speciesStatus : speciesStatus.slice(0, SPECIES_IN_SHORT_LIST)).map((s) => {
                const Icon = speciesIcon(s.species.id)
                return (
                  <button
                    key={s.species.id}
                    className="species-row"
                    onClick={() => app.setSelectedSpecies(s.species.id)}
                    aria-pressed={app.selectedSpecies === s.species.id}
                  >
                    <span className="species-icon"><Icon size={17} style={{ color: speciesColor(s.species.id) }} /></span>
                    <span className="grow truncate bold small">{s.species.name}</span>
                    <span className="bar" style={{ width: 74 }}>
                      <i style={{ width: `${Math.max(2, s.chance)}%`, background: chanceColor(s.chance / 100) }} />
                    </span>
                    <span className="num small" style={{ width: 34, textAlign: 'right', color: chanceColor(s.chance / 100) }}>
                      {Math.round(s.chance)}%
                    </span>
                  </button>
                )
              })}
            </div>
            {speciesStatus.length > SPECIES_IN_SHORT_LIST ? (
              <button className="show-all" onClick={() => setAllSpecies((v) => !v)} aria-expanded={allSpecies}>
                {allSpecies ? 'Visa färre' : `Visa alla ${numberWord(speciesStatus.length)} arter`}
              </button>
            ) : null}
          </div>

          <p className="tiny dimmer center" style={{ marginTop: 4 }}>
            Väderdata från Open-Meteo (ERA5 och ICON). Position {position.lat.toFixed(3)}, {position.lon.toFixed(3)}.
          </p>
        </>
      ) : null}
    </div>
  )
}
