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
    /*
     * Overpass answers 406 to browser-like User-Agents, and the browser may
     * not set the header itself. In production that is solved by an edge
     * function under /api/overpass; here the dev server does the same thing,
     * so the code does not have to care which environment it runs in.
     */
    proxy: {
      '/api/overpass': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/overpass/, '/api/interpreter'),
        headers: { 'User-Agent': 'hitta-svampen/1.0 (utveckling)' },
      },
    },
  },
  build: { target: 'es2022', sourcemap: true },
})
