/**
 * Proxy mot Overpass.
 *
 * Overpass avvisar webbläsarlika User-Agents med HTTP 406 — rimligtvis för
 * att hindra sajter från att skicka sina besökares trafik till en gratis,
 * idealt driven tjänst. En webbläsare får inte sätta `User-Agent` själv, den
 * är en förbjuden header. Appen kan alltså aldrig nå Overpass direkt från
 * telefonen, hur många speglar man än radar upp.
 *
 * Den här funktionen står i mitten, identifierar sig ärligt, och lägger
 * svaret i Vercels CDN i en vecka. Landtäcke ändrar sig långsamt, så samma
 * skogsruta behöver bara belasta Overpass en gång.
 *
 * Ingenting sparas och ingenting loggas vidare. Frågan innehåller en
 * koordinatruta, och den passerar bara genom din egen Vercel-instans.
 */

export const config = { runtime: 'edge' }

const SPEGLAR = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const AGENT = 'hitta-svampen/1.0 (personlig svampapp; https://hitta-svampen.vercel.app)'

/*
 * Tidsbudget. Vercels edge-funktioner har en hård gräns kring 25 sekunder —
 * spränger man den får klienten 504 i stället för ett ärligt felmeddelande,
 * och hinner aldrig degradera till enbart terräng. Tre speglar à tjugo
 * sekunder gjorde precis det.
 *
 * Ett friskt svar tar tre till sju sekunder. Åtta per spegel räcker alltså
 * gott, och totalen håller sig med marginal under gränsen.
 */
const SPEGEL_TIMEOUT_MS = 8_000
const TOTAL_BUDGET_MS = 16_000

const json = (kropp: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(kropp), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ fel: 'Bara GET stöds.' }, 405)

  /*
   * Adressen är publik, och en öppen Overpass-proxy är precis vad någon
   * annans sajt skulle vilja peka på. `Sec-Fetch-Site` sätts av webbläsaren
   * och kan inte förfalskas av en sida, så den stoppar den vektorn. Anrop
   * utan headern — curl, tester — släpps igenom; de är ofarliga och gör
   * felsökning möjlig.
   */
  if (req.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({ fel: 'Proxyn är till för den här appen.' }, 403, { 'Cache-Control': 'no-store' })
  }

  const fraga = new URL(req.url).searchParams.get('data')
  if (!fraga) return json({ fel: 'Parametern "data" saknas.' }, 400)
  // En riktig skanningsfråga landar kring 1 300 tecken. Taket stoppar
  // uppenbart missbruk utan att komma i vägen.
  if (fraga.length > 8000) return json({ fel: 'Frågan är för lång.' }, 413)

  let sistaFel = 'Ingen spegel svarade.'
  const slutTid = Date.now() + TOTAL_BUDGET_MS

  for (const spegel of SPEGLAR) {
    const kvar = slutTid - Date.now()
    // Under en sekund kvar hinner ingen spegel svara ändå.
    if (kvar < 1000) break
    const klocka = new AbortController()
    const avbryt = setTimeout(() => klocka.abort(), Math.min(SPEGEL_TIMEOUT_MS, kvar))
    try {
      const svar = await fetch(`${spegel}?data=${encodeURIComponent(fraga)}`, {
        headers: { 'User-Agent': AGENT, Accept: 'application/json' },
        signal: klocka.signal,
      })
      if (!svar.ok) {
        sistaFel = `${new URL(spegel).host} svarade ${svar.status}`
        continue
      }
      const kropp = await svar.text()
      return new Response(kropp, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          // En vecka i CDN:en, och gammalt svar får serveras medan ett nytt
          // hämtas — bättre att få förra veckans skogskarta än ingen alls.
          'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
          'X-Spegel': new URL(spegel).host,
        },
      })
    } catch (e) {
      sistaFel =
        e instanceof Error && e.name === 'AbortError'
          ? `${new URL(spegel).host} svarade inte i tid`
          : `${new URL(spegel).host} gick inte att nå`
    } finally {
      clearTimeout(avbryt)
    }
  }

  return json({ fel: sistaFel }, 502, { 'Cache-Control': 'no-store' })
}
