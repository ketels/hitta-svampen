/** Delat tillstånd. Litet nog att bo i en enda kontext. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  begarBestandigLagring, hamtaFynd, hamtaSkanning, hamtaSpar, las, raderaFynd, raderaSpar,
  skriv, sparaFynd, sparaSkanning, stadaCache,
} from '../lib/db.ts'
import { useGPS, useKompass, type Plats } from '../lib/gps.ts'
import type { Find, Spar, SpeciesId } from '../lib/types.ts'
import type { Skanning } from '../model/skanning.ts'
import { berikaEftersläntrare } from '../model/berika.ts'

export type Vy = 'karta' | 'prognos' | 'fynd' | 'arter' | 'mer'

export type Kartlager = 'topo' | 'satellit' | 'karta'

type AppVarde = {
  fynd: Find[]
  spar: Spar[]
  laddaOm: () => Promise<void>
  spara: (f: Find) => Promise<void>
  taBort: (id: string) => Promise<void>
  taBortSpar: (id: string) => Promise<void>

  valdArt: SpeciesId
  setValdArt: (a: SpeciesId) => void

  vy: Vy
  setVy: (v: Vy) => void

  kartlager: Kartlager
  setKartlager: (l: Kartlager) => void

  visaObservationer: boolean
  setVisaObservationer: (v: boolean) => void

  /** Om kartans bottenpanel är utfälld. Ute i skogen vill man se kartan. */
  panelOppen: boolean
  setPanelOppen: (v: boolean) => void

  /** Dämpad karta för skymning och mörker. */
  nattlage: boolean
  setNattlage: (v: boolean) => void

  skanning: Skanning | null
  setSkanning: (s: Skanning | null) => void

  /** Punkt kartan ska flyga till, sätts av andra vyer. */
  malpunkt: { lat: number; lon: number; zoom?: number } | null
  gaTill: (lat: number, lon: number, zoom?: number) => void
  rensaMal: () => void

  gps: ReturnType<typeof useGPS>
  kompass: ReturnType<typeof useKompass>
  /** Senast kända position, även om GPS:en är avstängd just nu. */
  sistaPlats: Plats | null
}

const Kontext = createContext<AppVarde | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [fynd, setFynd] = useState<Find[]>([])
  const [spar, setSpar] = useState<Spar[]>([])
  const [valdArt, setValdArtRaw] = useState<SpeciesId>('kantarell')
  const [vy, setVy] = useState<Vy>('karta')
  const [kartlager, setKartlagerRaw] = useState<Kartlager>('topo')
  const [visaObservationer, setVisaObservationerRaw] = useState(false)
  const [panelOppen, setPanelOppenRaw] = useState(true)
  const [nattlage, setNattlageRaw] = useState(false)
  const [skanning, setSkanningRaw] = useState<Skanning | null>(null)
  const [malpunkt, setMalpunkt] = useState<AppVarde['malpunkt']>(null)
  const [sistaPlats, setSistaPlats] = useState<Plats | null>(null)

  const gps = useGPS()
  const kompass = useKompass()

  useEffect(() => {
    if (gps.plats) setSistaPlats(gps.plats)
  }, [gps.plats])

  const laddaOm = useCallback(async () => {
    const [f, s] = await Promise.all([hamtaFynd(), hamtaSpar()])
    setFynd(f)
    setSpar(s)
  }, [])

  useEffect(() => {
    void laddaOm()
    void stadaCache()
    void begarBestandigLagring()
    void (async () => {
      setValdArtRaw(await las<SpeciesId>('valdArt', 'kantarell'))
      setKartlagerRaw(await las<Kartlager>('kartlager', 'topo'))
      setVisaObservationerRaw(await las<boolean>('visaObservationer', false))
      setPanelOppenRaw(await las<boolean>('panelOppen', true))
      setNattlageRaw(await las<boolean>('nattlage', false))
      const p = await las<Plats | null>('sistaPlats', null)
      if (p) setSistaPlats(p)
      // Den senaste skanningen läggs tillbaka så att kartan är ifylld direkt
      // när man öppnar appen — även utan täckning ute i skogen.
      const s = await hamtaSkanning<Skanning>()
      if (s) setSkanningRaw(s)
    })()
  }, [laddaOm])

  /* Fyller på habitatdata för fynd som saknar den. Sparar man ett fynd utan
     täckning — eller importerar från en annan telefon — hinner analysen inte
     med då. Här tas de om hand i lugn takt när appen väl är igång.

     Flaggan sätts först när arbetet verkligen startar. Sätts den redan när
     effekten körs monterar React i strikt läge om komponenten, städar bort
     timern och kommer sedan aldrig förbi flaggan igen. */
  const berikatRef = useRef(false)
  const fyndRef = useRef(fynd)
  const skanningRef = useRef(skanning)
  fyndRef.current = fynd
  skanningRef.current = skanning
  const behoverBerikas = fynd.some((f) => !f.habitat)

  useEffect(() => {
    if (!behoverBerikas || berikatRef.current) return
    const ctrl = new AbortController()
    const start = setTimeout(() => {
      if (berikatRef.current) return
      berikatRef.current = true
      void berikaEftersläntrare(fyndRef.current, skanningRef.current, ctrl.signal, () =>
        void laddaOm(),
      )
    }, 3000)
    return () => {
      clearTimeout(start)
      ctrl.abort()
    }
  }, [behoverBerikas, laddaOm])

  // Sparar senaste positionen så kartan öppnar på rätt ställe nästa gång.
  useEffect(() => {
    if (!gps.plats) return
    const t = setTimeout(() => void skriv('sistaPlats', gps.plats), 4000)
    return () => clearTimeout(t)
  }, [gps.plats])

  const setSkanning = useCallback((s: Skanning | null) => {
    setSkanningRaw(s)
    void sparaSkanning(s)
  }, [])

  const setValdArt = useCallback((a: SpeciesId) => {
    setValdArtRaw(a)
    void skriv('valdArt', a)
  }, [])

  const setKartlager = useCallback((l: Kartlager) => {
    setKartlagerRaw(l)
    void skriv('kartlager', l)
  }, [])

  const setVisaObservationer = useCallback((v: boolean) => {
    setVisaObservationerRaw(v)
    void skriv('visaObservationer', v)
  }, [])

  const setPanelOppen = useCallback((v: boolean) => {
    setPanelOppenRaw(v)
    void skriv('panelOppen', v)
  }, [])

  const setNattlage = useCallback((v: boolean) => {
    setNattlageRaw(v)
    void skriv('nattlage', v)
  }, [])

  const spara = useCallback(
    async (f: Find) => {
      await sparaFynd(f)
      await laddaOm()
      // Webbläsaren beviljar beständig lagring lättare när appen bevisligen
      // används, så vi frågar igen varje gång något sparas.
      void begarBestandigLagring()
    },
    [laddaOm],
  )

  const taBort = useCallback(
    async (id: string) => {
      await raderaFynd(id)
      await laddaOm()
    },
    [laddaOm],
  )

  const taBortSpar = useCallback(
    async (id: string) => {
      await raderaSpar(id)
      await laddaOm()
    },
    [laddaOm],
  )

  const gaTill = useCallback((lat: number, lon: number, zoom?: number) => {
    setMalpunkt({ lat, lon, zoom })
    setVy('karta')
  }, [])

  const rensaMal = useCallback(() => setMalpunkt(null), [])

  const varde = useMemo<AppVarde>(
    () => ({
      fynd, spar, laddaOm, spara, taBort, taBortSpar,
      valdArt, setValdArt,
      vy, setVy,
      kartlager, setKartlager,
      visaObservationer, setVisaObservationer,
      panelOppen, setPanelOppen,
      nattlage, setNattlage,
      skanning, setSkanning,
      malpunkt, gaTill, rensaMal,
      gps, kompass, sistaPlats,
    }),
    [fynd, spar, laddaOm, spara, taBort, taBortSpar, valdArt, setValdArt, vy, kartlager,
     setKartlager, visaObservationer, setVisaObservationer, panelOppen, setPanelOppen,
     nattlage, setNattlage, skanning, setSkanning, malpunkt, gaTill, rensaMal, gps,
     kompass, sistaPlats],
  )

  return <Kontext.Provider value={varde}>{children}</Kontext.Provider>
}

export function useApp(): AppVarde {
  const v = useContext(Kontext)
  if (!v) throw new Error('useApp måste användas inuti AppProvider')
  return v
}
