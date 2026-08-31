/** Species icons. Filled silhouettes, 24×24, inheriting colour from the text.
 *
 * Unlike Icons.tsx these are filled and not stroked: a 1.9 px outline vanishes
 * at 17 px, which is the size they are used at (chips, the find list, the map
 * marker). The difference between species sits in the silhouette — the depth
 * of the funnel and the waviness of the edge, the thickness of the stem and
 * the width of the cap. */

import { isLightTheme } from '../lib/color.ts'
import type { SpeciesId } from '../lib/types.ts'

type P = {
  size?: number
  style?: React.CSSProperties
  className?: string
}

/**
 * The silhouettes as raw paths. The map markers are built as HTML strings for
 * Leaflet and cannot render a React component, so the paths must be reachable
 * without JSX. One source, two ways of drawing.
 */
export const SPECIES_PATH: Record<SpeciesId, string> = {
  /** Slanted, wavy funnel with a solid tapering stem. */
  'chanterelle':
    'M3.2 7c2 1.2 3.2-.8 4.6-.1 1.4.7 2.3-.7 3.9 0 1.7.7 2.7 2.1 4.1 1.5 1.5-.6 2.6-.8 4.5 1.2l-6.3 6.8v2.7c0 1.2-.8 1.9-2 1.9s-2-.7-2-1.9v-3.1L3.2 7z',
  /** Narrower funnel, wavy edge, thin hollow stem. */
  'funnel-chanterelle':
    'M3.5 7.9c2 1 3.2-1 4.5-.3 1.3.7 2.2-1 3.8-.5 1.6.5 2.6 1.7 3.9 1 1.3-.7 2.4-1.4 4.5.1l-6.6 7.2v3.7c0 1.1-.6 1.7-1.6 1.7s-1.6-.6-1.6-1.7v-3.7L3.5 7.9z',
  /** Narrow funnel, faintly wavy edge, no clear cap boundary. */
  'black-trumpet':
    'M5.2 6.9c1.3.6 2.3-.5 3.5-.2 1.2.3 2.1.7 3.3.7s2.1-.4 3.3-.7c1.2-.3 2.2.8 3.5.2l-5.2 8.3v3.9c0 1.1-.6 1.7-1.6 1.7s-1.6-.6-1.6-1.7v-3.9L5.2 6.9z',
  /** Broad cap, thick bulbous stem. */
  'porcini':
    'M4.4 11.6c0-4 3.4-6.6 7.6-6.6s7.6 2.6 7.6 6.6c0 1-.7 1.4-1.8 1.4h-3.2c.5 2 1.4 3.3 1.4 5 0 1.9-1.8 2.8-4 2.8s-4-.9-4-2.8c0-1.7.9-3 1.4-5H6.2c-1.1 0-1.8-.4-1.8-1.4z',
  /** Bumpy cap vault with spines along the lower edge. */
  'hedgehog':
    'M4.4 11.3c-.3-3.9 3.1-6.4 7.2-6.4 4.2 0 7.6 2.5 7.4 6.4-.1 1-.6 1.4-1.3 1.4-.6 0-.9-1.1-1.5-1.1s-.9 1.1-1.5 1.1c-.4 0-.7-.4-1-.8l.5 6.6c0 1-.8 1.6-2.2 1.6s-2.2-.6-2.2-1.6l.5-6.6c-.3.4-.6.8-1 .8-.6 0-.9-1.1-1.5-1.1s-.9 1.1-1.5 1.1c-.7 0-1.2-.4-1.3-1.4z',
  /** Low, two-lobed bracket, almost no stem. */
  'sheep-polypore':
    'M3.2 13.4c0-3.2 2.6-5.7 5.8-5.7 1.6 0 2.4.9 3.4.9s1.6-.9 3.2-.6c2.9.5 4.2 2.9 4.2 5.4 0 1.2-1 1.5-2.3 1.5h-1.9c0 1.4.4 2.3.4 3.2 0 1-1.2 1.5-2.8 1.5s-2.8-.5-2.8-1.5c0-.9.4-1.8.4-3.2H5.5c-1.3 0-2.3-.3-2.3-1.5z',
  /** Bowl-shaped, depressed cap. */
  'saffron-milkcap':
    'M3.6 8.9c0 3.5 3.5 5.7 6.7 5.9l-.5 4.4c0 1 .8 1.5 2.2 1.5s2.2-.5 2.2-1.5l-.5-4.4c3.2-.2 6.7-2.4 6.7-5.9 0-.9-.6-1.3-1.5-1-2 .9-4.3 1.4-6.9 1.4s-4.9-.5-6.9-1.4c-.9-.3-1.5.1-1.5 1z',
  /** Broadest and flattest cap, straight narrow stem. */
  'velvet-bolete':
    'M3.5 12c0-3.5 3.8-5.8 8.5-5.8s8.5 2.3 8.5 5.8c0 .9-.6 1.3-1.7 1.3h-4.6l.5 5.8c0 1-.7 1.5-2.7 1.5s-2.7-.5-2.7-1.5l.5-5.8H5.2c-1.1 0-1.7-.4-1.7-1.3z',
  /** Small cap, tall narrow stem. */
  'bay-bolete':
    'M6.2 10c0-2.8 2.6-4.8 5.8-4.8s5.8 2 5.8 4.8c0 .9-.5 1.2-1.5 1.2h-2.7l.6 7.8c0 1-.7 1.5-2.2 1.5s-2.2-.5-2.2-1.5l.6-7.8H7.7c-1 0-1.5-.3-1.5-1.2z',
  /** Generic cap and stem. */
  'other':
    'M4.8 12.4c0-4.1 3.2-7 7.2-7s7.2 2.9 7.2 7c0 1-.7 1.4-1.8 1.4h-3.6l.5 5.2c0 1-.7 1.6-2.3 1.6s-2.3-.6-2.3-1.6l.5-5.2H6.6c-1.1 0-1.8-.4-1.8-1.4z',
}

function Mushroom({ size = 24, style, className, d }: P & { d: string }) {
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

export const IconChanterelle = (p: P) => <Mushroom {...p} d={SPECIES_PATH['chanterelle']} />
export const IconFunnelChanterelle = (p: P) => <Mushroom {...p} d={SPECIES_PATH['funnel-chanterelle']} />
export const IconBlackTrumpet = (p: P) => <Mushroom {...p} d={SPECIES_PATH['black-trumpet']} />
export const IconPorcini = (p: P) => <Mushroom {...p} d={SPECIES_PATH['porcini']} />
export const IconHedgehog = (p: P) => <Mushroom {...p} d={SPECIES_PATH['hedgehog']} />
export const IconSheepPolypore = (p: P) => <Mushroom {...p} d={SPECIES_PATH['sheep-polypore']} />
export const IconSaffronMilkcap = (p: P) => <Mushroom {...p} d={SPECIES_PATH['saffron-milkcap']} />
export const IconVelvetBolete = (p: P) => <Mushroom {...p} d={SPECIES_PATH['velvet-bolete']} />
export const IconBayBolete = (p: P) => <Mushroom {...p} d={SPECIES_PATH['bay-bolete']} />
export const IconOtherMushroom = (p: P) => <Mushroom {...p} d={SPECIES_PATH['other']} />

/** Look up the icon for a species. Fall back on the generic one. */
export const SPECIES_ICON: Record<SpeciesId, (p: P) => React.ReactElement> = {
  'chanterelle': IconChanterelle,
  'funnel-chanterelle': IconFunnelChanterelle,
  'black-trumpet': IconBlackTrumpet,
  'porcini': IconPorcini,
  'hedgehog': IconHedgehog,
  'sheep-polypore': IconSheepPolypore,
  'saffron-milkcap': IconSaffronMilkcap,
  'velvet-bolete': IconVelvetBolete,
  'bay-bolete': IconBayBolete,
  'other': IconOtherMushroom,
}

export function speciesIcon(id: SpeciesId) {
  return SPECIES_ICON[id] ?? IconOtherMushroom
}

/**
 * Species colours adjusted to work as a filled area.
 *
 * Species.color in species.ts was chosen for the dot it used to be; as a fill
 * it does not hold contrast. Black trumpet #4a4a52 gives 1.4:1 against
 * --surface. Here sit both a lightened variant for dark mode and a darkened
 * one for light.
 */
export const ICON_COLOR: Record<SpeciesId, { dark: string; light: string }> = {
  'chanterelle': { dark: '#f2b705', light: '#B98A04' },
  'funnel-chanterelle': { dark: '#c98a3c', light: '#A0682A' },
  'black-trumpet': { dark: '#8d8d99', light: '#55555F' },
  'porcini': { dark: '#a97448', light: '#7C5330' },
  'hedgehog': { dark: '#e8dcc0', light: '#A08C5E' },
  'sheep-polypore': { dark: '#d8cfae', light: '#96884F' },
  'saffron-milkcap': { dark: '#e08a3c', light: '#B4611A' },
  'velvet-bolete': { dark: '#c9a227', light: '#96751B' },
  'bay-bolete': { dark: '#9a6f45', light: '#6F4E2E' },
  'other': { dark: '#9aa0a6', light: '#6E747A' },
}

/** The species' icon colour against the app's ordinary surfaces, in the theme
 *  that is currently on. */
export function speciesColor(id: SpeciesId, light = isLightTheme()): string {
  const pair = ICON_COLOR[id] ?? ICON_COLOR['other']
  return light ? pair.light : pair.dark
}

/**
 * Ink for a silhouette that sits *on top of* the species' own colour — the
 * find dot in the list and the marker on the map. The emoji was
 * self-luminous and did not care about its background; a silhouette does. The
 * species colours span from nearly black (black trumpet) to nearly white
 * (hedgehog), so the ink has to flip with the background's lightness instead
 * of being dark throughout.
 */
export function iconInk(background: string): string {
  const h = background.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  if (!isFinite(n)) return '#191203'
  const channel = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const L =
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  // The break point is where black and white give the same contrast against
  // the background.
  return L > 0.18 ? '#191203' : '#f3efe4'
}

/** The silhouette as a finished SVG string, for Leaflet's markers. */
export function speciesSvgMarkup(id: SpeciesId, color: string, size: number): string {
  const d = SPECIES_PATH[id] ?? SPECIES_PATH['other']
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="${color}" d="${d}"/></svg>`
}
