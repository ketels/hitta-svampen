/** GPS and compass. */

import { useCallback, useEffect, useRef, useState } from 'react'

export type GeoPosition = {
  lat: number
  lon: number
  /** Horizontal accuracy in metres. */
  accuracy: number
  elevation: number | null
  /** Direction of travel in degrees, only while moving. */
  heading: number | null
  /** Speed in m/s. */
  speed: number | null
  time: number
}

export type GPSStatus = 'off' | 'searching' | 'on' | 'denied' | 'error'

export function useGPS() {
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [status, setStatus] = useState<GPSStatus>('off')
  const [message, setMessage] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setStatus('off')
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setMessage('Den här enheten har ingen GPS som webbläsaren kommer åt.')
      return
    }
    if (watchId.current !== null) return
    setStatus('searching')
    setMessage(null)
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          elevation: p.coords.altitude,
          heading: p.coords.heading,
          speed: p.coords.speed,
          time: p.timestamp,
        })
        setStatus('on')
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setStatus('denied')
          setMessage(
            'Platsåtkomst nekad. Slå på den för den här sidan i webbläsarens inställningar.',
          )
        } else if (e.code === e.POSITION_UNAVAILABLE) {
          setStatus('error')
          setMessage('Ingen position än — det tar ofta en stund under tät granskog.')
        } else {
          setStatus('error')
          setMessage('GPS-fixen tog för lång tid. Försök igen.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 25000 },
    )
  }, [])

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    },
    [],
  )

  return { position, status, message, start, stop }
}

/**
 * Compass heading. iOS requires an explicit permission that can only be asked
 * for from inside a user gesture, hence the separate `request` function.
 */
export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const handle = (e: DeviceOrientationEvent) => {
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading
      if (typeof webkit === 'number' && !isNaN(webkit)) {
        setHeading(webkit)
        setAvailable(true)
      } else if (e.absolute && e.alpha !== null) {
        setHeading((360 - e.alpha) % 360)
        setAvailable(true)
      }
    }
    window.addEventListener('deviceorientationabsolute', handle as EventListener)
    window.addEventListener('deviceorientation', handle as EventListener)
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle as EventListener)
      window.removeEventListener('deviceorientation', handle as EventListener)
    }
  }, [])

  const request = useCallback(async () => {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof D?.requestPermission === 'function') {
      try {
        await D.requestPermission()
      } catch {
        /* denied — the compass stays off */
      }
    }
  }, [])

  return { heading, available, request }
}
