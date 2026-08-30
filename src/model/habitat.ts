/**
 * Habitatmodell: hur bra är just den här kvadratmetern skog för arten?
 *
 * Till skillnad från fruktsättningen ändrar sig habitatet knappt alls mellan
 * åren. Ett mycel som trivs i en sluttning trivs där även nästa säsong. Det är
 * därför den här poängen är värd mer än väderprognosen på lång sikt — den
 * pekar ut var du ska leta, medan vädret säger när.
 */

import type { Delpoang, HabitatProv, Marktyp, Species } from '../lib/types.ts'
import { klocka } from './fruktsattning.ts'

/** Övre tak för poängen beroende på marktyp. Terräng kan inte rädda en sjö. */
const TAK: Record<Marktyp, number> = {
  barrskog: 1.0,
  lovskog: 1.0,
  blandskog: 1.0,
  skog: 1.0,
  hygge: 0.4,
  busksnar: 0.45,
  myr: 0.35,
  ang: 0.25,
  aker: 0.06,
  vatten: 0.02,
  bebyggt: 0.05,
  // Ostaggad mark i svensk glesbygd är oftare skog än inte. Vi drar ned lite
  // för osäkerheten men dömer den inte ut.
  okant: 0.85,
}

/** Grundpoäng för marktypen, givet artens preferens för löv respektive barr. */
function marktypspoang(m: Marktyp, a: Species): number {
  const { needleleaved: barr, broadleaved: lov, mixed: bland } = a.lovtyp
  switch (m) {
    case 'barrskog': return barr
    case 'lovskog': return lov
    case 'blandskog': return bland
    // Otaggad skog: vi vet att det är skog men inte vilken sort.
    case 'skog': return (barr + lov + bland) / 3 * 0.95
    case 'okant': return (barr + lov + bland) / 3 * 0.72
    case 'busksnar': return 0.3
    case 'myr': return 0.22
    case 'hygge': return 0.2
    case 'ang': return 0.08
    case 'aker': return 0.02
    case 'bebyggt': return 0.03
    case 'vatten': return 0
  }
}

export type HabitatIndata = {
  prov: HabitatProv
  art: Species
  /** Aktuell marktemperatur — styr om norr- eller söderläge är bäst. */
  marktemp: number
  /** Stöd från GBIF-observationer, 0–1. */
  gbifStod: number
  /** Stöd från dina egna fynd, 0–1. Väger tyngre än allt annat. */
  egetStod: number
}

export type HabitatResultat = {
  poang: number
  delar: Delpoang[]
}

export function beraknaHabitat(i: HabitatIndata): HabitatResultat {
  const { prov, art } = i

  /* ---- Terrängpoäng: allt som varierar inom en och samma skog ----
     Den här delen är hela poängen med kartan. Att skilja skog från åker är
     lätt; det svåra — och det man faktiskt behöver när man står bland
     granarna — är att skilja den ena backen från den andra. Därför får bara
     de lägesberoende måtten vara med i medelvärdet, och de tillåts spänna
     över nästan hela skalan i stället för att klämmas ihop kring mitten. */

  const twiP = klocka(
    prov.twi,
    art.twiOpt - art.twiBredd * 2.2,
    art.twiOpt,
    art.twiOpt + art.twiBredd * 2.2,
  )

  const lutP = 0.25 + 0.75 * klocka(prov.lutning, -6, 7, 34)

  const varmeBehov = Math.max(0, Math.min(1, (art.marktemp.opt - i.marktemp) / 8))
  const onskad = 20 + varmeBehov * 160
  const NEUTRAL = 0.72
  let aspP = NEUTRAL
  let aspText = 'Platt mark — väderstrecket spelar ingen roll'
  if (prov.vaderstreck !== null) {
    const diff = ((prov.vaderstreck - onskad + 540) % 360) - 180
    const rent = 0.45 + 0.55 * ((1 + Math.cos((diff * Math.PI) / 180)) / 2)
    // I nästan plan mark pekar lutningen visserligen åt ett håll, men det
    // påverkar varken sol eller uttorkning nämnvärt. Vi blandar därför mot
    // neutralt ju flackare det är.
    const tyngd = Math.min(1, prov.lutning / 6)
    aspP = NEUTRAL + (rent - NEUTRAL) * tyngd
    aspText =
      tyngd < 0.4
        ? 'Så flackt att väderstrecket knappt spelar roll'
        : rent >= 0.8
          ? varmeBehov > 0.5
            ? 'Söderläge ger den värme marken behöver så här sent'
            : 'Norr- eller östläge håller kvar fukten längst'
          : varmeBehov > 0.5
            ? 'Skuggigt läge — marken värms långsamt'
            : 'Soligt läge — torkar ut fortare än omgivningen'
  }

  const dv = prov.tillVatten
  let vattenP = 0.4
  let vattenText = 'Inget vattendrag i närheten'
  if (dv !== null && isFinite(dv)) {
    if (dv < 8) {
      vattenP = 0.22
      vattenText = 'Nere i vattendraget — för blött'
    } else {
      vattenP = 0.28 + 0.72 * klocka(dv, 0, 60, 500)
      vattenText =
        dv < 160
          ? `${Math.round(dv)} m till vatten — dikeskanter och bäckstråk är klassiska lägen`
          : `${Math.round(dv)} m till närmaste vatten`
    }
  }

  const dk = prov.tillKant
  let kantP = 0.4
  let kantText = 'Långt från bryn och stigar'
  if (dk !== null && isFinite(dk)) {
    kantP = 0.3 + 0.7 * klocka(dk, -40, 45, 400)
    kantText =
      dk < 15
        ? 'Precis i kanten — ofta upptrampat och för ljust'
        : dk < 110
          ? `${Math.round(dk)} m från kant eller stig — bra ljusinsläpp, och lätt att ta sig till`
          : `${Math.round(dk)} m in i skogen`
  }

  let tradP = 0.55
  let tradText = 'Inga trädslag angivna i kartdatan'
  if (prov.tradslag.length > 0) {
    const traffar = prov.tradslag.filter((t) => art.vardar.includes(t))
    if (traffar.length > 0) {
      const bast = Math.min(...traffar.map((t) => art.vardar.indexOf(t)))
      tradP = 1 - bast * 0.08
      tradText = `Växer med ${traffar.join(', ')} — värdträd för ${art.namn.toLowerCase()}`
    } else {
      tradP = 0.15
      tradText = `Bara ${prov.tradslag.join(', ')} — inga värdträd för arten`
    }
  }

  const delar: Delpoang[] = [
    { namn: 'Markfuktighet', varde: twiP, vikt: 0.32, typ: 'vikt', motivering: beskrivTWI(prov.twi, art) },
    { namn: 'Bryn och stigar', varde: kantP, vikt: 0.16, typ: 'vikt', motivering: kantText },
    { namn: 'Lutning', varde: lutP, vikt: 0.15, typ: 'vikt',
      motivering:
        prov.lutning < 2.5
          ? `Nästan plant (${prov.lutning.toFixed(1)}°) — vattnet blir lätt stående`
          : prov.lutning > 25
            ? `Brant (${prov.lutning.toFixed(0)}°) — torrt och besvärligt att gå i`
            : `Lagom sluttning (${prov.lutning.toFixed(1)}°) — dränerat men fuktighållande` },
    { namn: 'Närhet till vatten', varde: vattenP, vikt: 0.14, typ: 'vikt', motivering: vattenText },
    { namn: 'Trädslag', varde: tradP, vikt: 0.14, typ: 'vikt', motivering: tradText },
    { namn: 'Väderstreck', varde: aspP, vikt: 0.09, typ: 'vikt', motivering: aspText },
  ]

  const viktSumma = delar.reduce((s, d) => s + d.vikt, 0)
  const terrang = delar.reduce((s, d) => s + d.varde * d.vikt, 0) / viktSumma

  /* ---- Faktorer: sådant som sätter takhöjden i stället för nyansen ---- */

  const mt = marktypspoang(prov.marktyp, art)
  // Rätt skogstyp lyfter, fel skogstyp sänker — men inte hela vägen till noll,
  // det sköter taket nedanför.
  const marktypFaktor = 0.35 + 0.65 * mt

  // Egna fynd är det starkaste beviset som finns och får lyfta en plats
  // rejält. GBIF-fynd är trubbigare och lyfter mindre.
  const evidens = Math.min(1.45, 1 + 0.42 * i.egetStod + 0.2 * i.gbifStod)

  let hojdFaktor = 1
  if (prov.hojd > 600) hojdFaktor = Math.max(0.15, 1 - (prov.hojd - 600) / 350)

  delar.push({
    namn: 'Marktyp',
    varde: mt,
    vikt: 0,
    typ: 'faktor',
    motivering: beskrivMarktyp(prov.marktyp, art, mt),
  })
  delar.push({
    namn: 'Kända fynd',
    varde: Math.min(1, (evidens - 1) / 0.45),
    vikt: 0,
    typ: 'faktor',
    motivering:
      i.egetStod > 0.25
        ? 'Du har egna fynd här — det starkaste beviset som finns'
        : i.gbifStod > 0.4
          ? 'Flera rapporterade fynd av arten i den här skogen'
          : i.gbifStod > 0.1
            ? 'Enstaka rapporterade fynd i trakten'
            : 'Inga rapporterade fynd i närheten — vilket inte betyder att det saknas svamp',
  })

  const poang = Math.max(
    0,
    Math.min(1, terrang * marktypFaktor * TAK[prov.marktyp] * hojdFaktor * evidens),
  )

  return { poang, delar }
}

function beskrivMarktyp(m: Marktyp, a: Species, p: number): string {
  const namn: Record<Marktyp, string> = {
    barrskog: 'Barrskog', lovskog: 'Lövskog', blandskog: 'Blandskog', skog: 'Skog utan angiven typ',
    hygge: 'Hygge', busksnar: 'Busksnår', myr: 'Myrmark', ang: 'Öppen gräsmark',
    aker: 'Åkermark', vatten: 'Vatten', bebyggt: 'Bebyggt område', okant: 'Otaggad mark',
  }
  const bas = namn[m]
  if (m === 'okant') return `${bas} — troligen skog, men kartdatan säger inget`
  if (p >= 0.9) return `${bas} — precis vad ${a.namn.toLowerCase()} vill ha`
  if (p >= 0.65) return `${bas} — fungerar bra för arten`
  if (p >= 0.35) return `${bas} — går att hitta i, men inte förstahandsvalet`
  return `${bas} — fel miljö för ${a.namn.toLowerCase()}`
}

function beskrivTWI(twi: number, a: Species): string {
  const d = twi - a.twiOpt
  if (Math.abs(d) < a.twiBredd * 0.6) return 'Fuktigt men dränerat — mitt i artens optimum'
  if (d < -a.twiBredd * 1.8) return 'Torr ås eller krön — vattnet rinner härifrån'
  if (d < 0) return 'Åt det torrare hållet'
  if (d > a.twiBredd * 1.8) return 'Svacka där vattnet samlas — troligen för blött'
  return 'Åt det blötare hållet'
}
