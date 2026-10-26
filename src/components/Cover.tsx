import { memo, useId } from 'react'
import { cn } from './ui'

const PALETTES: [string, string, string][] = [
  ['#ff9a5a', '#ff4e7a', '#1d0b26'],
  ['#5ee7df', '#7b6cf6', '#0b1630'],
  ['#f6d365', '#fd7e5a', '#2a1306'],
  ['#a18cd1', '#fbc2eb', '#160d2c'],
  ['#84fab0', '#4cc9f0', '#062320'],
  ['#fccb90', '#d57eeb', '#1f0f29'],
  ['#c3b1ff', '#7ec8ff', '#0f1430'],
  ['#f093fb', '#f5576c', '#24081a'],
  ['#3ee8a0', '#2fd3e0', '#05221a'],
  ['#fa709a', '#fee140', '#2a0f08'],
  ['#3fd0d0', '#5b3fd9', '#090c26'],
  ['#ffb36b', '#ff5e62', '#260909'],
  ['#ffe29f', '#ffa99f', '#2b1610'],
  ['#9be15d', '#00b3a4', '#082018'],
]

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number) {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function coverColors(title: string, artist = '') {
  const p = PALETTES[hashStr(title + '|' + artist) % PALETTES.length]
  return { a: p[0], b: p[1], base: p[2] }
}

interface Props {
  title: string
  artist?: string
  className?: string
  showText?: boolean
}

export const Cover = memo(function Cover({ title, artist = '', className, showText = true }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const h = hashStr(title + '|' + artist)
  const r = rng(h)
  const [a, b, base] = PALETTES[h % PALETTES.length]
  const style = h % 3
  const cx1 = 15 + r() * 40
  const cy1 = 10 + r() * 40
  const cx2 = 50 + r() * 45
  const cy2 = 45 + r() * 50
  const angle = -35 + r() * 70
  const ringX = 30 + r() * 50
  const ringY = 25 + r() * 45
  const glyph = [...(title || '?').trim()][0] ?? '?'

  return (
    <div className={cn(className?.includes('absolute') ? '' : 'relative', 'overflow-hidden [container-type:inline-size]', className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <defs>
          <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="13" />
          </filter>
          <filter id={`n${id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0" />
          </filter>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
          <radialGradient id={`v${id}`} cx="0.5" cy="0.4" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill={base} />
        <g filter={`url(#b${id})`}>
          <circle cx={cx1} cy={cy1} r={34} fill={a} opacity={0.95} />
          <circle cx={cx2} cy={cy2} r={38} fill={b} opacity={0.9} />
        </g>
        {style === 0 && (
          <g transform={`rotate(${angle} 50 50)`} opacity={0.5}>
            {Array.from({ length: 6 }, (_, i) => (
              <line key={i} x1={-30} x2={130} y1={40 + i * 3.4} y2={40 + i * 3.4} stroke="#fff" strokeWidth={0.35 + (5 - i) * 0.09} />
            ))}
          </g>
        )}
        {style === 1 && (
          <g opacity={0.55} fill="none" stroke="#fff">
            <circle cx={ringX} cy={ringY} r={15} strokeWidth={0.5} />
            <circle cx={ringX} cy={ringY} r={19} strokeWidth={1.6} strokeOpacity={0.5} />
            <circle cx={ringX} cy={ringY} r={22.5} strokeWidth={0.35} />
            <circle cx={ringX} cy={ringY} r={15} fill={base} fillOpacity={0.45} stroke="none" />
          </g>
        )}
        {style === 2 && (
          <g opacity={0.45}>
            {Array.from({ length: 5 }, (_, i) => (
              <line key={i} x1={14 + i * 18} x2={14 + i * 18} y1={0} y2={100} stroke="#fff" strokeWidth={i === 0 ? 1.4 : 0.4} />
            ))}
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={23 + [1, 2, 3][i] * 18 - 18} cy={[30, 54, 72][i]} r={2.6} fill="#fff" />
            ))}
          </g>
        )}
        <rect width="100" height="100" fill={`url(#v${id})`} />
        <rect width="100" height="100" filter={`url(#n${id})`} opacity={0.9} />
      </svg>
      {showText && (
        <span
          className="pointer-events-none absolute bottom-[6%] left-[8%] select-none font-display leading-none text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
          style={{ fontSize: 'min(44cqw, 120px)', fontWeight: 600 }}
        >
          {glyph}
        </span>
      )}
    </div>
  )
})
