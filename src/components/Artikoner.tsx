/** Artikoner. Ifyllda silhuetter, 24×24, ärver färg från texten.
 *
 * Till skillnad från Ikoner.tsx är de här ifyllda och inte streckade: en
 * 1,9-px-kontur försvinner vid 17 px, som är storleken de används i (chips,
 * fyndlistan, kartmarkören). Skillnaden mellan arterna sitter i silhuetten —
 * trattens djup och kantens vågighet, fotens tjocklek och hattens bredd. */

import { arLjustTema } from '../lib/farg.ts'
import type { SpeciesId } from '../lib/types.ts'

type P = {
  size?: number
  style?: React.CSSProperties
  className?: string
}

/**
 * Silhuetterna som råa vägar. Kartmarkörerna byggs som HTML-strängar åt
 * Leaflet och kan inte rendera en React-komponent, så vägarna måste gå att nå
 * utan JSX. En källa, två sätt att rita.
 */
export const ART_VAG: Record<SpeciesId, string> = {
  /** Sned, vågig tratt med solid, avsmalnande fot. */
  'kantarell':
    'M3.2 7c2 1.2 3.2-.8 4.6-.1 1.4.7 2.3-.7 3.9 0 1.7.7 2.7 2.1 4.1 1.5 1.5-.6 2.6-.8 4.5 1.2l-6.3 6.8v2.7c0 1.2-.8 1.9-2 1.9s-2-.7-2-1.9v-3.1L3.2 7z',
  /** Smalare tratt, vågig kant, tunn hålfot. */
  'trattkantarell':
    'M3.5 7.9c2 1 3.2-1 4.5-.3 1.3.7 2.2-1 3.8-.5 1.6.5 2.6 1.7 3.9 1 1.3-.7 2.4-1.4 4.5.1l-6.6 7.2v3.7c0 1.1-.6 1.7-1.6 1.7s-1.6-.6-1.6-1.7v-3.7L3.5 7.9z',
  /** Smal tratt, svagt vågig kant, ingen tydlig hattgräns. */
  'svart-trumpetsvamp':
    'M5.2 6.9c1.3.6 2.3-.5 3.5-.2 1.2.3 2.1.7 3.3.7s2.1-.4 3.3-.7c1.2-.3 2.2.8 3.5.2l-5.2 8.3v3.9c0 1.1-.6 1.7-1.6 1.7s-1.6-.6-1.6-1.7v-3.9L5.2 6.9z',
  /** Bred hatt, tjock bukig fot. */
  'karljohan':
    'M4.4 11.6c0-4 3.4-6.6 7.6-6.6s7.6 2.6 7.6 6.6c0 1-.7 1.4-1.8 1.4h-3.2c.5 2 1.4 3.3 1.4 5 0 1.9-1.8 2.8-4 2.8s-4-.9-4-2.8c0-1.7.9-3 1.4-5H6.2c-1.1 0-1.8-.4-1.8-1.4z',
  /** Buckligt hattvalv med taggar i underkanten. */
  'blek-taggsvamp':
    'M4.4 11.3c-.3-3.9 3.1-6.4 7.2-6.4 4.2 0 7.6 2.5 7.4 6.4-.1 1-.6 1.4-1.3 1.4-.6 0-.9-1.1-1.5-1.1s-.9 1.1-1.5 1.1c-.4 0-.7-.4-1-.8l.5 6.6c0 1-.8 1.6-2.2 1.6s-2.2-.6-2.2-1.6l.5-6.6c-.3.4-.6.8-1 .8-.6 0-.9-1.1-1.5-1.1s-.9 1.1-1.5 1.1c-.7 0-1.2-.4-1.3-1.4z',
  /** Låg, tvålobbig ticka, nästan ingen fot. */
  'faarticka':
    'M3.2 13.4c0-3.2 2.6-5.7 5.8-5.7 1.6 0 2.4.9 3.4.9s1.6-.9 3.2-.6c2.9.5 4.2 2.9 4.2 5.4 0 1.2-1 1.5-2.3 1.5h-1.9c0 1.4.4 2.3.4 3.2 0 1-1.2 1.5-2.8 1.5s-2.8-.5-2.8-1.5c0-.9.4-1.8.4-3.2H5.5c-1.3 0-2.3-.3-2.3-1.5z',
  /** Skålformad, nedsänkt hatt. */
  'blodriska':
    'M3.6 8.9c0 3.5 3.5 5.7 6.7 5.9l-.5 4.4c0 1 .8 1.5 2.2 1.5s2.2-.5 2.2-1.5l-.5-4.4c3.2-.2 6.7-2.4 6.7-5.9 0-.9-.6-1.3-1.5-1-2 .9-4.3 1.4-6.9 1.4s-4.9-.5-6.9-1.4c-.9-.3-1.5.1-1.5 1z',
  /** Bredast och plattast hatt, rak smal fot. */
  'sandsopp':
    'M3.5 12c0-3.5 3.8-5.8 8.5-5.8s8.5 2.3 8.5 5.8c0 .9-.6 1.3-1.7 1.3h-4.6l.5 5.8c0 1-.7 1.5-2.7 1.5s-2.7-.5-2.7-1.5l.5-5.8H5.2c-1.1 0-1.7-.4-1.7-1.3z',
  /** Liten hatt, hög smal fot. */
  'brunsopp':
    'M6.2 10c0-2.8 2.6-4.8 5.8-4.8s5.8 2 5.8 4.8c0 .9-.5 1.2-1.5 1.2h-2.7l.6 7.8c0 1-.7 1.5-2.2 1.5s-2.2-.5-2.2-1.5l.6-7.8H7.7c-1 0-1.5-.3-1.5-1.2z',
  /** Generisk hatt och fot. */
  'annat':
    'M4.8 12.4c0-4.1 3.2-7 7.2-7s7.2 2.9 7.2 7c0 1-.7 1.4-1.8 1.4h-3.6l.5 5.2c0 1-.7 1.6-2.3 1.6s-2.3-.6-2.3-1.6l.5-5.2H6.6c-1.1 0-1.8-.4-1.8-1.4z',
}

function Svamp({ size = 24, style, className, d }: P & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      style={style}
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="currentColor" d={d} />
    </svg>
  )
}

export const IkonKantarell = (p: P) => <Svamp {...p} d={ART_VAG['kantarell']} />
export const IkonTrattkantarell = (p: P) => <Svamp {...p} d={ART_VAG['trattkantarell']} />
export const IkonSvartTrumpetsvamp = (p: P) => <Svamp {...p} d={ART_VAG['svart-trumpetsvamp']} />
export const IkonKarlJohan = (p: P) => <Svamp {...p} d={ART_VAG['karljohan']} />
export const IkonBlekTaggsvamp = (p: P) => <Svamp {...p} d={ART_VAG['blek-taggsvamp']} />
export const IkonFarticka = (p: P) => <Svamp {...p} d={ART_VAG['faarticka']} />
export const IkonBlodriska = (p: P) => <Svamp {...p} d={ART_VAG['blodriska']} />
export const IkonSandsopp = (p: P) => <Svamp {...p} d={ART_VAG['sandsopp']} />
export const IkonBrunsopp = (p: P) => <Svamp {...p} d={ART_VAG['brunsopp']} />
export const IkonAnnanSvamp = (p: P) => <Svamp {...p} d={ART_VAG['annat']} />

/** Slå upp ikonen för en art. Fall tillbaka på den generiska. */
export const ART_IKON: Record<SpeciesId, (p: P) => React.ReactElement> = {
  'kantarell': IkonKantarell,
  'trattkantarell': IkonTrattkantarell,
  'svart-trumpetsvamp': IkonSvartTrumpetsvamp,
  'karljohan': IkonKarlJohan,
  'blek-taggsvamp': IkonBlekTaggsvamp,
  'faarticka': IkonFarticka,
  'blodriska': IkonBlodriska,
  'sandsopp': IkonSandsopp,
  'brunsopp': IkonBrunsopp,
  'annat': IkonAnnanSvamp,
}

export function artIkon(id: SpeciesId) {
  return ART_IKON[id] ?? IkonAnnanSvamp
}

/**
 * Artfärger justerade för att fungera som ifylld yta.
 *
 * Species.farg i arter.ts är valda som pricken de var — som fyllnadsyta
 * håller de inte kontrast. Svart trumpetsvamp #4a4a52 ger 1,4:1 mot --yta.
 * Här ligger både en ljusad variant för mörkt läge och en mörkad för ljust.
 */
export const IKONFARG: Record<SpeciesId, { mork: string; ljus: string }> = {
  'kantarell': { mork: '#f2b705', ljus: '#B98A04' },
  'trattkantarell': { mork: '#c98a3c', ljus: '#A0682A' },
  'svart-trumpetsvamp': { mork: '#8d8d99', ljus: '#55555F' },
  'karljohan': { mork: '#a97448', ljus: '#7C5330' },
  'blek-taggsvamp': { mork: '#e8dcc0', ljus: '#A08C5E' },
  'faarticka': { mork: '#d8cfae', ljus: '#96884F' },
  'blodriska': { mork: '#e08a3c', ljus: '#B4611A' },
  'sandsopp': { mork: '#c9a227', ljus: '#96751B' },
  'brunsopp': { mork: '#9a6f45', ljus: '#6F4E2E' },
  'annat': { mork: '#9aa0a6', ljus: '#6E747A' },
}

/** Artens ikonfärg mot appens vanliga ytor, i det tema som är påslaget. */
export function artfarg(id: SpeciesId, ljust = arLjustTema()): string {
  const par = IKONFARG[id] ?? IKONFARG['annat']
  return ljust ? par.ljus : par.mork
}

/**
 * Bläck för en silhuett som ligger *ovanpå* artens egen färg — fyndpricken i
 * listan och markören på kartan. Emojin var självlysande och brydde sig inte
 * om underlaget; en silhuett gör det. Artfärgerna spänner från nästan svart
 * (svart trumpetsvamp) till nästan vitt (blek taggsvamp), så bläcket måste
 * vända med underlagets ljushet i stället för att vara mörkt jämt.
 */
export function ikonblack(bakgrund: string): string {
  const h = bakgrund.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  if (!isFinite(n)) return '#191203'
  const kanal = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const L =
    0.2126 * kanal((n >> 16) & 255) + 0.7152 * kanal((n >> 8) & 255) + 0.0722 * kanal(n & 255)
  // Brytpunkten ligger där svart och vitt ger samma kontrast mot underlaget.
  return L > 0.18 ? '#191203' : '#f3efe4'
}

/** Silhuetten som färdig SVG-sträng, för Leaflets markörer. */
export function artSvgMarkup(id: SpeciesId, farg: string, size: number): string {
  const d = ART_VAG[id] ?? ART_VAG['annat']
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="${farg}" d="${d}"/></svg>`
}
