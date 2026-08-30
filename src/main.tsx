import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App.tsx'
import { AppProvider } from './state/app.tsx'
import { lasTema, loserTema, tillampaTema } from './lib/tema.ts'

/* Temat sätts före första målningen. AppProvider tar sedan över och håller det
   i takt med inställningen och med systemet. */
tillampaTema(loserTema(lasTema()))

createRoot(document.getElementById('rot')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

/* Serviceworkern gör appen installerbar och startbar utan täckning.
   Misslyckas den fungerar allt utom just kallstarten offline — kartrutor,
   höjddata, väder och fynd ligger i IndexedDB oavsett. Vi sväljer därför
   felet, men skriver ut det så att man kan se vad som hände, och statusen
   visas under Mer. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const registrera = () => {
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => {
      console.warn(
        'Serviceworkern kunde inte registreras — appen startar inte utan nät. ' +
          'Allt annat offline-stöd fungerar ändå.',
        e,
      )
    })
  }
  // `load` kan redan ha hunnit inträffa när modulen körs.
  if (document.readyState === 'complete') registrera()
  else window.addEventListener('load', registrera, { once: true })
}
