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
  server: { port: 5173, host: mobil },
  build: { target: 'es2022', sourcemap: true },
})
