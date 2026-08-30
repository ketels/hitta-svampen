/** Artikoner. Ifyllda silhuetter, 24×24, ärver färg från texten.
 *
 * Till skillnad från Ikoner.tsx är de här ifyllda och inte streckade: en
 * 1,9-px-kontur försvinner vid 17 px, som är storleken de används i (chips,
 * fyndlistan, kartmarkören). Skillnaden mellan arterna sitter i silhuetten —
 * trattens djup och kantens vågighet, fotens tjocklek och hattens bredd. */

import type { SpeciesId } from '../lib/types.ts'

type P = {
  size?: number
  style?: React.CSSProperties
  className?: string
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

/** Kantarell */
export const IkonKantarell = (p: P) => <Svamp {...p} d="M3.2 7c2 1.2 3.2-.8 4.6-.1 1.4.7 2.3-.7 3.9 0 1.7.7 2.7 2.1 4.1 1.5 1.5-.6 2.6-.8 4.5 1.2l-6.3 6.8v2.7c0 1.2-.8 1.9-2 1.9s-2-.7-2-1.9v-3.1L3.2 7z" />

/** Trattkantarell */
export const IkonTrattkantarell = (p: P) => <Svamp {...p} d="M3.5 7.9c2 1 3.2-1 4.5-.3 1.3.7 2.2-1 3.8-.5 1.6.5 2.6 1.7 3.9 1 1.3-.7 2.4-1.4 4.5.1l-6.6 7.2v3.7c0 1.1-.6 1.7-1.6 1.7s-1.6-.6-1.6-1.7v-3.7L3.5 7.9z" />

/** Svart trumpetsvamp */
export const IkonSvartTrumpetsvamp = (p: P) => <Svamp {...p} d="M5.2 6.9c1.3.6 2.3-.5 3.5-.2 1.2.3 2.1.7 3.3.7s2.1-.4 3.3-.7c1.2-.3 2.2.8 3.5.2l-5.2 8.3v3.9c0 1.1-.6 1.7-1.6 1.7s-1.6-.6-1.6-1.7v-3.9L5.2 6.9z" />

/** Karl Johan */
export const IkonKarlJohan = (p: P) => <Svamp {...p} d="M4.4 11.6c0-4 3.4-6.6 7.6-6.6s7.6 2.6 7.6 6.6c0 1-.7 1.4-1.8 1.4h-3.2c.5 2 1.4 3.3 1.4 5 0 1.9-1.8 2.8-4 2.8s-4-.9-4-2.8c0-1.7.9-3 1.4-5H6.2c-1.1 0-1.8-.4-1.8-1.4z" />

/** Blek taggsvamp */
export const IkonBlekTaggsvamp = (p: P) => <Svamp {...p} d="M4.4 11.3c-.3-3.9 3.1-6.4 7.2-6.4 4.2 0 7.6 2.5 7.4 6.4-.1 1-.6 1.4-1.3 1.4-.6 0-.9-1.1-1.5-1.1s-.9 1.1-1.5 1.1c-.4 0-.7-.4-1-.8l.5 6.6c0 1-.8 1.6-2.2 1.6s-2.2-.6-2.2-1.6l.5-6.6c-.3.4-.6.8-1 .8-.6 0-.9-1.1-1.5-1.1s-.9 1.1-1.5 1.1c-.7 0-1.2-.4-1.3-1.4z" />

/** Fårticka */
export const IkonFarticka = (p: P) => <Svamp {...p} d="M3.2 13.4c0-3.2 2.6-5.7 5.8-5.7 1.6 0 2.4.9 3.4.9s1.6-.9 3.2-.6c2.9.5 4.2 2.9 4.2 5.4 0 1.2-1 1.5-2.3 1.5h-1.9c0 1.4.4 2.3.4 3.2 0 1-1.2 1.5-2.8 1.5s-2.8-.5-2.8-1.5c0-.9.4-1.8.4-3.2H5.5c-1.3 0-2.3-.3-2.3-1.5z" />

/** Blodriska */
export const IkonBlodriska = (p: P) => <Svamp {...p} d="M3.6 8.9c0 3.5 3.5 5.7 6.7 5.9l-.5 4.4c0 1 .8 1.5 2.2 1.5s2.2-.5 2.2-1.5l-.5-4.4c3.2-.2 6.7-2.4 6.7-5.9 0-.9-.6-1.3-1.5-1-2 .9-4.3 1.4-6.9 1.4s-4.9-.5-6.9-1.4c-.9-.3-1.5.1-1.5 1z" />

/** Sandsopp */
export const IkonSandsopp = (p: P) => <Svamp {...p} d="M3.5 12c0-3.5 3.8-5.8 8.5-5.8s8.5 2.3 8.5 5.8c0 .9-.6 1.3-1.7 1.3h-4.6l.5 5.8c0 1-.7 1.5-2.7 1.5s-2.7-.5-2.7-1.5l.5-5.8H5.2c-1.1 0-1.7-.4-1.7-1.3z" />

/** Brunsopp */
export const IkonBrunsopp = (p: P) => <Svamp {...p} d="M6.2 10c0-2.8 2.6-4.8 5.8-4.8s5.8 2 5.8 4.8c0 .9-.5 1.2-1.5 1.2h-2.7l.6 7.8c0 1-.7 1.5-2.2 1.5s-2.2-.5-2.2-1.5l.6-7.8H7.7c-1 0-1.5-.3-1.5-1.2z" />

/** Annan svamp */
export const IkonAnnanSvamp = (p: P) => <Svamp {...p} d="M4.8 12.4c0-4.1 3.2-7 7.2-7s7.2 2.9 7.2 7c0 1-.7 1.4-1.8 1.4h-3.6l.5 5.2c0 1-.7 1.6-2.3 1.6s-2.3-.6-2.3-1.6l.5-5.2H6.6c-1.1 0-1.8-.4-1.8-1.4z" />

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
