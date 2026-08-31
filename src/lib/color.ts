/** Colour scales for chance, score and the heatmap. */

type RGB = [number, number, number]

/**
 * From cold blue-grey (hopeless) to chanterelle gold (go outside, now).
 *
 * The scale saturates earlier than a straight 0–100 scale would, because a
 * chance above seventy per cent never happens in practice: habitat times
 * fruiting times season lands around eighty in the very best conditions. A
 * value of 65 is therefore excellent and should look like gold, not grass.
 */
const SCALE: [number, RGB][] = [
  [0.0, [30, 46, 62]],
  [0.15, [42, 84, 82]],
  [0.32, [58, 122, 74]],
  [0.48, [113, 156, 48]],
  [0.62, [196, 154, 16]],
  [0.75, [242, 183, 5]],
  [1.0, [255, 216, 87]],
]

/**
 * The same scale against a white background.
 *
 * The scale carries text as often as it carries fill — the percentage in the
 * gauge, the numbers in the species rows, "· bra" in the map panel — and the
 * text requirement is the harder of the two. The whole mid-range is therefore
 * darkened rather than mirroring the dark scale directly: grass green and
 * chanterelle gold that read beautifully against forest black are illegible
 * against white. The dark blue-greens at the bottom are already dark enough
 * and barely change.
 */
const SCALE_LIGHT: [number, RGB][] = [
  [0.0, [26, 40, 55]],
  [0.15, [36, 74, 74]],
  [0.32, [42, 106, 80]],
  [0.48, [90, 122, 32]],
  [0.62, [147, 113, 8]],
  [0.75, [175, 126, 4]],
  [1.0, [190, 140, 12]],
]

/*
 * Which mode the scales should answer in. The theme is a property of the
 * document, not of any individual caller, and passing it as an argument at
 * each of the twenty-odd places that ask for a chance colour would make it a
 * parameter to forget rather than a setting. The flag is set once by
 * `applyTheme` and can always be overridden per call.
 */
let lightTheme = false

export function setColorTheme(light: boolean): void {
  lightTheme = light
}

export function isLightTheme(): boolean {
  return lightTheme
}

export function chanceColor(v: number, light = lightTheme): string {
  const [r, g, b] = chanceRGB(v, light)
  return `rgb(${r} ${g} ${b})`
}

export function chanceRGB(v: number, light = lightTheme): RGB {
  const scale = light ? SCALE_LIGHT : SCALE
  const t = Math.max(0, Math.min(1, isFinite(v) ? v : 0))
  for (let i = 0; i < scale.length - 1; i++) {
    const [a, ca] = scale[i]!
    const [b, cb] = scale[i + 1]!
    if (t <= b) {
      const k = b === a ? 0 : (t - a) / (b - a)
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * k),
        Math.round(ca[1] + (cb[1] - ca[1]) * k),
        Math.round(ca[2] + (cb[2] - ca[2]) * k),
      ]
    }
  }
  return scale[scale.length - 1]![1]
}

/** A word for a chance in per cent — what you actually read before heading out. */
export function chanceWord(percent: number): string {
  if (percent >= 68) return 'Utmärkt'
  if (percent >= 52) return 'Mycket bra'
  if (percent >= 38) return 'Bra'
  if (percent >= 25) return 'Hyfsat'
  if (percent >= 13) return 'Magert'
  if (percent >= 5) return 'Dåligt'
  return 'Hopplöst'
}

/** The short piece of advice that follows the number. */
export function chanceAdvice(percent: number): string {
  if (percent >= 68) return 'Släpp allt och ta korgen'
  if (percent >= 52) return 'Väl värt en tur'
  if (percent >= 38) return 'Goda odds om du vet var du ska leta'
  if (percent >= 25) return 'Gå till dina bästa ställen'
  if (percent >= 13) return 'Räkna med att få leta länge'
  if (percent >= 5) return 'Ta en promenad, men ha inga förväntningar'
  return 'Spara benen till en bättre dag'
}

/**
 * Colour ramps for the heatmap — one per background type.
 *
 * This is not cosmetics. Measured against OpenTopoMap's forest green, the old
 * yellow scale gave 1.1–1.2:1 contrast across the *whole* range, and was not
 * even monotonic: the strongest cell was as invisible as the weakest, since
 * light yellow and light green have nearly the same lightness. The layer was
 * there but could barely be seen.
 *
 * Against a light map the colour must therefore grow darker and more saturated
 * as the value rises; against the satellite image's dark conifers the opposite
 * holds. Two ramps instead of one compromise that works badly on both.
 */
type Ramp = [number, RGB][]

/**
 * Light background: terrain map and OSM.
 *
 * The gold stays — it is a chanterelle app after all — but saturated and a
 * touch deeper than the map's own green. What made the old layer invisible was
 * not the hue but the opacity: at 0.58 at most, the terrain map shone straight
 * through. It now goes to 0.88.
 */
const HEAT_LIGHT: Ramp = [
  [0.0, [92, 126, 140]],
  [0.3, [156, 142, 58]],
  [0.6, [208, 136, 16]],
  [0.85, [234, 162, 10]],
  [1.0, [246, 188, 16]],
]

/** Dark background: satellite imagery. Ends in luminous gold. */
const HEAT_DARK: Ramp = [
  [0.0, [72, 112, 126]],
  [0.28, [134, 150, 72]],
  [0.58, [214, 160, 28]],
  [0.8, [246, 192, 20]],
  [1.0, [255, 232, 130]],
]

function sampleRamp(ramp: Ramp, v: number): RGB {
  const t = Math.max(0, Math.min(1, isFinite(v) ? v : 0))
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, ca] = ramp[i]!
    const [b, cb] = ramp[i + 1]!
    if (t <= b) {
      const k = b === a ? 0 : (t - a) / (b - a)
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * k),
        Math.round(ca[1] + (cb[1] - ca[1]) * k),
        Math.round(ca[2] + (cb[2] - ca[2]) * k),
      ]
    }
  }
  return ramp[ramp.length - 1]![1]
}

export function heatRGB(v: number, darkBackground = false): RGB {
  return sampleRamp(darkBackground ? HEAT_DARK : HEAT_LIGHT, v)
}

/**
 * Opacity for a cell. Considerably stronger than before — the layer must be
 * visible in glare with the sun on the screen, and anyone who wants a clean
 * map has the "Dölj" button.
 */
export function heatAlpha(t: number): number {
  return 0.22 + 0.66 * Math.pow(Math.max(0, Math.min(1, t)), 0.85)
}

/** CSS gradient for the legend, so it matches the map. */
export function heatGradient(darkBackground = false): string {
  const ramp = darkBackground ? HEAT_DARK : HEAT_LIGHT
  return ramp.map(([p, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${(p * 100).toFixed(0)}%`).join(', ')
}
