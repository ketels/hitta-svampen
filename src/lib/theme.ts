/**
 * Light and dark mode.
 *
 * Dark is the app's original design language and light is a mirror of the same
 * tokens, token for token. Auto follows the system, which is what you want:
 * out in glare the phone sits in light mode, at dusk in dark.
 *
 * The choice lives in `localStorage` and not in IndexedDB like the app's other
 * settings. The reason is that the theme must be known *before* the first
 * paint — an asynchronous lookup would give a dark flash before light kicked
 * in.
 */

import { setColorTheme } from './color.ts'

export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'theme'

/** The key used before the codebase was translated, and its values. */
const LEGACY_KEY = 'tema'
const LEGACY_VALUES: Record<string, Theme> = { ljus: 'light', mork: 'dark' }

/** The colour of the phone's status bar and the frame around the PWA window. */
const THEME_COLOR = { light: '#f7f6f1', dark: '#0e1410' }

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
    // Carry over a choice made by the Swedish version, once.
    const old = localStorage.getItem(LEGACY_KEY)
    const migrated = old ? LEGACY_VALUES[old] : undefined
    if (migrated) {
      localStorage.setItem(KEY, migrated)
      localStorage.removeItem(LEGACY_KEY)
      return migrated
    }
    return 'auto'
  } catch {
    // Safari in private mode can throw on read alone.
    return 'auto'
  }
}

export function writeTheme(t: Theme): void {
  try {
    if (t === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    // The setting will not survive a restart, but the app works.
  }
}

export function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(t: Theme): 'light' | 'dark' {
  return t === 'auto' ? systemTheme() : t
}

/**
 * Writes the theme to the document. `color-scheme` has to follow along, or
 * form controls and scrollbars keep the other mode's appearance.
 */
export function applyTheme(mode: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode])
  setColorTheme(mode === 'light')
}
