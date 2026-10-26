import { useSyncExternalStore } from 'react'
import { Drum, Eye, EyeOff, Guitar, Volume2, VolumeX } from 'lucide-react'
import { player } from '@/lib/audio/player'
import type { TrackInfo } from '@/lib/notation/types'
import { cn } from './ui'

function usePlayerOptions() {
  return useSyncExternalStore(
    (cb) => player.subscribe(cb),
    () => player.options,
  )
}

/** 多轨混音：每条轨可以在谱面上隐藏、静音、独奏 */
export function TrackMixer({ tracks, hidden, onHidden }: { tracks: TrackInfo[]; hidden: number[]; onHidden: (h: number[]) => void }) {
  const o = usePlayerOptions()
  const toggle = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i])
  return (
    <div className="border-b border-line px-1 pb-2">
      <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3">音轨</div>
      {tracks.map((t, i) => {
        const shown = !hidden.includes(i)
        const muted = o.solo !== null ? o.solo !== i : o.muted.includes(i)
        const Icon = t.type === 'drums' ? Drum : Guitar
        const sub = t.type === 'guitar' ? [t.capo ? `Capo ${t.capo}` : '', t.tuningName !== '标准' ? t.tuningName : ''].filter(Boolean).join(' · ') : '打击乐'
        return (
          <div key={t.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5', !t.hasContent && 'opacity-50')}>
            <Icon className="size-4 shrink-0 text-fg-2" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className={cn('truncate text-[13px] font-medium', muted && 'text-fg-3')}>{t.name}</div>
              {sub && <div className="truncate text-[11px] text-fg-3">{sub}</div>}
            </div>
            <MixButton label={shown ? '在谱面上隐藏' : '在谱面上显示'} active={shown} onClick={() => onHidden(toggle(hidden, i))}>
              {shown ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </MixButton>
            <MixButton label={o.muted.includes(i) ? '取消静音' : '静音'} active={!o.muted.includes(i)} onClick={() => player.setOptions({ muted: toggle(o.muted, i), solo: null })}>
              {o.muted.includes(i) ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </MixButton>
            <MixButton label={o.solo === i ? '取消独奏' : '独奏'} active={o.solo === i} accent onClick={() => player.setOptions({ solo: o.solo === i ? null : i })}>
              <span className="text-[12px] font-bold">S</span>
            </MixButton>
          </div>
        )
      })}
    </div>
  )
}

function MixButton({ label, active, accent, onClick, children }: { label: string; active: boolean; accent?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg transition',
        active
          ? accent
            ? 'bg-accent text-accent-fg'
            : 'text-fg hover:bg-[color-mix(in_oklab,var(--fg)_7%,transparent)]'
          : 'text-fg-3 hover:bg-[color-mix(in_oklab,var(--fg)_7%,transparent)]',
      )}
    >
      {children}
    </button>
  )
}
