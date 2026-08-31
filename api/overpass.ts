/**
 * Proxy to Overpass.
 *
 * Overpass rejects browser-like User-Agents with HTTP 406 — reasonably enough,
 * to stop sites from routing their visitors' traffic to a free, volunteer-run
 * service. A browser may not set `User-Agent` itself; it is a forbidden
 * header. The app can therefore never reach Overpass directly from the phone,
 * however many mirrors you line up.
 *
 * This function sits in the middle, identifies itself honestly, and puts the
 * response in Vercel's CDN for a week. Land cover changes slowly, so the same
 * patch of forest only has to burden Overpass once.
 *
 * Nothing is stored and nothing is logged onwards. The query contains a
 * coordinate box, and it only passes through your own Vercel instance.
 */

/*
 * Edge runtime. The Node runtime expects Vercel's own (req, res) signature and
 * crashes immediately on a handler written against the Web standard's Request
 * and Response, which this one is.
 */
export const config = { runtime: 'edge' }

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const AGENT = 'hitta-svampen/1.0 (personlig svampapp; https://hitta-svampen.vercel.app)'

/*
 * Time budget. Vercel's edge functions have a hard limit around 25 seconds —
 * blow through it and the client gets a 504 instead of an honest error
 * message, and never gets the chance to degrade to terrain only. Three mirrors
 * at twenty seconds each did exactly that.
 *
 * A healthy response takes three to seven seconds. Eight per mirror is
 * therefore plenty, and the total stays comfortably under the limit.
 */
const TOTAL_BUDGET_MS = 21_000

/*
 * The strategy follows how Overpass actually behaves under load: either it
 * answers in one to four seconds, or it hangs until something gives up. There
 * is hardly anything in between. Measured both from here and from an ordinary
 * machine — it is overloaded for everyone, not just for cloud IPs.
 *
 * One long attempt is therefore worse than several short ones. A fifteen
 * second timeout gave zero out of four; three attempts at five seconds hit a
 * moment when the server is awake considerably more often.
 */
const PRIMARY_MIRROR_MS = 5_500
const PRIMARY_MIRROR_ATTEMPTS = 3
const PAUSE_BETWEEN_MS = 700
const BACKUP_MIRROR_MS = 4_000

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'Bara GET stöds.' }, 405)

  /*
   * The address is public, and an open Overpass proxy is exactly what someone
   * else's site would like to point at. `Sec-Fetch-Site` is set by the browser
   * and cannot be forged by a page, so it closes that vector. Calls without
   * the header — curl, tests — are let through; they are harmless and make
   * debugging possible.
   */
  if (req.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({ error: 'Proxyn är till för den här appen.' }, 403, { 'Cache-Control': 'no-store' })
  }

  const query = new URL(req.url).searchParams.get('data')
  if (!query) return json({ error: 'Parametern "data" saknas.' }, 400)
  // A real scan query lands around 1,300 characters. The ceiling stops obvious
  // abuse without getting in the way.
  if (query.length > 8000) return json({ error: 'Frågan är för lång.' }, 413)

  const trail: string[] = []
  const deadline = Date.now() + TOTAL_BUDGET_MS

  // The primary mirror is tried several times, the backups once each.
  const candidates: string[] = [
    ...Array<string>(PRIMARY_MIRROR_ATTEMPTS).fill(MIRRORS[0]!),
    ...MIRRORS.slice(1),
  ]

  for (const [attempt, mirror] of candidates.entries()) {
    const left = deadline - Date.now()
    // With under a second left no mirror will manage to answer anyway.
    if (left < 1000) break
    if (attempt > 0) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS))
    const clock = new AbortController()
    const ceiling = mirror === MIRRORS[0] ? PRIMARY_MIRROR_MS : BACKUP_MIRROR_MS
    const timer = setTimeout(() => clock.abort(), Math.min(ceiling, deadline - Date.now()))
    try {
      const res = await fetch(`${mirror}?data=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': AGENT, Accept: 'application/json' },
        signal: clock.signal,
      })
      if (!res.ok) {
        // The status code reveals what is wrong: 406 means the User-Agent is
        // not accepted, 429 that we are pushing too hard, 403 that the address
        // is blocked. Without that distinction the problem cannot be fixed.
        const detail = (await res.text().catch(() => '')).slice(0, 80).replace(/\s+/g, ' ')
        trail.push(`${new URL(mirror).host}#${attempt + 1}=${res.status}${detail ? ` (${detail})` : ''}`)
        continue
      }
      const body = await res.text()
      return new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          // A week in the CDN, and a stale response may be served while a new
          // one is fetched — better to get last week's forest map than none.
          'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
          'X-Mirror': new URL(mirror).host,
        },
      })
    } catch (e) {
      trail.push(
        `${new URL(mirror).host}#${attempt + 1}=${
          e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'onåbar'
        }`,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  return json({ error: 'Ingen spegel svarade.', mirrors: trail }, 502, { 'Cache-Control': 'no-store' })
}
