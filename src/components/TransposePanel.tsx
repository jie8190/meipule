import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { Score } from '@/lib/notation/types'
import { KEY_CHOICES, keyName, mod12, noteToPc, parseKey } from '@/lib/music/theory'
import { cn, Switch } from './ui'

interface Props {
  score: Score
  shift: number
  capo: number
  keepKey: boolean
  onChange: (v: { shift: number; capo: number }) => void
  onKeepKey: (v: boolean) => void
}

/** 选调 + 变调夹：像有谱么一样，换一组好按的指法，用变调夹保持原调 */
export function TransposePanel({ score, shift, capo, keepKey, onChange, onKeepKey }: Props) {
  const k = parseKey(score.originalKey)
  if (!k) {
    return <div className="w-72 p-3 text-sm text-fg-2">这首曲谱没有写调（key），无法变调。可以在编辑器里补上「原调」。</div>
  }
  const origShapePc = mod12(k.pc - score.originalCapo)
  const curShapePc = mod12(origShapePc + shift)
  const sounding = mod12(curShapePc + capo)

  const pickShape = (pc: number) => {
    const d = mod12(pc - origShapePc)
    const newShift = d > 6 ? d - 12 : d
    let newCapo = capo
    if (keepKey) newCapo = mod12(k.pc - pc) // 保持原调
    onChange({ shift: newShift, capo: newCapo })
  }
  const setCapo = (c: number) => onChange({ shift, capo: Math.max(0, Math.min(11, c)) })

  return (
    <div className="w-[300px] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-2">选调（指法）</span>
        <span className="text-[11px] text-fg-3">{k.minor ? '小调按关系大调显示' : ''}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {KEY_CHOICES.map((name) => {
          const pc = noteToPc(name)!
          const label = k.minor ? keyName(mod12(pc + 9), true) : name
          const on = pc === (k.minor ? mod12(curShapePc + 3) : curShapePc)
          const orig = pc === (k.minor ? mod12(origShapePc + 3) : origShapePc)
          return (
            <button
              key={name}
              onClick={() => pickShape(k.minor ? mod12(pc + 9) : pc)}
              className={cn(
                'relative h-9 rounded-xl text-[13px] font-semibold transition',
                on ? 'bg-accent-gradient text-accent-fg shadow-[0_6px_16px_-8px_var(--accent-glow)]' : 'bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] text-fg-2 hover:text-fg',
              )}
            >
              {label}
              {orig && !on && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-2">变调夹</span>
        <div className="flex items-center gap-1">
          <button aria-label="减少" onClick={() => setCapo(capo - 1)} className="flex size-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg-2 hover:text-fg">
            <Minus className="size-3.5" />
          </button>
          <span className="w-14 text-center text-sm font-semibold tabular-nums">{capo === 0 ? '不夹' : `${capo} 品`}</span>
          <button aria-label="增加" onClick={() => setCapo(capo + 1)} className="flex size-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg-2 hover:text-fg">
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] px-3 py-2.5">
        <span>
          <span className="block text-[13px] font-medium">换指法时保持原调</span>
          <span className="block text-[11px] text-fg-3">自动计算变调夹位置</span>
        </span>
        <Switch checked={keepKey} onChange={onKeepKey} />
      </label>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['原调', score.originalKey],
          ['指法', keyName(curShapePc, k.minor)],
          ['实际', keyName(sounding, k.minor)],
        ].map(([l, v], i) => (
          <div key={l} className="rounded-xl bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] py-2">
            <div className="text-[10.5px] text-fg-3">{l}</div>
            <div className={cn('text-sm font-bold', i === 2 && sounding !== k.pc && 'text-accent')}>{v}</div>
          </div>
        ))}
      </div>
      {(shift !== 0 || capo !== score.originalCapo) && (
        <button onClick={() => onChange({ shift: 0, capo: score.originalCapo })} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] hover:text-fg">
          <RotateCcw className="size-3.5" /> 恢复原谱
        </button>
      )}
    </div>
  )
}
