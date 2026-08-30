/**
 * Kompletterar ett sparat fynd med habitat- och väderdata i efterhand.
 *
 * Poängen är att aldrig låta någon stå still i regnet och vänta på nätverket.
 * Fyndet sparas direkt med koordinat och tid; terräng och väder fylls i när
 * det går, och finns det redan en skanning över platsen går det ögonblickligen.
 */

import { sparaFynd } from '../lib/db.ts'
import type { Find } from '../lib/types.ts'
import { analyseraPunkt, bedomFranSkanning, type Skanning } from './skanning.ts'

export async function berikaFynd(
  fynd: Find,
  alla: Find[],
  skanning: Skanning | null,
): Promise<Find | null> {
  try {
    const bedomning =
      (skanning && skanning.art === fynd.art
        ? bedomFranSkanning(skanning, { lat: fynd.lat, lon: fynd.lon }, alla)
        : null) ?? (await analyseraPunkt({ lat: fynd.lat, lon: fynd.lon }, fynd.art, alla))

    const berikat: Find = {
      ...fynd,
      habitat: { ...bedomning.prov, lat: fynd.lat, lon: fynd.lon },
      vader: {
        regn7: bedomning.fruktsattning.regn7,
        regn14: bedomning.fruktsattning.regn14,
        regn30: bedomning.fruktsattning.regn30,
        markfukt: bedomning.fruktsattning.medelMarkfukt,
        marktemp: bedomning.fruktsattning.medelMarktemp,
        index: bedomning.fruktsattning.index,
      },
    }
    await sparaFynd(berikat)
    return berikat
  } catch {
    // Ett fynd utan habitatdata är fortfarande ett fynd. Vi försöker igen
    // nästa gång användaren öppnar det.
    return null
  }
}

/** Hur många fynd vi kompletterar per körning. Tjänsterna är gratis. */
const MAX_PER_OMGANG = 8
const PAUS_MS = 2500

/**
 * Kompletterar i efterhand de fynd som saknar habitatdata — sparade offline,
 * importerade från en annan telefon, eller från en gång då nätet strulade.
 * Körs lugnt i bakgrunden, ett fynd i taget, och ger upp tyst utan nät.
 */
export async function berikaEftersläntrare(
  alla: Find[],
  skanning: Skanning | null,
  signal: AbortSignal,
  narKlart: () => void,
): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  const kvar = alla.filter((f) => !f.habitat).slice(0, MAX_PER_OMGANG)
  if (kvar.length === 0) return 0

  let lyckade = 0
  for (const f of kvar) {
    if (signal.aborted) break
    const b = await berikaFynd(f, alla, skanning)
    if (b) lyckade++
    else break // Nätet är nere eller tjänsten trött — försök igen nästa gång.
    await new Promise((r) => setTimeout(r, PAUS_MS))
  }
  if (lyckade > 0 && !signal.aborted) narKlart()
  return lyckade
}
