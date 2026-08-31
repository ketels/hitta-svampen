import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App.tsx'
import { AppProvider } from './state/app.tsx'
import { readTheme, resolveTheme, applyTheme } from './lib/theme.ts'

/* The theme is set before the first paint. AppProvider then takes over and
   keeps it in step with the setting and with the system. */
applyTheme(resolveTheme(readTheme()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

/* The service worker makes the app installable and startable without coverage.
   If it fails, everything except the cold start works offline — map tiles,
   elevation data, weather and finds all live in IndexedDB regardless. We
   therefore swallow the error, but print it so you can see what happened, and
   the status is shown under Mer. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => {
      console.warn(
        'Serviceworkern kunde inte registreras — appen startar inte utan nät. ' +
          'Allt annat offline-stöd fungerar ändå.',
        e,
      )
    })
  }
  // `load` may already have fired by the time the module runs.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
