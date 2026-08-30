/** GPS och kompass. */

import { useCallback, useEffect, useRef, useState } from 'react'

export type Plats = {
  lat: number
  lon: number
  /** Horisontell noggrannhet i meter. */
  noggrannhet: number
  hojd: number | null
  /** Färdriktning i grader, bara när man rör sig. */
  riktning: number | null
  /** Hastighet i m/s. */
  fart: number | null
  tid: number
}

export type GPSStatus = 'av' | 'soker' | 'pa' | 'nekad' | 'fel'

export function useGPS() {
  const [plats, setPlats] = useState<Plats | null>(null)
  const [status, setStatus] = useState<GPSStatus>('av')
  const [meddelande, setMeddelande] = useState<string | null>(null)
  const vakt = useRef<number | null>(null)

  const stoppa = useCallback(() => {
    if (vakt.current !== null) {
      navigator.geolocation.clearWatch(vakt.current)
      vakt.current = null
    }
    setStatus('av')
  }, [])

  const starta = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('fel')
      setMeddelande('Den här enheten har ingen GPS som webbläsaren kommer åt.')
      return
    }
    if (vakt.current !== null) return
    setStatus('soker')
    setMeddelande(null)
    vakt.current = navigator.geolocation.watchPosition(
      (p) => {
        setPlats({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          noggrannhet: p.coords.accuracy,
          hojd: p.coords.altitude,
          riktning: p.coords.heading,
          fart: p.coords.speed,
          tid: p.timestamp,
        })
        setStatus('pa')
      },
      (f) => {
        if (f.code === f.PERMISSION_DENIED) {
          setStatus('nekad')
          setMeddelande(
            'Platsåtkomst nekad. Slå på den för den här sidan i webbläsarens inställningar.',
          )
        } else if (f.code === f.POSITION_UNAVAILABLE) {
          setStatus('fel')
          setMeddelande('Ingen position än — det tar ofta en stund under tät granskog.')
        } else {
          setStatus('fel')
          setMeddelande('GPS-fixen tog för lång tid. Försök igen.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 25000 },
    )
  }, [])

  useEffect(() => () => { if (vakt.current !== null) navigator.geolocation.clearWatch(vakt.current) }, [])

  return { plats, status, meddelande, starta, stoppa }
}

/**
 * Kompassriktning. iOS kräver ett uttryckligt tillstånd som bara går att be om
 * inifrån en användargest, därför den separata `be`-funktionen.
 */
export function useKompass() {
  const [riktning, setRiktning] = useState<number | null>(null)
  const [tillganglig, setTillganglig] = useState(false)

  useEffect(() => {
    const hantera = (e: DeviceOrientationEvent) => {
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading
      if (typeof webkit === 'number' && !isNaN(webkit)) {
        setRiktning(webkit)
        setTillganglig(true)
      } else if (e.absolute && e.alpha !== null) {
        setRiktning((360 - e.alpha) % 360)
        setTillganglig(true)
      }
    }
    window.addEventListener('deviceorientationabsolute', hantera as EventListener)
    window.addEventListener('deviceorientation', hantera as EventListener)
    return () => {
      window.removeEventListener('deviceorientationabsolute', hantera as EventListener)
      window.removeEventListener('deviceorientation', hantera as EventListener)
    }
  }, [])

  const be = useCallback(async () => {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof D?.requestPermission === 'function') {
      try {
        await D.requestPermission()
      } catch {
        /* nekat — kompassen förblir avstängd */
      }
    }
  }, [])

  return { riktning, tillganglig, be }
}
