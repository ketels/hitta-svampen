import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconClose } from './Icons.tsx'

/** Bottom sheet. Can be dragged down to close, as you expect on mobile. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const down = (y: number) => {
    start.current = y
    setDrag(0)
  }
  const move = (y: number) => {
    if (start.current === null) return
    setDrag(Math.max(0, y - start.current))
  }
  const up = () => {
    if (drag > 90) onClose()
    start.current = null
    setDrag(0)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className="sheet"
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="sheet-handle"
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            down(e.clientY)
          }}
          onPointerMove={(e) => move(e.clientY)}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <i />
        </div>
        <div className="sheet-head">
          <div className="grow">
            <h2 className="truncate">{title}</h2>
            {subtitle ? <div className="small dim truncate">{subtitle}</div> : null}
          </div>
          <button className="close" onClick={onClose} aria-label="Stäng">
            <IconClose size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? (
          <div style={{ padding: '10px 16px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)' }}>
            {footer}
          </div>
        ) : null}
      </div>
    </>
  )
}
