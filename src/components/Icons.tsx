/** Icons. Stroked, 24×24, inheriting colour from the text. */

type P = {
  size?: number
  strokeWidth?: number
  /** For simple transforms, such as flipping a chevron. */
  style?: React.CSSProperties
  className?: string
}

function Svg({
  size = 24,
  strokeWidth = 1.9,
  style,
  className,
  children,
}: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      style={style}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconMap = (p: P) => (
  <Svg {...p}>
    <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" />
    <path d="M9 4v13M15 7v13" />
  </Svg>
)

export const IconCloud = (p: P) => (
  <Svg {...p}>
    <path d="M7 15.5a3.8 3.8 0 0 1 .5-7.6 5.2 5.2 0 0 1 9.9 1.2A3.4 3.4 0 0 1 17 15.5H7Z" />
    <path d="M8.5 18.5 7.5 21M12 18.5 11 21M15.5 18.5 14.5 21" />
  </Svg>
)

export const IconBasket = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 9h17l-1.6 9.2a2 2 0 0 1-2 1.8H7.1a2 2 0 0 1-2-1.8L3.5 9Z" />
    <path d="M8 9 10 4.5M16 9 14 4.5M9 12.5v4M15 12.5v4M12 12.5v4" />
  </Svg>
)

export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" />
    <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
    <path d="M8.5 8h6M8.5 11.5h4" />
  </Svg>
)

export const IconMore = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconCrosshair = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
)

export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3.5 12.5 8.5 4.7 8.5-4.7" />
    <path d="m3.5 16.5 8.5 4.7 8.5-4.7" />
  </Svg>
)

export const IconRadar = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.6" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <path d="M12 12 18 6.2" />
  </Svg>
)

export const IconPlus = (p: P) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.3}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
)

export const IconClose = (p: P) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.1}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Svg>
)

export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
)

export const IconTrack = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M8.4 17c4.4-.6 3-4.6 1.2-6.2C7.8 9.2 9.6 6.4 15.5 6" />
  </Svg>
)

export const IconCamera = (p: P) => (
  <Svg {...p}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.4-2h7.8l1.4 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
    <circle cx="12" cy="12.5" r="3.4" />
  </Svg>
)

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
    <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
    <path d="M10.5 10v7M13.5 10v7" />
  </Svg>
)

export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Svg>
)

export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 9.5 12 16l6.5-6.5" />
  </Svg>
)

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
  </Svg>
)

export const IconCompass = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9Z" />
  </Svg>
)

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5v11M7.8 10.5 12 14.7l4.2-4.2" />
    <path d="M4.5 16.5v2.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" />
  </Svg>
)

export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M12 4.2 2.8 20h18.4L12 4.2Z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Svg>
)

export const IconStar = (p: P) => (
  <Svg {...p}>
    <path d="m12 3.8 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75-5.2 2.75 1-5.8-4.2-4.1 5.8-.85L12 3.8Z" />
  </Svg>
)
