/**
 * Ljust och mörkt läge.
 *
 * Mörkt är appens ursprungliga formspråk och ljust är en spegling av samma
 * tokens, token för token. Auto följer systemet, vilket är det man vill: ute i
 * motljus står telefonen i ljust läge, i skymningen i mörkt.
 *
 * Valet ligger i `localStorage` och inte i IndexedDB som appens övriga
 * inställningar. Skälet är att temat måste vara känt *före* första målningen —
 * ett asynkront uppslag hade gett ett mörkt blink innan det ljusa slog till.
 */

import { sattFargtema } from './farg.ts'

export type Tema = 'auto' | 'ljus' | 'mork'

const NYCKEL = 'tema'

/** Färgen i telefonens statusfält och runt PWA-fönstret. */
const TEMAFARG = { ljus: '#f7f6f1', mork: '#0e1410' }

export function lasTema(): Tema {
  try {
    const v = localStorage.getItem(NYCKEL)
    return v === 'ljus' || v === 'mork' ? v : 'auto'
  } catch {
    // Safari i privat läge kan kasta redan vid läsning.
    return 'auto'
  }
}

export function skrivTema(t: Tema): void {
  try {
    if (t === 'auto') localStorage.removeItem(NYCKEL)
    else localStorage.setItem(NYCKEL, t)
  } catch {
    // Inställningen överlever inte omstarten, men appen fungerar.
  }
}

export function systemetsTema(): 'ljus' | 'mork' {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'ljus' : 'mork'
}

export function loserTema(t: Tema): 'ljus' | 'mork' {
  return t === 'auto' ? systemetsTema() : t
}

/**
 * Skriver temat till dokumentet. `color-scheme` måste följa med i takt, annars
 * behåller formulärkontroller och rullningslister det andra lägets utseende.
 */
export function tillampaTema(lage: 'ljus' | 'mork'): void {
  document.documentElement.dataset.tema = lage
  document.documentElement.style.colorScheme = lage === 'ljus' ? 'light' : 'dark'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TEMAFARG[lage])
  sattFargtema(lage === 'ljus')
}
