import { art } from '../data/arter.ts'
import { MARKTYP_NAMN } from '../data/overpass.ts'
import { chansfarg, chansOrd } from '../lib/farg.ts'
import { formateraAvstand, kompass } from '../lib/geo.ts'
import type { SpeciesId } from '../lib/types.ts'
import type { Punktbedomning } from '../model/skanning.ts'
import { Delpoangslista } from './Poang.tsx'

/** Ord för hur blött det är, i stället för ett indexvärde ingen kan tolka. */
export function fuktIOrd(twi: number): string {
  if (twi < 6) return 'Torr ås'
  if (twi < 7.5) return 'Väldränerat'
  if (twi < 9) return 'Friskt'
  if (twi < 10.5) return 'Fuktigt'
  if (twi < 12.5) return 'Blött'
  return 'Vattensjukt'
}

function Ruta({ etikett, varde, extra }: { etikett: string; varde: string; extra?: string }) {
  return (
    <div className="faktaruta">
      <div className="etikett">{etikett}</div>
      <div className="fet">{varde}</div>
      {extra ? <div className="mini svagast">{extra}</div> : null}
    </div>
  )
}

export function PunktDetalj({
  b,
  artId,
  kompakt = false,
}: {
  b: Punktbedomning
  artId: SpeciesId
  kompakt?: boolean
}) {
  const a = art(artId)
  const p = b.prov
  const habProc = Math.round(b.habitat * 100)

  const begransning =
    b.sasong < 0.05
      ? `${a.namn} är inte i säsong just nu`
      : b.fruktsattning.begransning === 'vatten'
        ? 'Vädret håller tillbaka — för lite fukt i marken'
        : b.fruktsattning.begransning === 'temperatur'
          ? 'Vädret håller tillbaka — marktemperaturen passar inte'
          : b.fruktsattning.begransning === 'frost'
            ? 'Frosten har avslutat säsongen här'
            : b.fruktsattning.begransning === 'torka'
              ? 'Lång torka gör att mycelet är sent på det'
              : habProc >= 65
                ? 'Både marken och vädret talar för det här stället'
                : 'Vädret är okej — det är marken som avgör'

  return (
    <>
      <div className="kort" style={{ borderColor: chansfarg(b.chans / 100) }}>
        <div className="rad mellan" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="etikett">Chans idag</div>
            <div className="siffror" style={{ fontSize: 38, lineHeight: 1.1, color: chansfarg(b.chans / 100) }}>
              {Math.round(b.chans)}%
            </div>
            <div className="liten fet" style={{ color: chansfarg(b.chans / 100) }}>
              {chansOrd(b.chans)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="etikett">Habitat</div>
            <div className="siffror" style={{ fontSize: 26, color: chansfarg(b.habitat) }}>{habProc}%</div>
            <div className="mini svagast">oberoende av väder</div>
          </div>
        </div>
        <div className="liten svag" style={{ marginTop: 10 }}>{begransning}</div>
      </div>

      <div className="faktarutor">
        <Ruta etikett="Mark" varde={MARKTYP_NAMN[p.marktyp]} extra={p.tradslag.length ? p.tradslag.join(', ') : undefined} />
        <Ruta etikett="Fuktighet" varde={fuktIOrd(p.twi)} extra={`våtindex ${p.twi.toFixed(1)}`} />
        <Ruta
          etikett="Lutning"
          varde={p.lutning < 1 ? 'Plant' : `${p.lutning.toFixed(1)}°`}
          extra={p.vaderstreck === null ? undefined : `mot ${kompass(p.vaderstreck)}`}
        />
        <Ruta etikett="Höjd" varde={`${Math.round(p.hojd)} m`} extra="över havet" />
        <Ruta etikett="Vatten" varde={p.tillVatten === null ? '–' : formateraAvstand(p.tillVatten)} extra="till dike eller bäck" />
        <Ruta etikett="Stig eller bryn" varde={p.tillKant === null ? '–' : formateraAvstand(p.tillKant)} extra="till närmaste kant" />
      </div>

      {!kompakt ? (
        <>
          <div className="kort">
            <div className="kort-rubrik">
              <h3>Vad poängen består av</h3>
            </div>
            <Delpoangslista delar={b.delar} />
          </div>

          <div className="kort">
            <div className="kort-rubrik">
              <h3>Vädret bakom siffran</h3>
              <span className="siffror liten" style={{ color: chansfarg(b.fruktsattning.index) }}>
                {Math.round(b.fruktsattning.index * 100)}%
              </span>
            </div>
            <div className="matvarden" style={{ marginBottom: 12 }}>
              <div className="matvarde">
                <div className="v">{Math.round(b.fruktsattning.regn14)}</div>
                <div className="e">mm / 14 d</div>
              </div>
              <div className="matvarde">
                <div className="v">{Math.round(b.fruktsattning.regn30)}</div>
                <div className="e">mm / 30 d</div>
              </div>
              <div className="matvarde">
                <div className="v">{b.fruktsattning.medelMarktemp.toFixed(1)}°</div>
                <div className="e">i marken</div>
              </div>
              <div className="matvarde">
                <div className="v">{(b.fruktsattning.medelMarkfukt * 100).toFixed(0)}%</div>
                <div className="e">markfukt</div>
              </div>
            </div>
            <ul className="punktlista">
              {b.fruktsattning.forklaring.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  )
}
