import { memo } from 'react'
import { diagramBaseFret, type ChordShape } from '@/lib/music/chords'

interface GlyphProps {
  shape: ChordShape | null
  /** 中心 x、顶部 y */
  x: number
  y: number
  w: number
  h: number
  frets?: number
  fingers?: boolean
  /** 低于这个尺寸时简化细节 */
  compact?: boolean
}

/** SVG 内部使用的和弦图（不含外层 <svg>） */
export function DiagramGlyph({ shape, x, y, w, h, frets: nFrets = 4, fingers = false, compact = true }: GlyphProps) {
  const markerH = h * 0.17
  const gridTop = y + markerH
  const gridH = h - markerH
  const left = x - w / 2
  const sp = w / 5
  const fh = gridH / nFrets
  const lineW = compact ? 0.8 : 1.1
  if (!shape) {
    return (
      <g opacity={0.5}>
        <rect x={left} y={gridTop} width={w} height={gridH} rx={3} fill="none" stroke="var(--score-line)" strokeDasharray="2 2" />
        <text x={x} y={gridTop + gridH / 2 + 4} textAnchor="middle" fontSize={h * 0.28} fill="var(--score-dim)">
          ?
        </text>
      </g>
    )
  }
  const base = diagramBaseFret(shape.frets, nFrets)
  const r = Math.min(sp, fh) * (compact ? 0.36 : 0.38)
  const els: React.ReactNode[] = []
  // 品格
  for (let i = 0; i <= nFrets; i++) {
    const yy = gridTop + i * fh
    els.push(<line key={`f${i}`} x1={left} x2={left + w} y1={yy} y2={yy} stroke="var(--score-dgrid)" strokeWidth={lineW} />)
  }
  for (let i = 0; i < 6; i++) {
    const xx = left + i * sp
    els.push(<line key={`s${i}`} x1={xx} x2={xx} y1={gridTop} y2={gridTop + gridH} stroke="var(--score-dgrid)" strokeWidth={lineW} />)
  }
  if (base === 1) {
    els.push(
      <rect key="nut" x={left - lineW / 2} y={gridTop - (compact ? 2 : 3)} width={w + lineW} height={compact ? 2.4 : 3.6} rx={1} fill="var(--score-ink)" />,
    )
  } else {
    els.push(
      <text key="base" x={left - (compact ? 3 : r + 6)} y={gridTop + fh * 0.5 + (compact ? 3 : 4.5)} textAnchor="end" fontSize={compact ? fh * 0.95 : fh * 0.62} fontWeight={600} fill="var(--score-dim)">
        {base}
      </text>,
    )
  }
  // 横按
  if (shape.barre) {
    const row = shape.barre.fret - base
    if (row >= 0 && row < nFrets) {
      const x1 = left + shape.barre.from * sp
      const x2 = left + shape.barre.to * sp
      const cy = gridTop + (row + 0.5) * fh
      els.push(<rect key="barre" x={x1 - r} y={cy - r} width={x2 - x1 + 2 * r} height={2 * r} rx={r} fill="var(--score-dot)" />)
    }
  }
  shape.frets.forEach((f, i) => {
    const xx = left + i * sp
    if (f < 0) {
      const s = Math.min(sp, markerH) * 0.32
      const cy = y + markerH * 0.45
      els.push(
        <g key={`m${i}`} stroke="var(--score-dim)" strokeWidth={compact ? 0.9 : 1.3} strokeLinecap="round">
          <line x1={xx - s} y1={cy - s} x2={xx + s} y2={cy + s} />
          <line x1={xx - s} y1={cy + s} x2={xx + s} y2={cy - s} />
        </g>,
      )
    } else if (f === 0) {
      const s = Math.min(sp, markerH) * 0.3
      els.push(<circle key={`o${i}`} cx={xx} cy={y + markerH * 0.45} r={s} fill="none" stroke="var(--score-dim)" strokeWidth={compact ? 0.9 : 1.3} />)
    } else {
      const row = f - base
      if (row < 0 || row >= nFrets) return
      const onBarre = shape.barre && f === shape.barre.fret && i >= shape.barre.from && i <= shape.barre.to
      const cy = gridTop + (row + 0.5) * fh
      if (!onBarre) els.push(<circle key={`d${i}`} cx={xx} cy={cy} r={r} fill="var(--score-dot)" />)
      const fg = shape.fingers?.[i]
      if (fingers && fg && (!onBarre || i === shape.barre!.from)) {
        els.push(
          <text key={`t${i}`} x={xx} y={cy + r * 0.42} textAnchor="middle" fontSize={r * 1.25} fontWeight={700} fill="var(--score-dot-ink)">
            {fg}
          </text>,
        )
      }
    }
  })
  return <g>{els}</g>
}

interface DiagramProps {
  name?: string
  shape: ChordShape | null
  size?: number
  fingers?: boolean
  className?: string
  frets?: number
}

/** 独立的和弦图组件 */
export const ChordDiagram = memo(function ChordDiagram({ name, shape, size = 96, fingers = true, className, frets = 5 }: DiagramProps) {
  const w = size * 0.62
  const h = size * 0.78
  const nameH = name ? size * 0.24 : 0
  const pad = size * 0.16
  const W = w + pad * 2
  const H = h + nameH + size * 0.06
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} role="img" aria-label={name ? `${name} 和弦图` : '和弦图'}>
      {name && (
        <text x={W / 2} y={nameH * 0.78} textAnchor="middle" fontSize={nameH * 0.82} fontWeight={700} fill="var(--score-chord)">
          {name}
        </text>
      )}
      <DiagramGlyph shape={shape} x={W / 2} y={nameH + 2} w={w} h={h} frets={frets} fingers={fingers} compact={size < 70} />
    </svg>
  )
})
