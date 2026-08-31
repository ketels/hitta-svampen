/**
 * Fruktsättningsmodell: från väderhistorik till "kommer det stå svamp i skogen?"
 *
 * Grundtanken är att ny fruktsättning drivs av ett fuktigt tidsfönster ett par
 * veckor tillbaka: nederbörden viktas med en fördröjningskärna per art
 * (kantarellen har tyngdpunkt kring sexton dagar) och kombineras med markfukt
 * på mycelets djup. Ovanpå det ligger en snabb kanal — ytfukten på 3–9 cm —
 * som avgör hur väl fruktkroppar under utveckling mår just nu: färskt regn
 * ger omedelbar men begränsad effekt, och kan aldrig trolla fram svamp ur
 * torka. Marktemperaturen modulerar takten, och allt stängs av när säsongen
 * är slut eller frosten kommit.
 */

import type { Species, VaderDag } from '../lib/types.ts'

/** Mjuk klockkurva som är 1 vid `opt` och 0 utanför [min, max]. */
export function klocka(v: number, min: number, opt: number, max: number): number {
  if (!isFinite(v)) return 0
  if (v <= min || v >= max) return 0
  const x = v < opt ? (v - min) / (opt - min) : (max - v) / (max - opt)
  return x * x * (3 - 2 * x)
}

/** Mättande kurva: 0 vid 0, ~0.63 vid `skala`, närmar sig 1. */
const mattnad = (v: number, skala: number) => 1 - Math.exp(-Math.max(0, v) / skala)

/**
 * Fördröjningskärnans vikt för regn som föll `alder` dygn före måldatumet.
 * Skev klocka med toppen på artens `topp`: bredare framsida så att regn
 * 4–10 dygn bakåt väger tungt, snävare baksida så att svansen bortom
 * ~25 dygn klingar av snabbt. Asymmetrin är en modellkonstant — vi har
 * ingen artvis evidens för olika skevhet. Regndiagrammet ritar sin gula
 * gradient med samma funktion, så bilden visar exakt det modellen räknar på.
 */
export function kernvikt(alder: number, fordrojning: { topp: number; bredd: number }): number {
  const sigma = alder < fordrojning.topp ? fordrojning.bredd * 1.15 : fordrojning.bredd * 0.65
  return Math.exp(-0.5 * ((alder - fordrojning.topp) / sigma) ** 2)
}

/** Bortom den här åldern är kärnvikten försumbar (< ~1 %). */
export function kernMaxAlder(fordrojning: { topp: number; bredd: number }): number {
  return Math.ceil(fordrojning.topp + 3 * 0.65 * fordrojning.bredd)
}

/** Kroninterception: så här många mm av varje regndygn når aldrig marken
    (fastnar i trädkronorna och avdunstar). Avdraget gör drivningen
    händelsekänslig — ett rejält regn står kvar nästan orört medan en månad
    duggregn nästan försvinner — utan att kräva artparametrar. */
const REGNAVDRAG = 1.0

/** Regndrivningens mättnadsskala (viktat mm/dygn, efter interception).
    Sänkt från 2.3 — kalibrerad GEMENSAMT med REGNAVDRAG mot sex svenska
    platser (31 dygn vardera, n=186) så att indexets aggregatmedian ligger
    neutralt (+0.003) mot modellen före den skeva kärnan. Enskilt kalibrerade
    jagar konstanterna varandras svans. */
const REGNSKALA = 1.8

export type Fruktsattning = {
  /** Slutligt index 0–1. */
  index: number
  /** Sammanvägd vattentillgång — den hårdaste begränsningen. Kan nå ~1.15
      när blöt yta lyfter över initieringens tak; indexet clampas till 1. */
  vatten: number
  /** Vilken faktor som håller tillbaka fruktsättningen just nu. */
  begransning: 'vatten' | 'temperatur' | 'frost' | 'torka' | 'inget'
  regnDriv: number
  markfukt: number
  /** Ytfuktens poäng 0–1 — den snabba kanalen som modulerar nuläget. */
  ytfukt: number
  marktemp: number
  frostfaktor: number
  torkfaktor: number
  /** Viktad nederbörd enligt artens fördröjningskärna, mm/dygn,
      efter kroninterceptionsavdraget. Det är den här siffran som driver. */
  regnIFonster: number
  regn7: number
  regn14: number
  regn30: number
  medelMarkfukt: number
  /** Rå ytfukt 3–9 cm (m³/m³), medel över de två senaste dygnen. */
  medelYtfukt: number
  medelMarktemp: number
  /** Dagar sedan senaste dygn med minst 5 mm. */
  dagarSedanRegn: number | null
  forklaring: string[]
}

/**
 * Räknar ut fruktsättningsindex för ett givet datum, givet en sammanhängande
 * serie väderdygn (historik + prognos) sorterad i tidsordning.
 */
export function beraknaFruktsattning(
  serie: VaderDag[],
  artData: Species,
  malDatum: string,
): Fruktsattning {
  const malIdx = serie.findIndex((d) => d.datum === malDatum)
  const i = malIdx >= 0 ? malIdx : serie.length - 1
  const tom = i + 1 // dagar t.o.m. måldatumet

  /* --- 1. Regndrivning: nederbörd viktad med artens fördröjningskärna --- */
  let viktatRegn = 0
  let viktSumma = 0
  const maxAlder = kernMaxAlder(artData.regnfordrojning)
  for (let alder = 0; alder <= maxAlder; alder++) {
    const j = i - alder
    if (j < 0) continue
    const w = kernvikt(alder, artData.regnfordrojning)
    viktSumma += w
    viktatRegn += Math.max(0, (serie[j]!.nederbord || 0) - REGNAVDRAG) * w
  }
  const regnIFonster = viktSumma > 0 ? viktatRegn / viktSumma : 0
  const regnDriv = mattnad(regnIFonster, REGNSKALA)

  /* --- 2. Markfukt i mycelets djup, medel över tio dygn ---
     Det tröga tiodygnsmedlet är avsiktligt: 9–27 cm är initieringssignalen
     och ska inte rycka till av gårdagens skyfall. Nedåt får klockan ett mjukt
     golv i stället för en nollklippa — exakt på artens minimum är marken
     marginell, inte omöjlig — och golvet tonar in i klockan så att stigande
     fukt alltid syns i poängen. Det gäller bara den torra sidan; vattensjuk
     mark är fortfarande noll. */
  const fuktFonster = serie.slice(Math.max(0, i - 9), tom)
  const medelMarkfukt =
    fuktFonster.reduce((s, d) => s + (d.markfukt || 0), 0) / Math.max(1, fuktFonster.length)
  const markfuktKlocka = klocka(
    medelMarkfukt,
    artData.markfukt.min,
    artData.markfukt.opt,
    artData.markfukt.max,
  )
  const markfukt =
    medelMarkfukt > artData.markfukt.opt
      ? markfuktKlocka
      : medelMarkfukt >= artData.markfukt.min
        ? 0.15 + 0.85 * markfuktKlocka
        : 0.15 * Math.exp(-(artData.markfukt.min - medelMarkfukt) / 0.03)

  /* --- 2b. Ytfukt 3–9 cm, medel över två dygn — den snabba kanalen ---
     Ytskiktet svarar på regn inom timmar, så här är ett kort fönster rätt.
     Äldre sparade serier saknar fältet; då får djupfukten vikariera. */
  const ytFonster = serie.slice(Math.max(0, i - 1), tom)
  const medelYtfukt =
    ytFonster.reduce((s, d) => s + (d.ytfukt ?? d.markfukt), 0) / Math.max(1, ytFonster.length)
  const ytfukt = Math.max(
    0,
    Math.min(1, (medelYtfukt - artData.markfukt.min) / (artData.markfukt.opt - artData.markfukt.min)),
  )

  /* --- 3. Marktemperatur på 6 cm, medel över en vecka --- */
  const tempFonster = serie.slice(Math.max(0, i - 6), tom)
  const medelMarktemp =
    tempFonster.reduce((s, d) => s + (d.marktemp || 0), 0) / Math.max(1, tempFonster.length)
  const marktemp = klocka(
    medelMarktemp,
    artData.marktemp.min,
    artData.marktemp.opt,
    artData.marktemp.max,
  )

  /* --- 4. Frost: köldkänsliga arter slutar efter första hårda nattfrosten --- */
  let frostfaktor = 1
  if (!artData.frosttalig) {
    const senaste21 = serie.slice(Math.max(0, i - 20), tom)
    const hardFrost = senaste21.filter((d) => d.tempMin <= -3).length
    const lattFrost = senaste21.filter((d) => d.tempMin <= -1).length
    if (hardFrost > 0) frostfaktor = Math.max(0.05, 0.35 ** hardFrost)
    else if (lattFrost > 1) frostfaktor = 0.75
  } else {
    const mycketHard = serie.slice(Math.max(0, i - 10), tom).filter((d) => d.tempMin <= -8).length
    if (mycketHard > 0) frostfaktor = 0.3
  }

  /* --- 5. Torka: efter en lång torrperiod behöver mycelet extra tid --- */
  const torkFonster = serie.slice(Math.max(0, i - 34), Math.max(0, i - 14))
  const torraDagar = torkFonster.filter((d) => d.markfukt < artData.markfukt.min).length
  const torkfaktor =
    torkFonster.length === 0 ? 1 : Math.max(0.55, 1 - (torraDagar / torkFonster.length) * 0.45)

  /* --- Summering enligt minimumlagen ---
     Vatten och värme är båda nödvändiga, inte utbytbara. En knastertorr skog
     ger noll svamp hur varm marken än är, så faktorerna multipliceras i
     stället för att medelvärdesbildas. Exponenterna gör vattnet till den
     hårdaste begränsningen och låter temperaturen modulera takten.

     Initieringen (fördröjt regn + djupfukt) sätter nivån; ytfukten modulerar
     kring den, centrerad så att en typisk yta är neutral. Blöt yta lyfter
     upp till 15 % — färskt regn ger alltså omedelbar effekt på fruktkroppar
     under utveckling — och uttorkad yta kostar 15 %. Utan initiering finns
     inget att lyfta: skyfall på torr mark förblir nära noll. */
  const initiering = 0.45 * regnDriv + 0.55 * markfukt
  const vatten = initiering * (0.85 + 0.3 * ytfukt)
  const index = Math.max(
    0,
    Math.min(1, Math.pow(vatten, 0.9) * Math.pow(marktemp, 0.6) * frostfaktor * torkfaktor),
  )

  const summera = (dagar: number) =>
    serie.slice(Math.max(0, i - dagar + 1), tom).reduce((s, d) => s + (d.nederbord || 0), 0)

  let dagarSedanRegn: number | null = null
  for (let alder = 0; alder <= 60; alder++) {
    const j = i - alder
    if (j < 0) break
    if ((serie[j]!.nederbord || 0) >= 5) {
      dagarSedanRegn = alder
      break
    }
  }

  const forklaring: string[] = []
  if (regnDriv > 0.7) forklaring.push('Rejält med regn i det fönster arten reagerar på')
  else if (regnDriv > 0.4) forklaring.push('Hyfsat med regn i rätt tidsfönster')
  else if (regnIFonster < 0.6) forklaring.push('För lite regn för två–tre veckor sen')
  else forklaring.push('Knappt med regn där kärnan väger tungt')

  if (markfukt > 0.7) forklaring.push('Markfukten ligger mitt i artens optimum')
  else if (medelMarkfukt < artData.markfukt.min) forklaring.push('Marken är för torr på mycelets djup')
  else if (medelMarkfukt > artData.markfukt.max) forklaring.push('Marken är vattensjuk')
  else forklaring.push('Markfukten är godtagbar men inte optimal')

  if (ytfukt > 0.7 && dagarSedanRegn !== null && dagarSedanRegn <= 2)
    forklaring.push('Färskt regn håller ytan fuktig — bra för fruktkroppar under utveckling')
  else if (ytfukt < 0.35 && initiering > 0.3)
    forklaring.push('Ytan har torkat upp — färskt regn skulle ge snabb effekt')

  if (marktemp > 0.7) forklaring.push(`Marktemperaturen ${medelMarktemp.toFixed(1)}° är precis rätt`)
  else if (medelMarktemp < artData.marktemp.min)
    forklaring.push(`Marken är för kall (${medelMarktemp.toFixed(1)}°)`)
  else if (medelMarktemp > artData.marktemp.max)
    forklaring.push(`Marken är för varm (${medelMarktemp.toFixed(1)}°)`)

  if (frostfaktor < 0.5) forklaring.push('Frosten har tagit säsongen för den här arten')
  if (torkfaktor < 0.8) forklaring.push('Lång torka innan regnet — mycelet behöver längre tid')

  let begransning: Fruktsattning['begransning'] = 'inget'
  {
    const kandidater: [Fruktsattning['begransning'], number][] = [
      ['vatten', vatten],
      ['temperatur', marktemp],
      ['frost', frostfaktor],
      ['torka', torkfaktor],
    ]
    kandidater.sort((a, b) => a[1] - b[1])
    if (kandidater[0]![1] < 0.75) begransning = kandidater[0]![0]
  }

  return {
    index,
    vatten,
    begransning,
    regnDriv,
    markfukt,
    ytfukt,
    marktemp,
    frostfaktor,
    torkfaktor,
    regnIFonster,
    regn7: summera(7),
    regn14: summera(14),
    regn30: summera(30),
    medelMarkfukt,
    medelYtfukt,
    medelMarktemp,
    dagarSedanRegn,
    forklaring,
  }
}

/**
 * Säsongskurva: trapets över dagnummer, förskjutet efter latitud eftersom
 * säsongen börjar senare och slutar tidigare ju längre norrut man är.
 */
export function sasongsfaktor(artData: Species, datum: Date, lat: number): number {
  const dagnr = Math.floor(
    (Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()) -
      Date.UTC(datum.getFullYear(), 0, 1)) /
      864e5,
  ) + 1
  const skift = lat - 59
  const s = artData.sasong.start + skift * 1.5
  const ts = artData.sasong.toppStart + skift * 1.5
  const te = artData.sasong.toppSlut - skift * 2.5
  const e = artData.sasong.slut - skift * 2.5

  if (dagnr <= s || dagnr >= e) return 0
  if (dagnr >= ts && dagnr <= te) return 1
  if (dagnr < ts) {
    const x = (dagnr - s) / Math.max(1, ts - s)
    return x * x * (3 - 2 * x)
  }
  const x = (e - dagnr) / Math.max(1, e - te)
  return x * x * (3 - 2 * x)
}

export function sasongsText(artData: Species, datum: Date, lat: number): string {
  const f = sasongsfaktor(artData, datum, lat)
  if (f >= 0.95) return 'högsäsong'
  if (f >= 0.6) return 'i säsong'
  if (f >= 0.25) return 'tidigt respektive sent i säsongen'
  if (f > 0) return 'utanför bästa säsongen'
  return 'inte i säsong'
}

/** Prognos dag för dag framåt, för att hitta bästa dagen att gå ut. */
export type Dagsprognos = {
  datum: string
  index: number
  sasong: number
  chans: number
  nederbord: number
  tempMax: number
}

export function prognosframat(
  serie: VaderDag[],
  artData: Species,
  lat: number,
  franIndex: number,
  antalDagar: number,
): Dagsprognos[] {
  const ut: Dagsprognos[] = []
  for (let k = 0; k < antalDagar; k++) {
    const i = franIndex + k
    if (i >= serie.length) break
    const dag = serie[i]!
    const f = beraknaFruktsattning(serie, artData, dag.datum)
    const s = sasongsfaktor(artData, new Date(dag.datum + 'T12:00:00'), lat)
    ut.push({
      datum: dag.datum,
      index: f.index,
      sasong: s,
      chans: f.index * s,
      nederbord: dag.nederbord,
      tempMax: dag.tempMax,
    })
  }
  return ut
}
