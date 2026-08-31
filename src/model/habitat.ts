/**
 * Habitat model: how good is this particular square metre of forest for the
 * species?
 *
 * Unlike fruiting, the habitat barely changes between years. A mycelium that
 * thrives on a slope thrives there next season too. That is why this score is
 * worth more than the weather forecast in the long run — it points out where
 * to look, while the weather says when.
 */

import type { HabitatSample, LandType, ScorePart, Species } from '../lib/types.ts'
import { bell } from './fruiting.ts'

/** Upper ceiling for the score by land type. Terrain cannot rescue a lake. */
const CEILING: Record<LandType, number> = {
  coniferous: 1.0,
  deciduous: 1.0,
  mixed: 1.0,
  forest: 1.0,
  clearcut: 0.4,
  scrub: 0.45,
  bog: 0.35,
  meadow: 0.25,
  farmland: 0.06,
  water: 0.02,
  built: 0.05,
  // Untagged ground in rural Sweden is more often forest than not. We knock a
  // little off for the uncertainty but do not write it off.
  unknown: 0.85,
}

/** Base score for the land type, given the species' leaf-type preference. */
function landTypeScore(m: LandType, sp: Species): number {
  const { needleleaved, broadleaved, mixed } = sp.leafType
  switch (m) {
    case 'coniferous': return needleleaved
    case 'deciduous': return broadleaved
    case 'mixed': return mixed
    // Untagged forest: we know it is forest but not which kind.
    case 'forest': return ((needleleaved + broadleaved + mixed) / 3) * 0.95
    case 'unknown': return ((needleleaved + broadleaved + mixed) / 3) * 0.72
    case 'scrub': return 0.3
    case 'bog': return 0.22
    case 'clearcut': return 0.2
    case 'meadow': return 0.08
    case 'farmland': return 0.02
    case 'built': return 0.03
    case 'water': return 0
  }
}

export type HabitatInput = {
  sample: HabitatSample
  species: Species
  /** Current soil temperature — decides whether a north or south aspect is best. */
  soilTemp: number
  /** Support from GBIF observations, 0–1. */
  gbifSupport: number
  /** Support from your own finds, 0–1. Weighs more than anything else. */
  ownSupport: number
}

export type HabitatResult = {
  score: number
  parts: ScorePart[]
}

export function computeHabitat(input: HabitatInput): HabitatResult {
  const { sample, species: sp } = input

  /* ---- Terrain score: everything that varies within one and the same forest ----
     This part is the whole point of the map. Telling forest from farmland is
     easy; the hard part — and what you actually need when standing among the
     spruces — is telling one hillside from another. Only the position-dependent
     measures are therefore included in the mean, and they are allowed to span
     nearly the whole scale rather than being squeezed around the middle. */

  const twiScore = bell(
    sample.twi,
    sp.twiOpt - sp.twiWidth * 2.2,
    sp.twiOpt,
    sp.twiOpt + sp.twiWidth * 2.2,
  )

  const slopeScore = 0.25 + 0.75 * bell(sample.slope, -6, 7, 34)

  const warmthNeed = Math.max(0, Math.min(1, (sp.soilTemp.opt - input.soilTemp) / 8))
  const desiredAspect = 20 + warmthNeed * 160
  const NEUTRAL = 0.72
  let aspectScore = NEUTRAL
  let aspectText = 'Platt mark — väderstrecket spelar ingen roll'
  if (sample.aspect !== null) {
    const diff = ((sample.aspect - desiredAspect + 540) % 360) - 180
    const pure = 0.45 + 0.55 * ((1 + Math.cos((diff * Math.PI) / 180)) / 2)
    // On nearly level ground the slope does point somewhere, but it affects
    // neither sun nor drying appreciably. We therefore blend towards neutral
    // the flatter it gets.
    const weight = Math.min(1, sample.slope / 6)
    aspectScore = NEUTRAL + (pure - NEUTRAL) * weight
    aspectText =
      weight < 0.4
        ? 'Så flackt att väderstrecket knappt spelar roll'
        : pure >= 0.8
          ? warmthNeed > 0.5
            ? 'Söderläge ger den värme marken behöver så här sent'
            : 'Norr- eller östläge håller kvar fukten längst'
          : warmthNeed > 0.5
            ? 'Skuggigt läge — marken värms långsamt'
            : 'Soligt läge — torkar ut fortare än omgivningen'
  }

  const dw = sample.toWater
  let waterScore = 0.4
  let waterText = 'Inget vattendrag i närheten'
  if (dw !== null && isFinite(dw)) {
    if (dw < 8) {
      waterScore = 0.22
      waterText = 'Nere i vattendraget — för blött'
    } else {
      waterScore = 0.28 + 0.72 * bell(dw, 0, 60, 500)
      waterText =
        dw < 160
          ? `${Math.round(dw)} m till vatten — dikeskanter och bäckstråk är klassiska lägen`
          : `${Math.round(dw)} m till närmaste vatten`
    }
  }

  const de = sample.toEdge
  let edgeScore = 0.4
  let edgeText = 'Långt från bryn och stigar'
  if (de !== null && isFinite(de)) {
    edgeScore = 0.3 + 0.7 * bell(de, -40, 45, 400)
    edgeText =
      de < 15
        ? 'Precis i kanten — ofta upptrampat och för ljust'
        : de < 110
          ? `${Math.round(de)} m från kant eller stig — bra ljusinsläpp, och lätt att ta sig till`
          : `${Math.round(de)} m in i skogen`
  }

  let treeScore = 0.55
  let treeText = 'Inga trädslag angivna i kartdatan'
  if (sample.treeSpecies.length > 0) {
    const hits = sample.treeSpecies.filter((t) => sp.hosts.includes(t))
    if (hits.length > 0) {
      const best = Math.min(...hits.map((t) => sp.hosts.indexOf(t)))
      treeScore = 1 - best * 0.08
      treeText = `Växer med ${hits.map(hostName).join(', ')} — värdträd för ${sp.name.toLowerCase()}`
    } else {
      treeScore = 0.15
      treeText = `Bara ${sample.treeSpecies.map(hostName).join(', ')} — inga värdträd för arten`
    }
  }

  const parts: ScorePart[] = [
    { name: 'Markfuktighet', value: twiScore, weight: 0.32, kind: 'weight', reason: describeTWI(sample.twi, sp) },
    { name: 'Bryn och stigar', value: edgeScore, weight: 0.16, kind: 'weight', reason: edgeText },
    { name: 'Lutning', value: slopeScore, weight: 0.15, kind: 'weight',
      reason:
        sample.slope < 2.5
          ? `Nästan plant (${sample.slope.toFixed(1)}°) — vattnet blir lätt stående`
          : sample.slope > 25
            ? `Brant (${sample.slope.toFixed(0)}°) — torrt och besvärligt att gå i`
            : `Lagom sluttning (${sample.slope.toFixed(1)}°) — dränerat men fuktighållande` },
    { name: 'Närhet till vatten', value: waterScore, weight: 0.14, kind: 'weight', reason: waterText },
    { name: 'Trädslag', value: treeScore, weight: 0.14, kind: 'weight', reason: treeText },
    { name: 'Väderstreck', value: aspectScore, weight: 0.09, kind: 'weight', reason: aspectText },
  ]

  const weightSum = parts.reduce((s, p) => s + p.weight, 0)
  const terrain = parts.reduce((s, p) => s + p.value * p.weight, 0) / weightSum

  /* ---- Factors: things that set the ceiling rather than the nuance ---- */

  const lt = landTypeScore(sample.landType, sp)
  // The right forest type lifts, the wrong one lowers — but not all the way to
  // zero, that is what the ceiling below is for.
  const landTypeFactor = 0.35 + 0.65 * lt

  // Your own finds are the strongest evidence there is and may lift a place
  // considerably. GBIF records are blunter and lift less.
  const evidence = Math.min(1.45, 1 + 0.42 * input.ownSupport + 0.2 * input.gbifSupport)

  let elevationFactor = 1
  if (sample.elevation > 600) elevationFactor = Math.max(0.15, 1 - (sample.elevation - 600) / 350)

  parts.push({
    name: 'Marktyp',
    value: lt,
    weight: 0,
    kind: 'factor',
    reason: describeLandType(sample.landType, sp, lt),
  })
  parts.push({
    name: 'Kända fynd',
    value: Math.min(1, (evidence - 1) / 0.45),
    weight: 0,
    kind: 'factor',
    reason:
      input.ownSupport > 0.25
        ? 'Du har egna fynd här — det starkaste beviset som finns'
        : input.gbifSupport > 0.4
          ? 'Flera rapporterade fynd av arten i den här skogen'
          : input.gbifSupport > 0.1
            ? 'Enstaka rapporterade fynd i trakten'
            : 'Inga rapporterade fynd i närheten — vilket inte betyder att det saknas svamp',
  })

  const score = Math.max(
    0,
    Math.min(1, terrain * landTypeFactor * CEILING[sample.landType] * elevationFactor * evidence),
  )

  return { score, parts }
}

/** Swedish names for the host trees, for display. */
const HOST_NAME: Record<string, string> = {
  spruce: 'gran',
  pine: 'tall',
  birch: 'björk',
  oak: 'ek',
  beech: 'bok',
  hazel: 'hassel',
  aspen: 'asp',
}

export const hostName = (h: string) => HOST_NAME[h] ?? h

function describeLandType(m: LandType, sp: Species, score: number): string {
  const name: Record<LandType, string> = {
    coniferous: 'Barrskog', deciduous: 'Lövskog', mixed: 'Blandskog', forest: 'Skog utan angiven typ',
    clearcut: 'Hygge', scrub: 'Busksnår', bog: 'Myrmark', meadow: 'Öppen gräsmark',
    farmland: 'Åkermark', water: 'Vatten', built: 'Bebyggt område', unknown: 'Otaggad mark',
  }
  const base = name[m]
  if (m === 'unknown') return `${base} — troligen skog, men kartdatan säger inget`
  if (score >= 0.9) return `${base} — precis vad ${sp.name.toLowerCase()} vill ha`
  if (score >= 0.65) return `${base} — fungerar bra för arten`
  if (score >= 0.35) return `${base} — går att hitta i, men inte förstahandsvalet`
  return `${base} — fel miljö för ${sp.name.toLowerCase()}`
}

function describeTWI(twi: number, sp: Species): string {
  const d = twi - sp.twiOpt
  if (Math.abs(d) < sp.twiWidth * 0.6) return 'Fuktigt men dränerat — mitt i artens optimum'
  if (d < -sp.twiWidth * 1.8) return 'Torr ås eller krön — vattnet rinner härifrån'
  if (d < 0) return 'Åt det torrare hållet'
  if (d > sp.twiWidth * 1.8) return 'Svacka där vattnet samlas — troligen för blött'
  return 'Åt det blötare hållet'
}
