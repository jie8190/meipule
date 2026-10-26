import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { CompiledLinesSection, Score } from '@/lib/notation/types'
import { player } from '@/lib/audio/player'
import { layoutScore, tickToX, type LayoutOptions, type ScoreLayout } from './layout'
import { ScoreSystem } from './ScoreSystem'
import { cn } from '../ui'

export interface ScoreViewProps {
  score: Score
  opts: Omit<LayoutOptions, 'width'>
  scrollRef?: RefObject<HTMLElement | null>
  selection?: [number, number] | null
  onSelect?: (sel: [number, number] | null) => void
  onSeek?: (measure: number) => void
  onPlayFrom?: (measure: number) => void
  onChordClick?: (name: string) => void
  follow?: boolean
  className?: string
  /** 内边距（px），左右；手机等窄屏自动收窄到 6px，把宽度留给谱面 */
  pad?: number
}

export function ScoreView({
  score,
  opts,
  scrollRef,
  selection,
  onSelect,
  onSeek,
  onPlayFrom,
  onChordClick,
  follow = true,
  className,
  pad = 28,
}: ScoreViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [padX, setPadX] = useState(pad)
  const sysRefs = useRef<(HTMLDivElement | null)[]>([])
  const cursorRef = useRef<HTMLDivElement>(null)
  const hiRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(follow)
  followRef.current = follow

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const p = el.clientWidth < 520 ? Math.min(pad, 6) : pad
      setPadX(p)
      const w = Math.floor(el.clientWidth - p * 2)
      // 宽度变化小于 4px 不重排，避免滚动条抖动
      setWidth((old) => (Math.abs(old - w) < 4 ? old : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pad])

  const layout: ScoreLayout | null = useMemo(
    () => (width > 0 ? layoutScore(score, { ...opts, width }) : null),
    [score, width, opts.scale, opts.showTab, opts.showDiagrams, opts.showChordNames, opts.showMelody, opts.showLyrics, opts.hiddenTracks], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // 系统按段落分组，和弦歌词段按原顺序插入
  const blocks = useMemo(() => {
    if (!layout) return []
    const out: ({ kind: 'systems'; idx: number[] } | { kind: 'lines'; sec: CompiledLinesSection })[] = []
    for (const sec of score.sections) {
      if (sec.kind === 'lines') out.push({ kind: 'lines', sec })
      else out.push({ kind: 'systems', idx: layout.systems.filter((s) => s.section === sec.index).map((s) => s.index) })
    }
    return out
  }, [layout, score])

  // ---------- 播放光标 ----------
  useEffect(() => {
    if (!layout) return
    let raf = 0
    let lastSys = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const cursor = cursorRef.current
      const hi = hiRef.current
      if (!cursor || !hi) return
      const active = player.score === score && (player.status === 'playing' || player.restTick > 0)
      const pos = active ? player.currentMeasurePos() : null
      if (!pos) {
        cursor.style.opacity = '0'
        hi.style.opacity = '0'
        lastSys = -1
        return
      }
      const si = layout.measureSystem.get(pos.measure)
      if (si === undefined) return
      const sys = layout.systems[si]
      const ml = sys.measures.find((m) => m.index === pos.measure)
      const el = sysRefs.current[si]
      if (!ml || !el) return
      const m = score.measures[pos.measure]
      const x = tickToX(ml, m.ticks, pos.offset)
      const top = el.offsetTop + sys.rows.chord
      const h = Math.max(40, sys.rows.bottom - sys.rows.chord + 6)
      cursor.style.opacity = player.status === 'playing' ? '1' : '0.55'
      cursor.style.height = `${h}px`
      cursor.style.transform = `translate3d(${el.offsetLeft + x - 1}px, ${top}px, 0)`
      hi.style.opacity = '1'
      hi.style.height = `${h + 8}px`
      hi.style.width = `${ml.endX - ml.x - ml.lead}px`
      hi.style.transform = `translate3d(${el.offsetLeft + ml.x + ml.lead}px, ${top - 4}px, 0)`
      if (si !== lastSys) {
        lastSys = si
        const sc = scrollRef?.current
        if (sc && followRef.current && player.status === 'playing') {
          const scRect = sc.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const target = sc.scrollTop + (elRect.top - scRect.top) - sc.clientHeight * 0.26
          sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [layout, score, scrollRef])

  // ---------- 点击选择小节 ----------
  const hitMeasure = useCallback(
    (si: number, clientX: number): number | null => {
      if (!layout) return null
      const el = sysRefs.current[si]
      if (!el) return null
      const x = clientX - el.getBoundingClientRect().left
      const sys = layout.systems[si]
      for (const m of sys.measures) if (x >= m.x && x < m.endX) return m.index
      return null
    },
    [layout],
  )

  /** 从当前选区的起点扩展到第 mi 小节（Shift+点击 / 触屏长按） */
  const extendTo = (mi: number) => {
    if (!onSelect) return
    const anchor = selection ? selection[0] : mi
    onSelect([Math.min(anchor, mi), Math.max(anchor, mi)])
  }

  // 触屏长按：手机上没有 Shift 键，长按另一个小节来选择循环区间
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)
  const onPressStart = (si: number, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !onSelect) return
    const clientX = e.clientX
    const state = { x: e.clientX, y: e.clientY, fired: false, timer: 0 }
    state.timer = window.setTimeout(() => {
      const mi = hitMeasure(si, clientX)
      if (mi === null) return
      state.fired = true
      extendTo(mi)
      navigator.vibrate?.(12)
    }, 450)
    press.current = state
  }
  const onPressMove = (e: React.PointerEvent) => {
    const st = press.current
    if (st && !st.fired && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) {
      clearTimeout(st.timer)
      press.current = null
    }
  }
  const onPressEnd = () => {
    if (press.current && !press.current.fired) {
      clearTimeout(press.current.timer)
      press.current = null
    }
  }

  const onSysClick = (si: number, e: React.MouseEvent) => {
    // 长按已经处理过选区，忽略随后的这次点击
    if (press.current?.fired) {
      press.current = null
      return
    }
    const mi = hitMeasure(si, e.clientX)
    if (mi === null) return
    if (e.shiftKey && onSelect) {
      extendTo(mi)
      return
    }
    if (onSelect && selection && selection[0] === mi && selection[1] === mi) {
      onSelect(null)
    } else onSelect?.([mi, mi])
    onSeek?.(mi)
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)} style={{ paddingLeft: padX, paddingRight: padX }}>
      <div ref={hiRef} className="pointer-events-none absolute left-0 top-0 z-[2] rounded-lg bg-[color-mix(in_oklab,var(--accent)_9%,transparent)] opacity-0 mix-blend-normal ring-1 ring-[color-mix(in_oklab,var(--accent)_22%,transparent)] transition-opacity" />
      <div ref={cursorRef} className="play-cursor opacity-0" />
      {layout &&
        blocks.map((b, bi) =>
          b.kind === 'lines' ? (
            <ChordLyrics key={`l${bi}`} sec={b.sec} onChordClick={onChordClick} scale={opts.scale} />
          ) : (
            <Fragment key={`s${bi}`}>
              {b.idx.map((si) => {
                const sys = layout.systems[si]
                return (
                  <div
                    key={si}
                    ref={(el) => {
                      sysRefs.current[si] = el
                    }}
                    className="relative cursor-pointer"
                    onClick={(e) => onSysClick(si, e)}
                    onPointerDown={(e) => onPressStart(si, e)}
                    onPointerMove={onPressMove}
                    onPointerUp={onPressEnd}
                    onPointerCancel={onPressEnd}
                    onContextMenu={(e) => onSelect && e.preventDefault()}
                    onDoubleClick={(e) => {
                      const mi = hitMeasure(si, e.clientX)
                      if (mi !== null) onPlayFrom?.(mi)
                    }}
                  >
<ScoreSystem score={score} sys={sys} layout={layout} opts={{ ...opts, width }} onChordClick={onChordClick} />
                    {selection &&
                      sys.measures
                        .filter((m) => m.index >= selection[0] && m.index <= selection[1])
                        .map((m) => (
                          <div
                            key={m.index}
                            className="pointer-events-none absolute z-[1] rounded-md bg-[color-mix(in_oklab,var(--ai-1)_10%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--ai-1)_50%,transparent)]"
                            style={{ left: m.x + m.lead, width: m.endX - m.x - m.lead, top: sys.rows.chord - 2, height: sys.rows.bottom - sys.rows.chord + 10 }}
                          />
                        ))}
                                      </div>
                )
              })}
            </Fragment>
          ),
        )}
    </div>
  )
}

/** 和弦歌词谱段落（HTML 渲染，可自动换行） */
export function ChordLyrics({ sec, onChordClick, scale = 1 }: { sec: CompiledLinesSection; onChordClick?: (n: string) => void; scale?: number }) {
  return (
    <div className="pb-6 pt-1" style={{ fontSize: 18 * scale }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full px-3 py-1 text-[0.78em] font-semibold" style={{ background: 'var(--score-label-bg)', color: 'var(--score-label-ink)' }}>
          {sec.name}
        </span>
        {sec.note && <span className="text-[0.72em]" style={{ color: 'var(--score-dim)' }}>{sec.note}</span>}
      </div>
      <div className="space-y-1.5">
        {sec.lines.map((line, i) => {
          if (line.kind === 'blank') return <div key={i} className="h-3" />
          if (line.kind === 'heading')
            return (
              <div key={i} className="pt-2 text-[0.8em] font-semibold" style={{ color: 'var(--score-dim)' }}>
                {line.text}
              </div>
            )
          if (line.kind === 'chords')
            return (
              <div key={i} className="flex flex-wrap items-center gap-x-1 py-1 font-bold" style={{ color: 'var(--score-chord)' }}>
                <span style={{ color: 'var(--score-bar)' }}>|</span>
                {line.segments.map((s, j) => (
                  <Fragment key={j}>
                    <button className="min-w-10 rounded-md px-1.5 text-left hover:bg-accent-soft" onClick={() => s.chord && onChordClick?.(s.chord)}>
                      {s.chord ?? s.text}
                    </button>
                    <span style={{ color: 'var(--score-bar)' }}>|</span>
                  </Fragment>
                ))}
              </div>
            )
          return (
            <div key={i} className="flex flex-wrap items-end">
              {line.segments.flatMap((seg, j) => {
                const units = splitUnits(seg.text)
                if (!units.length) units.push(' ')
                // 和弦浮在字上方；只有当和弦比这一段歌词还宽、会撞到下一个和弦时才补空白
                const next = line.segments[j + 1]
                const chordEm = seg.chord ? seg.chord.length * 0.85 * 0.62 + 0.45 : 0
                const textEm = units.reduce((a, u) => a + unitEm(u), 0)
                const pad = next?.chord ? Math.max(0, chordEm - textEm) : 0
                return units.map((u, k) => (
                  <span key={`${j}-${k}`} className="relative inline-flex flex-col" style={k === units.length - 1 && pad ? { paddingRight: `${pad}em` } : undefined}>
                    <span className="h-[1.35em] text-[0.85em] font-bold leading-[1.35em]" style={{ color: 'var(--score-chord)' }}>
                      {k === 0 && seg.chord && (
                        <button className="absolute left-0 top-0 -ml-0.5 whitespace-nowrap rounded px-0.5 hover:bg-accent-soft" onClick={() => onChordClick?.(seg.chord!)}>
                          {seg.chord}
                        </button>
                      )}
                    </span>
                    <span className="whitespace-pre text-[1.08em] leading-[1.5]" style={{ color: 'var(--score-lyric)' }}>
                      {u}
                    </span>
                  </span>
                ))
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 估算一个歌词单元的宽度（em，按 1.08em 字号） */
function unitEm(u: string): number {
  let w = 0
  for (const ch of u) w += /[㐀-鿿豈-﫿，。、！？；：]/.test(ch) ? 1.08 : 0.6
  return w
}

function splitUnits(text: string): string[] {
  return text.match(/[㐀-鿿豈-﫿][，。、！？；：,.!?]*|[^\s㐀-鿿]+\s*|\s+/g) ?? []
}
