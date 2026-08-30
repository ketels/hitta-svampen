import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IkonKryss } from './Ikoner.tsx'

/** Bottenark. Går att dra ned för att stänga, som man förväntar sig på mobil. */
export function Ark({
  titel,
  underrubrik,
  onStang,
  children,
  fot,
}: {
  titel: ReactNode
  underrubrik?: ReactNode
  onStang: () => void
  children: ReactNode
  fot?: ReactNode
}) {
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)

  useEffect(() => {
    const tangent = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStang()
    }
    window.addEventListener('keydown', tangent)
    return () => window.removeEventListener('keydown', tangent)
  }, [onStang])

  const ned = (y: number) => {
    start.current = y
    setDrag(0)
  }
  const flytta = (y: number) => {
    if (start.current === null) return
    setDrag(Math.max(0, y - start.current))
  }
  const upp = () => {
    if (drag > 90) onStang()
    start.current = null
    setDrag(0)
  }

  return (
    <>
      <div className="ark-bakgrund" onClick={onStang} />
      <div
        className="ark"
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="ark-handtag"
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            ned(e.clientY)
          }}
          onPointerMove={(e) => flytta(e.clientY)}
          onPointerUp={upp}
          onPointerCancel={upp}
        >
          <i />
        </div>
        <div className="ark-topp">
          <div className="vaxa">
            <h2 className="trunka">{titel}</h2>
            {underrubrik ? <div className="liten svag trunka">{underrubrik}</div> : null}
          </div>
          <button className="stang" onClick={onStang} aria-label="Stäng">
            <IkonKryss size={18} />
          </button>
        </div>
        <div className="ark-kropp">{children}</div>
        {fot ? <div style={{ padding: '10px 16px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--kant)' }}>{fot}</div> : null}
      </div>
    </>
  )
}
