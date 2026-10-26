import { useMemo, useState } from 'react'
import { Plus, Trash2, Play, Grid3x3, Square } from 'lucide-react'
import type { PatternDef, SongDoc } from '@/lib/notation/types'
import { PATTERN_PRESETS } from '@/lib/notation/presets'
import { parseSteps } from '@/lib/notation/parse'
import { compileSong } from '@/lib/notation/compile'
import { Player } from '@/lib/audio/player'
import { Button, cn, IconButton, Input, MenuItem, Popover, Select } from '@/components/ui'
import type { DocSetter } from './useDocHistory'
import { renamePattern } from './ops'

const preview = new Player()

function toDef(raw: PatternDef | string): PatternDef {
  return typeof raw === 'string' ? { steps: raw } : raw
}

export function PatternsEditor({ doc, set }: { doc: SongDoc; set: DocSetter }) {
  const entries = Object.entries(doc.patterns ?? {})
  const [openGrid, setOpenGrid] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  const setPattern = (id: string, def: PatternDef, key: string) => set((d) => ({ ...d, patterns: { ...(d.patterns ?? {}), [id]: def } }), key)

  const addPattern = (base: { name?: string; steps: string; id?: string }) => {
    let id = base.id ?? '节奏型'
    let n = 1
    while (doc.patterns?.[id]) id = `${base.id ?? '节奏型'}${++n}`
    set((d) => ({ ...d, patterns: { ...(d.patterns ?? {}), [id]: { name: base.name, steps: base.steps } } }))
    setOpenGrid(id)
  }

  const play = (id: string, def: PatternDef) => {
    if (playing === id) {
      preview.stop()
      setPlaying(null)
      return
    }
    const mini = compileSong({
      title: 'preview',
      tempo: doc.tempo ?? 80,
      time: doc.time,
      patterns: { p: def },
      sections: [{ pattern: 'p', progression: 'C | G | Am | F' }],
    })
    preview.load(mini, null)
    preview.setOptions({ guitar: true, melody: false, metronome: true, countIn: false, speed: 1 })
    preview.play(0)
    setPlaying(id)
    const unsub = preview.subscribe(() => {
      if (preview.status === 'stopped') {
        setPlaying(null)
        unsub()
      }
    })
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && <div className="rounded-2xl border border-dashed border-line-2 p-5 text-center text-sm text-fg-3">还没有节奏型。节奏型让你只写和弦，六线谱自动生成。</div>}
      {entries.map(([id, raw]) => {
        const def = toDef(raw)
        const errors = parseSteps(def.steps).errors
        return (
          <div key={id} className="rounded-2xl border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                defaultValue={id}
                title="节奏型 id（小节里引用的名字）"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== id && !doc.patterns?.[v]) set((d) => renamePattern(d, id, v))
                  else e.target.value = id
                }}
              />
              <Input className="flex-1" value={def.name ?? ''} placeholder="描述（可选）" onChange={(e) => setPattern(id, { ...def, name: e.target.value || undefined }, `pn-${id}`)} />
              <IconButton size="sm" label={playing === id ? '停止' : '试听'} active={playing === id} onClick={() => play(id, def)}>
                {playing === id ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
              </IconButton>
              <IconButton size="sm" label="可视化编辑" active={openGrid === id} onClick={() => setOpenGrid(openGrid === id ? null : id)}>
                <Grid3x3 className="size-4" />
              </IconButton>
              <IconButton
                size="sm"
                label="删除"
                onClick={() =>
                  set((d) => {
                    const p = { ...(d.patterns ?? {}) }
                    delete p[id]
                    return { ...d, patterns: p }
                  })
                }
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                className="flex-1 font-mono"
                value={def.steps}
                onChange={(e) => setPattern(id, { ...def, steps: e.target.value }, `ps-${id}`)}
                placeholder="T 3 2 3 1 3 2 3"
                spellCheck={false}
              />
              <Select
                value={def.unit ?? 0}
                className="w-24"
                onChange={(v) => setPattern(id, { ...def, unit: v || undefined }, `pu-${id}`)}
                options={[
                  { value: 0, label: '自动' },
                  { value: 4, label: '四分' },
                  { value: 8, label: '八分' },
                  { value: 16, label: '十六分' },
                ]}
              />
            </div>
            {errors.length > 0 && <div className="mt-1.5 text-xs text-err">{errors[0].message}</div>}
            {openGrid === id && <PatternGrid steps={def.steps} onChange={(steps) => setPattern(id, { ...def, steps }, `ps-${id}`)} />}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-2">
        <Popover
          align="start"
          trigger={({ toggle }) => (
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={toggle}>
              从常用节奏型添加
            </Button>
          )}
          className="max-h-80 w-80 overflow-y-auto"
        >
          {(close) =>
            PATTERN_PRESETS.map((p) => (
              <MenuItem
                key={p.id}
                hint={p.time}
                onClick={() => {
                  close()
                  addPattern({ id: p.id, name: p.name, steps: p.steps })
                }}
              >
                <span className="block font-medium">{p.name}</span>
                <span className="block font-mono text-[11px] text-fg-3">{p.steps}</span>
              </MenuItem>
            ))
          }
        </Popover>
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => addPattern({ steps: 'T 3 2 3 1 3 2 3' })}>
          空白节奏型
        </Button>
      </div>
    </div>
  )
}

// ---------------- 可视化网格 ----------------

const ROWS = ['1', '2', '3', '4', '5', '6', 'T', 'T2'] as const
const STRUMS = ['', 'D', 'U', 'X', 'd', 'u'] as const

interface Col {
  strings: Set<string>
  strum: string
  rest: boolean
}

function parseGrid(steps: string): { cols: Col[]; prefixDur: string } | null {
  const toks = steps.trim().split(/\s+/).filter(Boolean)
  let prefixDur = ''
  const cols: Col[] = []
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i]
    const slash = t.indexOf('/')
    if (slash >= 0) {
      if (i !== 0) return null
      prefixDur = t.slice(slash)
      t = t.slice(0, slash)
    }
    if (t.includes(':')) return null
    if (t === '-') cols.push({ strings: new Set(), strum: '', rest: false })
    else if (t === 'r') cols.push({ strings: new Set(), strum: '', rest: true })
    else if (/^[DUXdu]$/.test(t)) cols.push({ strings: new Set(), strum: t, rest: false })
    else {
      const parts = t.split('+')
      if (!parts.every((p) => (ROWS as readonly string[]).includes(p))) return null
      cols.push({ strings: new Set(parts), strum: '', rest: false })
    }
  }
  return { cols, prefixDur }
}

function serialize(cols: Col[], prefixDur: string): string {
  return cols
    .map((c, i) => {
      const order = ROWS.filter((r) => c.strings.has(r))
      const body = c.strum || (c.rest ? 'r' : order.length ? [...order].reverse().join('+') : '-')
      return i === 0 ? body + prefixDur : body
    })
    .join(' ')
}

function PatternGrid({ steps, onChange }: { steps: string; onChange: (s: string) => void }) {
  const parsed = useMemo(() => parseGrid(steps), [steps])
  if (!parsed) {
    return <div className="mt-3 rounded-xl bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] p-3 text-xs text-fg-3">这个节奏型包含品位或多种时值，只能用文字编辑。</div>
  }
  const { cols, prefixDur } = parsed
  const update = (fn: (c: Col[]) => Col[]) => onChange(serialize(fn(cols.map((c) => ({ ...c, strings: new Set(c.strings) }))), prefixDur))
  const toggle = (ci: number, r: string) =>
    update((cs) => {
      const c = cs[ci]
      c.strum = ''
      c.rest = false
      if (c.strings.has(r)) c.strings.delete(r)
      else c.strings.add(r)
      return cs
    })
  const cycleStrum = (ci: number) =>
    update((cs) => {
      const c = cs[ci]
      const idx = STRUMS.indexOf(c.strum as (typeof STRUMS)[number])
      c.strum = STRUMS[(idx + 1) % STRUMS.length]
      if (c.strum) c.strings.clear()
      c.rest = false
      return cs
    })
  return (
    <div className="mt-3 overflow-x-auto rounded-xl bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] p-3">
      <div className="inline-flex flex-col gap-1">
        {[...ROWS, 'S'].map((r) => (
          <div key={r} className="flex items-center gap-1">
            <span className="w-10 shrink-0 text-right text-[11px] font-medium text-fg-3">{r === 'S' ? '扫弦' : r === 'T' ? '低音T' : r === 'T2' ? 'T2' : `${r} 弦`}</span>
            {cols.map((c, ci) => {
              if (r === 'S')
                return (
                  <button
                    key={ci}
                    onClick={() => cycleStrum(ci)}
                    className={cn('size-7 rounded-md text-[12px] font-bold transition', c.strum ? 'bg-accent text-accent-fg' : 'bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg-3 hover:bg-[color-mix(in_oklab,var(--fg)_12%,transparent)]', ci % 2 === 0 && ci > 0 && 'ml-1.5')}
                    title="点击切换：D 下扫 / U 上扫 / X 切音 / d u 轻扫"
                  >
                    {c.strum === 'D' ? '↑' : c.strum === 'U' ? '↓' : c.strum === 'X' ? '×' : c.strum === 'd' ? '↟' : c.strum === 'u' ? '↡' : '·'}
                  </button>
                )
              const on = c.strings.has(r)
              return (
                <button
                  key={ci}
                  onClick={() => toggle(ci, r)}
                  className={cn(
                    'relative size-7 rounded-md transition',
                    on ? 'bg-fg' : 'bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] hover:bg-[color-mix(in_oklab,var(--fg)_12%,transparent)]',
                    ci % 2 === 0 && ci > 0 && 'ml-1.5',
                  )}
                  aria-label={`第 ${ci + 1} 步 ${r}`}
                >
                  {!on && <span className="absolute inset-x-1 top-1/2 h-px bg-line-3" />}
                </button>
              )
            })}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 pl-11">
          <Button size="sm" variant="ghost" onClick={() => update((cs) => [...cs, { strings: new Set(), strum: '', rest: false }])}>
            + 一步
          </Button>
          <Button size="sm" variant="ghost" disabled={cols.length <= 1} onClick={() => update((cs) => cs.slice(0, -1))}>
            − 一步
          </Button>
          <span className="ml-2 text-[11px] text-fg-3">空列 = 延音（-）· 扫弦行可切换方向</span>
        </div>
      </div>
    </div>
  )
}
