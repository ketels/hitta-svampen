import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * Geolocation kräver "secure context". På localhost räknas http som säkert,
 * men från telefonen över LAN gör det inte det — därför slår `npm run mobil`
 * på ett självsignerat certifikat.
 */
const mobil = process.env.MOBIL === '1'

export default defineConfig({
  plugins: [react(), ...(mobil ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: mobil,
    /*
     * Overpass svarar 406 på webbläsarlika User-Agents, och webbläsaren får
     * inte sätta headern själv. I produktion löses det av en edge-funktion
     * under /api/overpass; här gör dev-servern samma sak, så koden slipper
     * bry sig om vilken miljö den kör i.
     */
    proxy: {
      '/api/overpass': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        rewrite: (sokvag) => sokvag.replace(/^\/api\/overpass/, '/api/interpreter'),
        headers: { 'User-Agent': 'hitta-svampen/1.0 (utveckling)' },
      },
    },
  },
  build: { target: 'es2022', sourcemap: true },
})
