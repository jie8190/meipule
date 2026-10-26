import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Play,
  Pause,
  SkipBack,
  Repeat,
  Minus,
  Plus,
  Metronome,
  ChevronsDown,
  Guitar,
  Mic2,
  Timer,
  Type,
  KeyRound,
  SlidersHorizontal,
} from 'lucide-react'
import { player } from '@/lib/audio/player'
import { useSettings } from '@/store/settings'
import { cn, IconButton, Popover, Slider, Switch } from './ui'

export function usePlayerStatus() {
  return useSyncExternalStore(
    (cb) => player.subscribe(cb),
    () => player.status,
  )
}

function ProgressBar() {
  const fill = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const tl = player.timeline
      if (!fill.current || !tl || !tl.total) return
      const t = player.getTick() ?? 0
      fill.current.style.transform = `scaleX(${Math.min(1, t / tl.total)})`
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      ref={bar}
      className="group absolute inset-x-6 top-0 h-3 -translate-y-1/2 cursor-pointer"
      onClick={(e) => {
        const tl = player.timeline
        if (!tl || !bar.current) return
        const r = bar.current.getBoundingClientRect()
        const f = (e.clientX - r.left) / r.width
        const tick = f * tl.total
        const pm = tl.order.find((p) => tick >= p.start && tick < p.start + p.len)
        if (pm) player.seekMeasure(pm.measure)
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-line-2 transition-all group-hover:h-[5px]">
        <div ref={fill} className="h-full w-full origin-left bg-accent-gradient" style={{ transform: 'scaleX(0)' }} />
      </div>
    </div>
  )
}

export interface DockProps {
  speed: number
  onSpeed: (v: number) => void
  tempo: number
  loopOn: boolean
  canLoop: boolean
  onLoop: () => void
  autoScroll: boolean
  onAutoScroll: () => void
  transpose: ReactNode
  transposeLabel: string
  display: ReactNode
  hasTimeline: boolean
  /** 多轨曲谱的音轨混音（放在声音面板顶部） */
  tracks?: ReactNode
}

export function PlayerDock(p: DockProps) {
  const status = usePlayerStatus()
  const playing = status === 'playing'
  const s = useSettings()
  const speedPct = Math.round(p.speed * 100)

  const soundPanel = (
    <div className="max-h-[70dvh] w-72 space-y-1 overflow-y-auto p-2">
      {p.tracks}
      {[
        { icon: Guitar, label: '吉他伴奏', key: 'playGuitar' as const, vol: 'guitar' as const },
        { icon: Mic2, label: '旋律引导', key: 'playMelody' as const, vol: 'melody' as const },
        { icon: Metronome, label: '节拍器', key: 'metronome' as const, vol: 'click' as const },
      ].map((r) => (
        <div key={r.key} className="rounded-xl px-2 py-2 hover:bg-[color-mix(in_oklab,var(--fg)_4%,transparent)]">
          <div className="flex items-center gap-3">
            <r.icon className="size-4 text-fg-2" />
            <span className="flex-1 text-[13px] font-medium">{r.label}</span>
            <Switch checked={s[r.key]} onChange={(v) => s.set({ [r.key]: v })} />
          </div>
          <Slider
            className="mt-1"
            label={`${r.label}音量`}
            value={s.volumes[r.vol]}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => s.set({ volumes: { ...s.volumes, [r.vol]: v } })}
          />
        </div>
      ))}
      <label className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[color-mix(in_oklab,var(--fg)_4%,transparent)]">
        <Timer className="size-4 text-fg-2" />
        <span className="flex-1 text-[13px] font-medium">开始前预备一小节</span>
        <Switch checked={s.countIn} onChange={(v) => s.set({ countIn: v })} />
      </label>
      <label className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[color-mix(in_oklab,var(--fg)_4%,transparent)]">
        <ChevronsDown className="size-4 text-fg-2" />
        <span className="flex-1 text-[13px] font-medium">播放时谱面跟随</span>
        <Switch checked={s.followCursor} onChange={(v) => s.set({ followCursor: v })} />
      </label>
    </div>
  )

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
      className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(12px+var(--sab))] sm:pb-5"
    >
      <div className="glass pointer-events-auto relative flex w-full max-w-[860px] items-center gap-1 rounded-[26px] border border-line-2 px-2.5 py-2 shadow-[var(--shadow-lg)] sm:gap-1.5 sm:px-3">
        {p.hasTimeline && <ProgressBar />}
        {!p.hasTimeline ? (
          <>
            <button
              aria-label={p.autoScroll ? '停止滚动' : '自动滚动'}
              onClick={p.onAutoScroll}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-gradient text-accent-fg shadow-[0_8px_24px_-6px_var(--accent-glow)] transition active:scale-90"
            >
              {p.autoScroll && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-20" style={{ animationDuration: '2s' }} />}
              {p.autoScroll ? <Pause className="size-5 fill-current" /> : <ChevronsDown className="size-5" />}
            </button>
            <div className="ml-1 flex items-center rounded-2xl bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] p-0.5">
              <IconButton size="sm" label="滚得慢一点" onClick={() => s.set({ autoScrollSpeed: Math.max(6, s.autoScrollSpeed - 4) })}>
                <Minus className="size-3.5" />
              </IconButton>
              <div className="flex w-[64px] flex-col items-center leading-none">
                <span className="text-[13px] font-bold">{p.autoScroll ? '滚动中' : '自动滚动'}</span>
                <span className="mt-0.5 text-[10px] tabular-nums text-fg-3">速度 {s.autoScrollSpeed}</span>
              </div>
              <IconButton size="sm" label="滚得快一点" onClick={() => s.set({ autoScrollSpeed: Math.min(120, s.autoScrollSpeed + 4) })}>
                <Plus className="size-3.5" />
              </IconButton>
            </div>
            <div className="flex-1" />
          </>
        ) : (
          <>
        <IconButton label="回到开头" onClick={() => player.stop()} className="hidden sm:inline-flex" disabled={!p.hasTimeline}>
          <SkipBack className="size-[18px]" />
        </IconButton>
        <button
          aria-label={playing ? '暂停' : '播放'}
          disabled={!p.hasTimeline}
          onClick={() => player.toggle()}
          className={cn(
            'relative flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-gradient text-accent-fg shadow-[0_8px_24px_-6px_var(--accent-glow)] transition active:scale-90 disabled:opacity-40',
          )}
        >
          {playing && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-20" style={{ animationDuration: '2s' }} />}
          {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </button>

        {/* 速度 */}
        <div className="ml-1 flex items-center rounded-2xl bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] p-0.5">
          <IconButton size="sm" className="hidden sm:inline-flex" label="减速" onClick={() => p.onSpeed(Math.max(0.3, +(p.speed - 0.05).toFixed(2)))}>
            <Minus className="size-3.5" />
          </IconButton>
          <Popover
            side="top"
            align="center"
            trigger={({ toggle }) => (
              <button onClick={toggle} className="flex h-9 w-[62px] flex-col items-center justify-center leading-none sm:w-[70px]" title="速度">
                <span className="text-[13px] font-bold tabular-nums">{speedPct}%</span>
                <span className="mt-0.5 text-[10px] tabular-nums text-fg-3">♩={Math.round(p.tempo * p.speed)}</span>
              </button>
            )}
          >
            <div className="w-64 p-3">
              <div className="mb-2 flex justify-between text-xs text-fg-2">
                <span>练习速度</span>
                <span className="tabular-nums">
                  {speedPct}% · {Math.round(p.tempo * p.speed)} BPM
                </span>
              </div>
              <Slider value={p.speed} min={0.3} max={1.6} step={0.05} onChange={p.onSpeed} label="速度" />
              <div className="mt-2 grid grid-cols-5 gap-1">
                {[0.5, 0.75, 0.9, 1, 1.25].map((v) => (
                  <button
                    key={v}
                    onClick={() => p.onSpeed(v)}
                    className={cn('h-7 rounded-lg text-xs font-medium', p.speed === v ? 'bg-accent text-accent-fg' : 'bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg-2')}
                  >
                    {Math.round(v * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </Popover>
          <IconButton size="sm" className="hidden sm:inline-flex" label="加速" onClick={() => p.onSpeed(Math.min(1.6, +(p.speed + 0.05).toFixed(2)))}>
            <Plus className="size-3.5" />
          </IconButton>
        </div>

        <div className="flex-1" />

        <IconButton label={p.canLoop ? 'AB 循环所选小节（L）' : '先点选小节（Shift 多选）再循环'} active={p.loopOn} onClick={p.onLoop} disabled={!p.canLoop && !p.loopOn}>
          <Repeat className="size-[18px]" />
        </IconButton>
        <IconButton label="自动滚动（无伴奏时）" active={p.autoScroll} onClick={p.onAutoScroll}>
          <ChevronsDown className="size-[18px]" />
        </IconButton>
        <Popover side="top" trigger={({ toggle, open }) => <IconButton label="声音" active={open || s.metronome} onClick={toggle}><SlidersHorizontal className="size-[18px]" /></IconButton>}>
          {soundPanel}
        </Popover>
          </>
        )}
        <Popover
          side="top"
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              className={cn(
                'flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition',
                open ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_7%,transparent)] hover:text-fg',
              )}
            >
              <KeyRound className="size-4" />
              <span className="hidden sm:inline">{p.transposeLabel}</span>
            </button>
          )}
        >
          {p.transpose}
        </Popover>
        <Popover side="top" trigger={({ toggle, open }) => <IconButton label="显示" active={open} onClick={toggle}><Type className="size-[18px]" /></IconButton>}>
          {p.display}
        </Popover>
      </div>
    </motion.div>
  )
}
