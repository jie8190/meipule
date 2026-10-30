import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, Play, Square, Hand } from 'lucide-react'
import { audio } from '@/lib/audio/engine'
import { isTouch } from '@/lib/native'
import { Slider, cn, PageHeader, Segmented } from '@/components/ui'

const MARKINGS: [number, string, string][] = [
  [40, 'Grave', '庄板'],
  [60, 'Largo', '广板'],
  [66, 'Adagio', '柔板'],
  [76, 'Andante', '行板'],
  [108, 'Moderato', '中板'],
  [120, 'Allegro', '快板'],
  [168, 'Presto', '急板'],
]

function marking(bpm: number) {
  let m = MARKINGS[0]
  for (const x of MARKINGS) if (bpm >= x[0]) m = x
  return m
}

type Accent = 2 | 1 | 0 // 强 / 普通 / 静音

export default function Metronome() {
  const [bpm, setBpm] = useState(() => Number(localStorage.getItem('meipule:metro:bpm')) || 90)
  const [beats, setBeats] = useState(4)
  const [sub, setSub] = useState<1 | 2 | 3 | 4>(1)
  const [accents, setAccents] = useState<Accent[]>([2, 1, 1, 1])
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(-1)
  const pendulum = useRef<SVGGElement>(null)
  const state = useRef({ next: 0, beatIdx: 0, subIdx: 0, start: 0 })
  const cfg = useRef({ bpm, beats, sub, accents })
  cfg.current = { bpm, beats, sub, accents }
  const taps = useRef<number[]>([])

  useEffect(() => localStorage.setItem('meipule:metro:bpm', String(bpm)), [bpm])
  useEffect(() => {
    setAccents((a) => Array.from({ length: beats }, (_, i) => a[i] ?? (i === 0 ? 2 : 1)))
  }, [beats])

  // 调度
  useEffect(() => {
    if (!running) return
    const ctx = audio.ensure()
    state.current = { next: ctx.currentTime + 0.1, beatIdx: 0, subIdx: 0, start: ctx.currentTime + 0.1 }
    const visual: { t: number; beat: number }[] = []
    const timer = window.setInterval(() => {
      const { bpm: b, beats: n, sub: sb, accents: ac } = cfg.current
      const st = state.current
      const step = 60 / b / sb
      while (st.next < ctx.currentTime + 0.12) {
        const a = ac[st.beatIdx % n] ?? 1
        if (st.subIdx === 0) {
          if (a > 0) audio.click(st.next, a === 2 ? 2 : 0)
          visual.push({ t: st.next, beat: st.beatIdx % n })
        } else if (a > 0) audio.click(st.next, 1)
        st.next += step
        st.subIdx++
        if (st.subIdx >= sb) {
          st.subIdx = 0
          st.beatIdx = (st.beatIdx + 1) % n
        }
      }
    }, 20)
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = ctx.currentTime
      while (visual.length && visual[0].t <= now) {
        setBeat(visual[0].beat)
        visual.shift()
      }
      // 摆锤：每拍从一侧摆到另一侧
      const period = 60 / cfg.current.bpm
      const phase = (now - state.current.start) / period
      const ang = Math.sin(((phase % 2) - 0.5) * Math.PI) * 26
      if (pendulum.current) pendulum.current.style.transform = `rotate(${ang}deg)`
    }
    raf = requestAnimationFrame(loop)
    return () => {
      window.clearInterval(timer)
      cancelAnimationFrame(raf)
      setBeat(-1)
      if (pendulum.current) pendulum.current.style.transform = 'rotate(0deg)'
    }
  }, [running])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setRunning((r) => !r)
      } else if (e.key === 'ArrowUp') setBpm((b) => Math.min(260, b + 1))
      else if (e.key === 'ArrowDown') setBpm((b) => Math.max(30, b - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tap = () => {
    const now = performance.now()
    const t = taps.current.filter((x) => now - x < 2500)
    t.push(now)
    taps.current = t
    if (t.length >= 2) {
      const iv = (t[t.length - 1] - t[0]) / (t.length - 1)
      setBpm(Math.max(30, Math.min(260, Math.round(60000 / iv))))
    }
  }

  const mk = marking(bpm)
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <PageHeader
        eyebrow="Metronome · BPM"
        title="节拍器"
        description={isTouch ? '点节拍圆点切换强拍 / 弱拍 / 静音' : '空格 开始/停止 · ↑↓ 调速度 · 点击节拍圆点切换强弱'}
      />

      <div className="card relative mt-8 overflow-hidden px-6 pb-8 pt-10">
        <div className="pointer-events-none absolute -top-40 left-1/2 size-[28rem] -translate-x-1/2 bg-[radial-gradient(closest-side,var(--accent),transparent)] opacity-[0.14]" />
        <svg viewBox="0 0 300 150" className="mx-auto block h-40 w-full max-w-sm overflow-visible">
          <path d="M60 140 L240 140 L190 10 L110 10 Z" fill="color-mix(in oklab, var(--fg) 4%, transparent)" stroke="var(--line-2)" />
          <g ref={pendulum} style={{ transformOrigin: '150px 140px', transition: running ? 'none' : 'transform .5s' }}>
            <line x1="150" y1="140" x2="150" y2="18" stroke="var(--fg-2)" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="141" y={40 + (1 - (bpm - 30) / 230) * 70} width="18" height="12" rx="3" fill="var(--accent)" />
          </g>
          <circle cx="150" cy="140" r="5" fill="var(--fg-2)" />
        </svg>

        <div className="mt-2 flex items-center justify-center gap-6">
          <button aria-label="减慢" onClick={() => setBpm((b) => Math.max(30, b - 1))} className="flex size-12 items-center justify-center rounded-full border border-line-2 text-fg-2 transition hover:text-fg active:scale-90">
            <Minus className="size-5" />
          </button>
          <div className="text-center">
            <div className="font-display text-[88px] font-semibold leading-none tabular-nums tracking-tight">{bpm}</div>
            <div className="mt-1 text-sm text-fg-3">
              BPM · {mk[2]} <span className="italic">{mk[1]}</span>
            </div>
          </div>
          <button aria-label="加快" onClick={() => setBpm((b) => Math.min(260, b + 1))} className="flex size-12 items-center justify-center rounded-full border border-line-2 text-fg-2 transition hover:text-fg active:scale-90">
            <Plus className="size-5" />
          </button>
        </div>
        <div className="mx-auto mt-5 max-w-md">
          <Slider value={bpm} min={30} max={260} onChange={setBpm} label="速度" />
        </div>

        <div className="mt-8 flex justify-center gap-3">
          {accents.map((a, i) => (
            <button
              key={i}
              onClick={() => setAccents(accents.map((x, j) => (j === i ? (((x + 2) % 3) as Accent) : x)))}
              className={cn(
                'relative flex size-11 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-100',
                a === 0 ? 'border-dashed border-line-2 text-fg-3' : a === 2 ? 'border-accent text-accent' : 'border-line-3 text-fg-2',
                beat === i && a > 0 && 'scale-110 !border-transparent bg-accent-gradient !text-accent-fg shadow-[0_0_30px_var(--accent-glow)]',
                beat === i && a === 0 && 'scale-105 bg-[color-mix(in_oklab,var(--fg)_10%,transparent)]',
              )}
              title="点击切换：强拍 / 弱拍 / 静音"
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Segmented
            size="sm"
            value={beats}
            onChange={setBeats}
            options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n} 拍` }))}
          />
          <Segmented
            size="sm"
            value={sub}
            onChange={setSub}
            options={[
              { value: 1, label: '♩' },
              { value: 2, label: '♫' },
              { value: 3, label: '三连' },
              { value: 4, label: '十六' },
            ]}
          />
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button onClick={tap} className="flex h-14 items-center gap-2 rounded-2xl border border-line-2 px-5 text-sm font-semibold text-fg-2 transition hover:text-fg active:scale-95">
            <Hand className="size-4" /> 打拍子测速
          </button>
          <button
            onClick={() => setRunning(!running)}
            className="flex h-14 w-36 items-center justify-center gap-2 rounded-2xl bg-accent-gradient text-[15px] font-semibold text-accent-fg shadow-[0_6px_18px_-8px_var(--accent-glow)] transition active:scale-95"
          >
            {running ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            {running ? '停止' : '开始'}
          </button>
        </div>
      </div>
    </div>
  )
}
