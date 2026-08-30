/**
 * Personlig anpassning — appen lär sig din skog.
 *
 * Modellens startvärden är hämtade ur litteraturen och gäller Sverige i stort.
 * Men din trakt är inte Sverige i stort. Om dina kantareller står i blötare
 * mark än läroboken säger, ska modellen följa med dit. Vi flyttar därför
 * artens optimum mot dina egna fynd med krympning: efter tio fynd väger din
 * erfarenhet ungefär lika tungt som utgångsvärdet, och innan dess mindre.
 * Ett enda fynd ska inte kasta om hela modellen.
 */

import type { Find, Marktyp, Species, SpeciesId } from '../lib/types.ts'

/** Efter så här många fynd väger din data lika tungt som utgångsvärdet. */
const KRYMPNING = 10

export type Larande = {
  antal: number
  /** Hur stor vikt din egen data fått, 0–1. */
  styrka: number
  anmarkningar: string[]
}

export type AnpassadArt = { art: Species; larande: Larande }

const SKOGSTYPER: Marktyp[] = ['barrskog', 'lovskog', 'blandskog', 'skog', 'okant']

export function anpassaArt(bas: Species, allaFynd: Find[]): AnpassadArt {
  const fynd = allaFynd.filter(
    (f) => f.art === bas.id && f.habitat && SKOGSTYPER.includes(f.habitat.marktyp),
  )
  const n = fynd.length
  const anmarkningar: string[] = []
  if (n === 0) return { art: bas, larande: { antal: 0, styrka: 0, anmarkningar: [] } }

  const styrka = n / (n + KRYMPNING)
  const art: Species = { ...bas, lovtyp: { ...bas.lovtyp }, markfukt: { ...bas.markfukt } }

  const blanda = (prior: number, observerat: number) => prior + (observerat - prior) * styrka

  /* --- Markfuktighet: flytta optimum mot där du faktiskt hittar svamp --- */
  const twin = fynd.map((f) => f.habitat!.twi).filter(isFinite)
  if (twin.length >= 2) {
    const medel = twin.reduce((a, b) => a + b, 0) / twin.length
    const spridning = Math.sqrt(
      twin.reduce((s, v) => s + (v - medel) ** 2, 0) / Math.max(1, twin.length - 1),
    )
    art.twiOpt = blanda(bas.twiOpt, medel)
    // Sprider dina fynd ut sig brett är arten mindre kräsen än vi trodde.
    if (isFinite(spridning) && spridning > 0.4) {
      art.twiBredd = blanda(bas.twiBredd, Math.max(1.2, Math.min(5, spridning * 1.3)))
    }
    const skift = art.twiOpt - bas.twiOpt
    if (Math.abs(skift) > 0.6) {
      anmarkningar.push(
        skift > 0
          ? `Dina ${bas.namn.toLowerCase()}er står blötare än normalt — modellen har följt med dit`
          : `Dina ${bas.namn.toLowerCase()}er står torrare än normalt — modellen har följt med dit`,
      )
    }
  }

  /* --- Skogstyp: vilken sorts skog hittar du dem faktiskt i? --- */
  const raknare: Record<string, number> = {}
  for (const f of fynd) raknare[f.habitat!.marktyp] = (raknare[f.habitat!.marktyp] ?? 0) + 1
  const tydliga = (raknare['barrskog'] ?? 0) + (raknare['lovskog'] ?? 0) + (raknare['blandskog'] ?? 0)
  if (tydliga >= 3) {
    const andel = (m: Marktyp) => (raknare[m] ?? 0) / tydliga
    // Normalisera mot den vanligaste så vi behåller skalan 0–1.
    const obs = {
      needleleaved: andel('barrskog'),
      broadleaved: andel('lovskog'),
      mixed: andel('blandskog'),
    }
    const max = Math.max(obs.needleleaved, obs.broadleaved, obs.mixed, 1e-6)
    // Håll en botten så att en skogstyp du ännu inte letat i inte nollas ut.
    art.lovtyp = {
      needleleaved: Math.max(0.25, blanda(bas.lovtyp.needleleaved, obs.needleleaved / max)),
      broadleaved: Math.max(0.25, blanda(bas.lovtyp.broadleaved, obs.broadleaved / max)),
      mixed: Math.max(0.25, blanda(bas.lovtyp.mixed, obs.mixed / max)),
    }
    const vanligast = (['barrskog', 'lovskog', 'blandskog'] as const).reduce((a, b) =>
      (raknare[a] ?? 0) >= (raknare[b] ?? 0) ? a : b,
    )
    anmarkningar.push(
      `Flest av dina fynd står i ${{ barrskog: 'barrskog', lovskog: 'lövskog', blandskog: 'blandskog' }[vanligast]}`,
    )
  }

  /* --- Säsong: när på året hittar du dem? --- */
  const dagnr = fynd.map((f) => {
    const d = new Date(f.tid)
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 864e5) + 1
  })
  if (dagnr.length >= 4) {
    const tidigast = Math.min(...dagnr)
    const senast = Math.max(...dagnr)
    if (tidigast < bas.sasong.start) {
      art.sasong = { ...art.sasong, start: Math.round(blanda(bas.sasong.start, tidigast - 7)) }
      anmarkningar.push('Du har hittat arten tidigare på året än normalt')
    }
    if (senast > bas.sasong.slut) {
      art.sasong = { ...art.sasong, slut: Math.round(blanda(bas.sasong.slut, senast + 7)) }
      anmarkningar.push('Du har hittat arten senare på året än normalt')
    }
  }

  if (n < 3) anmarkningar.push(`Bara ${n} fynd än — spara fler så blir modellen vassare`)

  return { art, larande: { antal: n, styrka, anmarkningar } }
}

/** Sammanfattning av vad appen lärt sig, för inställningsvyn. */
export function larandeOversikt(
  arter: Species[],
  fynd: Find[],
): { id: SpeciesId; namn: string; antal: number; styrka: number; anmarkningar: string[] }[] {
  return arter
    .map((a) => {
      const { larande } = anpassaArt(a, fynd)
      return { id: a.id, namn: a.namn, ...larande }
    })
    .filter((x) => x.antal > 0)
    .sort((a, b) => b.antal - a.antal)
}
