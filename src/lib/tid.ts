/** Tid, dagsljus och ålder på data. */

import type { VaderDag } from './types.ts'

export function klockslag(iso: string): string {
  // Open-Meteo levererar lokal tid utan zonsuffix.
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '–'
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** "2 h 15 min" eller "40 min". */
export function varaktighet(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

export type Dagsljus = {
  uppgang: Date | null
  nedgang: Date | null
  /** Millisekunder kvar till solnedgång, negativt när solen gått ned. */
  kvarMs: number | null
  /** Färdig mening att visa. */
  text: string | null
  /**
   * Samma sak på en rad som delar plats med annat — teckenförklaringen på
   * kartan. Klockslaget räcker så länge det är gott om dag kvar; den sista
   * timmen är det tiden som betyder något, och då står den där i stället.
   */
  kort: string | null
}

/**
 * Hur mycket dagsljus som återstår. Att veta att det är fyrtio minuter kvar
 * till skymningen är skillnaden mellan en trevlig runda och att leta efter
 * bilen med mobilens ficklampa.
 */
export function dagsljus(dag: VaderDag | undefined, nu = new Date()): Dagsljus {
  const tomt = { uppgang: null, nedgang: null, kvarMs: null, text: null, kort: null }
  if (!dag?.solnedgang) return tomt
  const nedgang = new Date(dag.solnedgang)
  const uppgang = dag.soluppgang ? new Date(dag.soluppgang) : null
  if (isNaN(nedgang.getTime())) return tomt

  const kvarMs = nedgang.getTime() - nu.getTime()
  let text: string
  let kort: string
  if (kvarMs > 0) {
    text = `${varaktighet(kvarMs)} till skymning (${klockslag(dag.solnedgang)})`
    kort =
      kvarMs <= 3600e3
        ? `${varaktighet(kvarMs)} till skymning`
        : `Ljust till ${klockslag(dag.solnedgang)}`
  } else if (uppgang && nu < uppgang) {
    text = `Soluppgång ${klockslag(dag.soluppgang!)}`
    kort = text
  } else {
    text = `Solen gick ned ${klockslag(dag.solnedgang)}`
    kort = `Mörkt sedan ${klockslag(dag.solnedgang)}`
  }
  return { uppgang, nedgang, kvarMs, text, kort }
}

/** "för 3 timmar sedan", för att visa hur färsk en skanning är. */
export function sedan(tid: number, nu = Date.now()): string {
  const min = Math.round((nu - tid) / 60000)
  if (min < 2) return 'nyss'
  if (min < 60) return `för ${min} min sedan`
  const h = Math.round(min / 60)
  if (h < 24) return `för ${h} ${h === 1 ? 'timme' : 'timmar'} sedan`
  const d = Math.round(h / 24)
  return `för ${d} ${d === 1 ? 'dygn' : 'dygn'} sedan`
}
