import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Mic, MicOff, Volume2 } from 'lucide-react'
import { PitchDetector } from '@/lib/audio/tuner'
import { audio } from '@/lib/audio/engine'
import { TUNINGS, freqToMidi, midiToNoteName, pcToName } from '@/lib/music/theory'
import { Button, cn, PageHeader, Select, Segmented } from '@/components/ui'

interface Reading {
  midi: number
  cents: number
  freq: number
  target: number
  string: number | null
}

export default function Tuner() {
  const [tuningId, setTuningId] = useState('standard')
  const tuning = TUNINGS.find((t) => t.id === tuningId)!.notes
  const [mode, setMode] = useState<'auto' | 'chromatic'>('auto')
  const [lockString, setLockString] = useState<number | null>(null)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [level, setLevel] = useState(0)
  const det = useRef<PitchDetector | null>(null)
  const smooth = useRef<{ cents: number; hist: number[] }>({ cents: 0, hist: [] })
  const cfg = useRef({ tuning, mode, lockString })
  cfg.current = { tuning, mode, lockString }

  const start = async () => {
    setErr(null)
    try {
      det.current ??= new PitchDetector()
      await det.current.start()
      setOn(true)
    } catch (e) {
      setErr((e as Error).message.includes('Permission') || (e as Error).name === 'NotAllowedError' ? '没有麦克风权限，请在浏览器地址栏允许使用麦克风' : (e as Error).message)
    }
  }
  const stop = () => {
    det.current?.stop()
    setOn(false)
    setReading(null)
  }
  useEffect(() => () => det.current?.stop(), [])

  useEffect(() => {
    if (!on) return
    let raf = 0
    let lastSeen = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const r = det.current?.read()
      if (!r) return
      setLevel((l) => l * 0.8 + Math.min(1, r.rms * 8) * 0.2)
      if (!r.freq || r.clarity < 0.88 || r.freq < 55 || r.freq > 1400) {
        if (performance.now() - lastSeen > 1500) setReading(null)
        return
      }
      lastSeen = performance.now()
      const s = smooth.current
      s.hist.push(r.freq)
      if (s.hist.length > 5) s.hist.shift()
      const freq = [...s.hist].sort((a, b) => a - b)[Math.floor(s.hist.length / 2)]
      const m = freqToMidi(freq)
      const { tuning: tn, mode: md, lockString: ls } = cfg.current
      let target: number
      let string: number | null = null
      if (ls !== null) {
        target = tn[6 - ls]
        string = ls
      } else if (md === 'auto') {
        let best = 0
        for (let i = 1; i < 6; i++) if (Math.abs(tn[i] - m) < Math.abs(tn[best] - m)) best = i
        target = tn[best]
        string = 6 - best
        if (Math.abs(target - m) > 2.5) {
          target = Math.round(m)
          string = null
        }
      } else target = Math.round(m)
      const cents = Math.max(-50, Math.min(50, (m - target) * 100))
      s.cents = s.cents * 0.65 + cents * 0.35
      setReading({ midi: m, cents: s.cents, freq, target, string })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [on])

  const inTune = reading && Math.abs(reading.cents) < 5
  const close = reading && Math.abs(reading.cents) < 15
  const color = !reading ? 'var(--fg-3)' : inTune ? 'var(--ok)' : close ? 'var(--warn)' : 'var(--err)'
  const angle = reading ? (reading.cents / 50) * 62 : 0
  const noteName = reading ? pcToName(reading.target) : '–'
  const octave = reading ? Math.floor(reading.target / 12) - 1 : ''

  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <PageHeader
        eyebrow="Tuner · A4 = 440 Hz"
        title="调音器"
        description="对着麦克风弹一根空弦，指针居中变绿就准了"
        actions={
        <>
          <Segmented
            size="sm"
            value={mode}
            onChange={(v) => {
              setMode(v)
              setLockString(null)
            }}
            options={[
              { value: 'auto', label: '吉他' },
              { value: 'chromatic', label: '半音阶' },
            ]}
          />
          <Select value={tuningId} onChange={setTuningId} size="sm" options={TUNINGS.map((t) => ({ value: t.id, label: t.name }))} />
        </>
        }
      />

      <div className="relative mx-auto mt-8 aspect-[1.3] max-w-[560px]">
        <svg viewBox="0 0 400 300" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id="tune-arc" x1="0" x2="1">
              <stop offset="0" stopColor="var(--err)" stopOpacity="0.7" />
              <stop offset="0.38" stopColor="var(--warn)" stopOpacity="0.7" />
              <stop offset="0.5" stopColor="var(--ok)" />
              <stop offset="0.62" stopColor="var(--warn)" stopOpacity="0.7" />
              <stop offset="1" stopColor="var(--err)" stopOpacity="0.7" />
            </linearGradient>
            <filter id="tune-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          {/* 刻度 */}
          {Array.from({ length: 51 }, (_, i) => {
            const c = i * 2 - 50
            const a = ((c / 50) * 62 - 90) * (Math.PI / 180)
            const major = c % 10 === 0
            const r1 = 168
            const r2 = major ? 150 : 158
            return (
              <line
                key={i}
                x1={200 + Math.cos(a) * r1}
                y1={230 + Math.sin(a) * r1}
                x2={200 + Math.cos(a) * r2}
                y2={230 + Math.sin(a) * r2}
                stroke={c === 0 ? 'var(--ok)' : 'var(--fg-3)'}
                strokeWidth={major ? 2.4 : 1.2}
                strokeLinecap="round"
                opacity={c === 0 ? 1 : major ? 0.8 : 0.45}
              />
            )
          })}
          {[-50, -25, 0, 25, 50].map((c) => {
            const a = ((c / 50) * 62 - 90) * (Math.PI / 180)
            return (
              <text key={c} x={200 + Math.cos(a) * 186} y={230 + Math.sin(a) * 186 + 4} textAnchor="middle" fontSize="11" fill="var(--fg-3)" fontWeight="600">
                {c > 0 ? `+${c}` : c}
              </text>
            )
          })}
          <path d={arc(200, 230, 140, -62, 62)} fill="none" stroke="url(#tune-arc)" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
          {/* 指针 */}
          <motion.g animate={{ rotate: angle }} transition={{ type: 'spring', stiffness: 140, damping: 18 }} style={{ originX: '200px', originY: '230px' }}>
            <line x1="200" y1="230" x2="200" y2="70" stroke={color} strokeWidth="10" strokeLinecap="round" filter="url(#tune-glow)" opacity="0.5" />
            <line x1="200" y1="230" x2="200" y2="70" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
          </motion.g>
          <circle cx="200" cy="230" r="9" fill={color} />
          <circle cx="200" cy="230" r="4" fill="var(--bg)" />
        </svg>
        <div className="absolute inset-x-0 bottom-[2%] flex flex-col items-center">
          <div className="flex items-start font-display leading-none" style={{ color: reading ? 'var(--fg)' : 'var(--fg-3)' }}>
            <span className="text-[84px] font-semibold tracking-tight sm:text-[104px]">{noteName}</span>
            <span className="mt-3 text-2xl font-medium text-fg-3">{octave}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm tabular-nums" style={{ color }}>
            {reading ? (
              <>
                <span className="font-semibold">
                  {reading.cents > 0 ? '+' : ''}
                  {reading.cents.toFixed(0)} 音分
                </span>
                <span className="text-fg-3">{reading.freq.toFixed(1)} Hz</span>
                {!inTune && <span>{reading.cents < 0 ? '偏低，拧紧' : '偏高，放松'}</span>}
              </>
            ) : (
              <span className="text-fg-3">{on ? '请弹一根弦…' : '点击下方开始'}</span>
            )}
          </div>
        </div>
        {inTune && <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--ok)_14%,transparent),transparent)]" />}
      </div>

      {/* 琴弦 */}
      <div className="mx-auto mt-8 grid max-w-xl grid-cols-6 gap-2">
        {[6, 5, 4, 3, 2, 1].map((s) => {
          const midi = tuning[6 - s]
          const active = reading?.string === s
          const locked = lockString === s
          return (
            <button
              key={s}
              onClick={() => {
                audio.previewNote(midi, s)
                if (mode === 'auto') setLockString(locked ? null : s)
              }}
              className={cn(
                'group relative flex flex-col items-center gap-1 rounded-2xl border py-3 transition',
                locked ? 'border-accent bg-accent-soft' : active ? (inTune ? 'border-ok bg-[color-mix(in_oklab,var(--ok)_12%,transparent)]' : 'border-line-3 bg-surface-2') : 'border-line bg-surface hover:border-line-2',
              )}
            >
              <span className="text-[10px] text-fg-3">{s} 弦</span>
              <span className="text-lg font-bold">{midiToNoteName(midi).replace(/\d+$/, '')}</span>
              <span className="text-[10px] text-fg-3">{midiToNoteName(midi).match(/\d+$/)?.[0]}</span>
              <Volume2 className="absolute right-1.5 top-1.5 size-3 text-fg-3 opacity-0 transition group-hover:opacity-100" />
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-center text-xs text-fg-3">{mode === 'auto' ? '点击琴弦可听标准音，并锁定只调这根弦' : '半音阶模式会显示最接近的任意音'}</p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-line-2">
          <div className="h-full rounded-full bg-accent-gradient transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
        </div>
        {on ? (
          <Button size="lg" variant="secondary" icon={<MicOff className="size-5" />} onClick={stop}>
            停止
          </Button>
        ) : (
          <Button size="lg" variant="primary" icon={<Mic className="size-5" />} onClick={start}>
            开始调音
          </Button>
        )}
        {err && <div className="max-w-md text-center text-sm text-err">{err}</div>}
      </div>
    </div>
  )
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180
    return [cx + Math.cos(rad) * r, cy + Math.sin(rad) * r]
  }
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`
}
