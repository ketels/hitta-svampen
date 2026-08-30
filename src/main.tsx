import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App.tsx'
import { AppProvider } from './state/app.tsx'

createRoot(document.getElementById('rot')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

// Serviceworkern gör appen installerbar och startbar utan täckning.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Utan serviceworker fungerar allt utom kallstart offline. */
    })
  })
}
