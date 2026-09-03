import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * Geolocation requires a "secure context". On localhost http counts as secure,
 * but from a phone over the LAN it does not — hence `npm run mobil` turning on
 * a self-signed certificate.
 */
const mobile = process.env.MOBIL === '1'

export default defineConfig({
  plugins: [react(), ...(mobile ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: mobile,
  },
  build: { target: 'es2022', sourcemap: true },
})
