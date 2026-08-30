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
 * Färgramper för värmekartan — en per bakgrundstyp.
 *
 * Det här är inte kosmetik. Mätt mot OpenTopoMaps skogsgröna gav den gamla
 * gulskalan 1,1–1,2:1 i kontrast över *hela* registret, och dessutom inte
 * stigande: den starkaste cellen syntes lika lite som den svagaste, eftersom
 * ljust gult och ljust grönt har nästan samma ljushet. Lagret fanns där men
 * gick knappt att se.
 *
 * Mot en ljus karta måste färgen därför bli mörkare och mättare ju starkare
 * värdet är; mot satellitbildens mörka barrskog gäller tvärtom. Två ramper
 * i stället för en kompromiss som fungerar dåligt på båda.
 */
type Ramp = [number, RGB][]

/**
 * Ljus bakgrund: terrängkarta och OSM.
 *
 * Guldet är kvar — det är trots allt en kantarellapp — men mättat och en
 * aning djupare än kartans egen gröna. Det som gjorde det gamla lagret
 * osynligt var inte kulören utan opaciteten: vid 0,58 som mest lyste
 * terrängkartan rakt igenom. Nu går den till 0,88.
 */
const VARME_LJUS: Ramp = [
  [0.0, [92, 126, 140]],
  [0.3, [156, 142, 58]],
  [0.6, [208, 136, 16]],
  [0.85, [234, 162, 10]],
  [1.0, [246, 188, 16]],
]

/** Mörk bakgrund: satellitbild. Slutar i lysande guld. */
const VARME_MORK: Ramp = [
  [0.0, [72, 112, 126]],
  [0.28, [134, 150, 72]],
  [0.58, [214, 160, 28]],
  [0.8, [246, 192, 20]],
  [1.0, [255, 232, 130]],
]

function slaUppRamp(ramp: Ramp, v: number): RGB {
  const t = Math.max(0, Math.min(1, isFinite(v) ? v : 0))
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, fa] = ramp[i]!
    const [b, fb] = ramp[i + 1]!
    if (t <= b) {
      const k = b === a ? 0 : (t - a) / (b - a)
      return [
        Math.round(fa[0] + (fb[0] - fa[0]) * k),
        Math.round(fa[1] + (fb[1] - fa[1]) * k),
        Math.round(fa[2] + (fb[2] - fa[2]) * k),
      ]
    }
  }
  return ramp[ramp.length - 1]![1]
}

export function varmeRGB(v: number, morkBakgrund = false): RGB {
  return slaUppRamp(morkBakgrund ? VARME_MORK : VARME_LJUS, v)
}

/**
 * Opacitet för en cell. Betydligt kraftigare än tidigare — lagret ska gå att
 * se i motljus med solen i skärmen, och den som vill ha kartan ren har
 * "Dölj"-knappen.
 */
export function varmeAlfa(t: number): number {
  return 0.22 + 0.66 * Math.pow(Math.max(0, Math.min(1, t)), 0.85)
}

/** CSS-gradient för teckenförklaringen, så den matchar kartan. */
export function varmeGradient(morkBakgrund = false): string {
  const ramp = morkBakgrund ? VARME_MORK : VARME_LJUS
  return ramp.map(([p, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${(p * 100).toFixed(0)}%`).join(', ')
}
