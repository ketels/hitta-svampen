/** Färgskalor för chans, poäng och värmekarta. */

type RGB = [number, number, number]

/**
 * Från kall blågrå (hopplöst) till kantarellgul (nu går du ut).
 *
 * Skalan mättar tidigare än en rak 0–100-skala skulle göra, därför att en
 * chans över sjuttio procent i praktiken aldrig inträffar: habitat gånger
 * fruktsättning gånger säsong hamnar i de allra bästa lägena kring åttio.
 * Ett värde på 65 är alltså strålande och ska se ut som guld, inte som gräs.
 */
const SKALA: [number, RGB][] = [
  [0.0, [30, 46, 62]],
  [0.15, [42, 84, 82]],
  [0.32, [58, 122, 74]],
  [0.48, [113, 156, 48]],
  [0.62, [196, 154, 16]],
  [0.75, [242, 183, 5]],
  [1.0, [255, 216, 87]],
]

export function chansfarg(v: number): string {
  const [r, g, b] = chansRGB(v)
  return `rgb(${r} ${g} ${b})`
}

export function chansRGB(v: number): RGB {
  const t = Math.max(0, Math.min(1, isFinite(v) ? v : 0))
  for (let i = 0; i < SKALA.length - 1; i++) {
    const [a, fa] = SKALA[i]!
    const [b, fb] = SKALA[i + 1]!
    if (t <= b) {
      const k = b === a ? 0 : (t - a) / (b - a)
      return [
        Math.round(fa[0] + (fb[0] - fa[0]) * k),
        Math.round(fa[1] + (fb[1] - fa[1]) * k),
        Math.round(fa[2] + (fb[2] - fa[2]) * k),
      ]
    }
  }
  return SKALA[SKALA.length - 1]![1]
}

/** Ord för en chans i procent — det man faktiskt läser innan man går ut. */
export function chansOrd(procent: number): string {
  if (procent >= 68) return 'Utmärkt'
  if (procent >= 52) return 'Mycket bra'
  if (procent >= 38) return 'Bra'
  if (procent >= 25) return 'Hyfsat'
  if (procent >= 13) return 'Magert'
  if (procent >= 5) return 'Dåligt'
  return 'Hopplöst'
}

/** Kort råd som följer på siffran. */
export function chansRad(procent: number): string {
  if (procent >= 68) return 'Släpp allt och ta korgen'
  if (procent >= 52) return 'Väl värt en tur'
  if (procent >= 38) return 'Goda odds om du vet var du ska leta'
  if (procent >= 25) return 'Gå till dina bästa ställen'
  if (procent >= 13) return 'Räkna med att få leta länge'
  if (procent >= 5) return 'Ta en promenad, men ha inga förväntningar'
  return 'Spara benen till en bättre dag'
}

/**
 * Färgramp för värmekartan.
 *
 * Skiljer sig från `chansfarg` med flit. Kartan under är grön och ljus, så
 * gröna toner försvinner i den — här går skalan i stället från dov teal genom
 * bärnsten till glödande guld, som syns mot både terrängkarta och satellitbild.
 */
const VARME: [number, RGB][] = [
  [0.0, [56, 104, 116]],
  [0.3, [126, 142, 78]],
  [0.55, [206, 148, 30]],
  [0.78, [244, 184, 10]],
  [1.0, [255, 236, 152]],
]

export function varmeRGB(v: number): RGB {
  const t = Math.max(0, Math.min(1, isFinite(v) ? v : 0))
  for (let i = 0; i < VARME.length - 1; i++) {
    const [a, fa] = VARME[i]!
    const [b, fb] = VARME[i + 1]!
    if (t <= b) {
      const k = b === a ? 0 : (t - a) / (b - a)
      return [
        Math.round(fa[0] + (fb[0] - fa[0]) * k),
        Math.round(fa[1] + (fb[1] - fa[1]) * k),
        Math.round(fa[2] + (fb[2] - fa[2]) * k),
      ]
    }
  }
  return VARME[VARME.length - 1]![1]
}
