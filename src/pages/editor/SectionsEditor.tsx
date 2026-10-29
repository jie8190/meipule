import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronUp, ChevronDown, Trash2, Plus, Copy, ArrowLeft, ArrowRight, Wand, ListPlus, Repeat, Music, MessageSquareText, Guitar, AlignLeft } from 'lucide-react'
import type { MeasureDoc, Score, SectionDoc, SongDoc, TrackType } from '@/lib/notation/types'
import { isValidChord } from '@/lib/music/chords'
import { Button, cn, IconButton, Input, Select, Textarea, Field, Switch } from '@/components/ui'
import type { DocSetter } from './useDocHistory'
import { beatsToTab, clean, ensureMeasures, insertMeasures, moveItem, normMeasure, parseProgressionInput, removeMeasure, updateMeasure, updateSection } from './ops'

export interface Sel {
  s: number
  m: number
}

interface Props {
  doc: SongDoc
  set: DocSetter
  score: Score
  sel: Sel | null
  setSel: (s: Sel | null) => void
}

export function SectionsEditor({ doc, set, score, sel, setSel }: Props) {
  const patternIds = Object.keys(doc.patterns ?? {})
  return (
    <div className="space-y-4">
      {doc.sections.map((sec, si) => (
        <SectionCard key={si} doc={doc} sec={sec} si={si} set={set} score={score} sel={sel} setSel={setSel} patternIds={patternIds} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          icon={<Guitar className="size-4" />}
          onClick={() => {
            set((d) => ({
              ...d,
              sections: [...d.sections, { name: `段落 ${d.sections.length + 1}`, pattern: patternIds[0], measures: [{ chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' }] }],
            }))
            setSel({ s: doc.sections.length, m: 0 })
          }}
        >
          六线谱段落
        </Button>
        <Button
          variant="outline"
          icon={<AlignLeft className="size-4" />}
          onClick={() => set((d) => ({ ...d, sections: [...d.sections, { name: `段落 ${d.sections.length + 1}`, lines: ['[C]在这里写歌词，[G]用方括号标和弦'] }] }))}
        >
          和弦歌词段落
        </Button>
      </div>
    </div>
  )
}

function SectionCard({ doc, sec, si, set, score, sel, setSel, patternIds }: { doc: SongDoc; sec: SectionDoc; si: number } & Props & { patternIds: string[] }) {
  const isLines = Array.isArray(sec.lines)
  const measures = (ensureMeasures(sec).measures ?? []).map(normMeasure)
  const [batch, setBatch] = useState('')
  const [showBatch, setShowBatch] = useState(false)
  const upd = (fn: (s: SectionDoc) => SectionDoc, key?: string) => set((d) => updateSection(d, si, fn), key)
  // 本段在谱面中的小节下标
  const compiledIdx = score.sections.find((s) => s.index === si && s.kind === 'tab')
  const measureIdx = compiledIdx && compiledIdx.kind === 'tab' ? compiledIdx.measures : []

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[color-mix(in_oklab,var(--fg)_2%,transparent)] px-3 py-2.5 sm:flex-nowrap">
        <Input className="min-w-0 flex-1 sm:w-32 sm:flex-none" value={sec.name ?? ''} placeholder="段落名" onChange={(e) => upd((s) => ({ ...s, name: e.target.value }), `sn-${si}`)} />
        {!isLines && (
          <>
            <Select
              value={sec.pattern ?? ''}
              className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
              onChange={(v) => upd((s) => clean({ ...s, pattern: v || undefined }))}
              options={[{ value: '', label: doc.pattern ? `沿用全曲（${doc.pattern}）` : '不使用节奏型' }, ...patternIds.map((p) => ({ value: p, label: `节奏型：${p}` }))]}
            />
            <div className="flex items-center rounded-xl bg-[color-mix(in_oklab,var(--fg)_5%,transparent)]" title="整段重复次数">
              <Repeat className="ml-2 size-3.5 text-fg-3" />
              <select
                value={sec.repeat ?? 1}
                onChange={(e) => upd((s) => clean({ ...s, repeat: Number(e.target.value) > 1 ? Number(e.target.value) : undefined }))}
                className="h-10 cursor-pointer appearance-none bg-transparent px-2 text-[13px] outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n} className="bg-surface-2">
                    ×{n}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {isLines && <span className="flex-1 text-xs text-fg-3">和弦歌词谱</span>}
        <div className="flex">
          <IconButton size="sm" label="上移" disabled={si === 0} onClick={() => set((d) => ({ ...d, sections: moveItem(d.sections, si, si - 1) }))}>
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton size="sm" label="下移" disabled={si === doc.sections.length - 1} onClick={() => set((d) => ({ ...d, sections: moveItem(d.sections, si, si + 1) }))}>
            <ChevronDown className="size-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="删除段落"
            onClick={() => {
              set((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }))
              setSel(null)
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      {isLines ? (
        <div className="p-3">
          <Textarea
            rows={Math.max(4, (sec.lines ?? []).length + 1)}
            className="font-mono text-[13px] leading-relaxed"
            value={(sec.lines ?? []).join('\n')}
            onChange={(e) => upd((s) => ({ ...s, lines: e.target.value.split('\n') }), `sl-${si}`)}
            placeholder={'[C]好一朵美丽的[Am]茉莉花\n| C | G | Am | F |'}
          />
          <div className="mt-1.5 text-[11px] text-fg-3">每行一句，用 [和弦] 标在换和弦的字前面；只有和弦的行写成 | C | G |；# 开头为小标题</div>
        </div>
      ) : (
        <div className="p-3">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {measures.map((m, mi) => {
              const active = sel?.s === si && sel.m === mi
              const chordText = m.chord ?? (typeof m.chords === 'string' ? m.chords : Array.isArray(m.chords) ? m.chords.map((c) => (typeof c === 'string' ? c : c.name)).join(' ') : '')
              const gIdx = measureIdx[mi]
              const issues = gIdx !== undefined ? score.diagnostics.filter((d) => d.where.startsWith(`「${score.sections.find((s) => s.index === si)?.name}」第 ${mi + 1} 小节`)).length : 0
              return (
                <button
                  key={mi}
                  onClick={() => setSel(active ? null : { s: si, m: mi })}
                  className={cn(
                    'relative flex h-[58px] flex-col items-start justify-between rounded-xl border p-1.5 text-left transition',
                    active ? 'border-accent bg-accent-soft' : 'border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] hover:border-line-3',
                  )}
                >
                  <span className="flex w-full items-center justify-between text-[10px] text-fg-3">
                    <span>{mi + 1}</span>
                    {issues > 0 && <span className="size-1.5 rounded-full bg-warn" />}
                  </span>
                  <span className="w-full truncate text-[13px] font-bold">{chordText || <span className="font-normal text-fg-3">—</span>}</span>
                  <span className="flex gap-1 text-fg-3">
                    {m.tab && <Guitar className="size-3" />}
                    {m.melody && <Music className="size-3" />}
                    {m.lyrics && <MessageSquareText className="size-3" />}
                    {m.pattern !== undefined && !m.tab && <span className="text-[9px] leading-3">{m.pattern === null ? '静音' : m.pattern}</span>}
                  </span>
                </button>
              )
            })}
            <button
              onClick={() => {
                const last = measures[measures.length - 1]
                set((d) => insertMeasures(d, si, measures.length, [last?.chord ? { chord: last.chord } : {}]))
                setSel({ s: si, m: measures.length })
              }}
              className="flex h-[58px] items-center justify-center rounded-xl border border-dashed border-line-2 text-fg-3 transition hover:border-accent hover:text-accent"
              aria-label="添加小节"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => setShowBatch(!showBatch)} className="flex items-center gap-1.5 text-xs text-fg-2 hover:text-fg">
              <ListPlus className="size-3.5" /> 批量添加和弦进行
            </button>
          </div>
          <AnimatePresence>
            {showBatch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-2 flex gap-2">
                  <Input
                    className="flex-1 font-mono"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="G | D | Em C | C   或   G D Em C"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && batch.trim()) {
                        set((d) => insertMeasures(d, si, measures.length, parseProgressionInput(batch)))
                        setBatch('')
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    disabled={!batch.trim()}
                    onClick={() => {
                      set((d) => insertMeasures(d, si, measures.length, parseProgressionInput(batch)))
                      setBatch('')
                    }}
                  >
                    添加
                  </Button>
                </div>
                <div className="mt-1 text-[11px] text-fg-3">用 | 分隔小节；同一小节多个和弦用空格（如 "Em C"）。没有 | 时每个和弦一个小节。</div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {sel && sel.s === si && measures[sel.m] && (
              <MeasureInspector
                key={sel.m}
                m={measures[sel.m]}
                mi={sel.m}
                si={si}
                count={measures.length}
                set={set}
                setSel={setSel}
                patternIds={patternIds}
                compiled={measureIdx[sel.m] !== undefined ? score.measures[measureIdx[sel.m]] : undefined}
                score={score}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function MeasureInspector({
  m,
  mi,
  si,
  count,
  set,
  setSel,
  patternIds,
  compiled,
  score,
}: {
  m: MeasureDoc
  mi: number
  si: number
  count: number
  set: DocSetter
  setSel: (s: Sel | null) => void
  patternIds: string[]
  compiled?: Score['measures'][number]
  score: Score
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  const upd = (fn: (m: MeasureDoc) => MeasureDoc, key: string) => set((d) => updateMeasure(d, si, mi, fn), `${key}-${si}-${mi}`)
  const chordText = m.chord ?? (typeof m.chords === 'string' ? m.chords : Array.isArray(m.chords) ? m.chords.map((c) => (typeof c === 'string' ? c : c.name)).join(' ') : '')
  const badChords = chordText.split(/\s+/).filter((c) => c && c !== '-' && c !== '.' && !isValidChord(c))
  const mode = m.tab !== undefined ? 'tab' : m.pattern === null ? 'none' : m.pattern ?? ''
  const verses = typeof m.lyrics === 'string' ? [m.lyrics] : (m.lyrics ?? [])
  // 多轨：主轨的内容也可能写在 tracks 里，这时按普通音轨编辑，不再显示「伴奏」选项
  const mainId = score.mainTrack >= 0 ? score.tracks[score.mainTrack].id : null
  const mainInTracks = !!mainId && m.tracks?.[mainId] !== undefined
  const firstDrum = score.tracks.findIndex((t) => t.type === 'drums')
  const diags = score.diagnostics.filter((d) => d.where.includes(`第 ${mi + 1} 小节`) && d.where.startsWith(`「${score.sections.find((s) => s.index === si)?.name}」`))

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 space-y-3 rounded-2xl border border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_5%,var(--surface))] p-3"
    >
      <div className="flex items-center gap-1">
        <span className="mr-auto text-[13px] font-semibold">第 {mi + 1} 小节</span>
        <IconButton size="sm" label="左移" disabled={mi === 0} onClick={() => (set((d) => updateSection(d, si, (s) => ({ ...ensureMeasures(s), measures: moveItem(ensureMeasures(s).measures ?? [], mi, mi - 1) }))), setSel({ s: si, m: mi - 1 }))}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <IconButton size="sm" label="右移" disabled={mi === count - 1} onClick={() => (set((d) => updateSection(d, si, (s) => ({ ...ensureMeasures(s), measures: moveItem(ensureMeasures(s).measures ?? [], mi, mi + 1) }))), setSel({ s: si, m: mi + 1 }))}>
          <ArrowRight className="size-4" />
        </IconButton>
        <IconButton size="sm" label="复制一份" onClick={() => (set((d) => insertMeasures(d, si, mi + 1, [{ ...m }])), setSel({ s: si, m: mi + 1 }))}>
          <Copy className="size-4" />
        </IconButton>
        <IconButton size="sm" label="删除小节" onClick={() => (set((d) => removeMeasure(d, si, mi)), setSel(null))}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="和弦" hint={badChords.length ? <span className="text-err">无法识别：{badChords.join('、')}</span> : '空格隔开多个，如 Em C'}>
          <Input
            value={chordText}
            className="font-semibold"
            onChange={(e) => {
              const v = e.target.value
              upd((x) => {
                const { chord: _c, chords: _cs, ...rest } = x
                void _c
                void _cs
                const t = v.trim()
                return t.includes(' ') ? { ...rest, chords: v } : t ? { ...rest, chord: v } : rest
              }, 'chord')
            }}
            placeholder="C"
          />
        </Field>
        {!mainInTracks && (
          <Field label="伴奏">
            <Select
              value={mode}
              onChange={(v) =>
                upd((x) => {
                  const { tab: _t, pattern: _p, ...rest } = x
                  void _t
                  void _p
                  if (v === 'tab') return { ...rest, tab: compiled && compiled.guitar.length ? beatsToTab(compiled) : '' }
                  if (v === 'none') return { ...rest, pattern: null }
                  if (v === '') return rest
                  return { ...rest, pattern: v }
                }, 'mode')
              }
              options={[
                { value: '', label: '沿用段落节奏型' },
                ...patternIds.map((p) => ({ value: p, label: `节奏型：${p}` })),
                { value: 'tab', label: '精确六线谱（手写 tab）' },
                { value: 'none', label: '不弹' },
              ]}
            />
          </Field>
        )}
      </div>

      {m.tab !== undefined && (
        <Field label="六线谱 tab" hint="弦:品/时值，如 6:3/8 3:0 2:1h；+ 同时弹；D U X 扫弦；- 延音；r 休止">
          <Textarea rows={2} className="font-mono text-[13px]" value={m.tab} spellCheck={false} onChange={(e) => upd((x) => ({ ...x, tab: e.target.value }), 'tab')} />
        </Field>
      )}
      {m.tab === undefined && !mainInTracks && compiled && compiled.guitar.length > 0 && (
        <button onClick={() => upd((x) => ({ ...x, tab: beatsToTab(compiled) }), 'tab')} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
          <Wand className="size-3.5" /> 把节奏型展开成六线谱，单独修改这一小节
        </button>
      )}

      {score.tracks.length > 1 &&
        score.tracks.map((t, ti) =>
          ti === score.mainTrack && !mainInTracks ? null : (
            <Field
              key={t.id}
              label={`${t.name}${t.type === 'drums' ? '（鼓）' : '（六线谱）'}`}
              hint={
                t.type === 'drums'
                  ? ti === firstDrum
                    ? 'K 底鼓 S 军鼓 H 闭镲 O 开镲 C 吊镲 T 通鼓 X 拍弦，小写轻击；% 同上一小节，%4 同 4 小节前'
                    : undefined
                  : ti === score.mainTrack || ti === score.tracks.findIndex((x, j) => x.type === 'guitar' && j !== score.mainTrack)
                    ? '弦:品/时值，同主轨写法；% 同上一小节，%4 同 4 小节前（Loop）'
                    : undefined
              }
            >
              <Input
                className="font-mono"
                spellCheck={false}
                value={trackValue(m, t.id, t.type)}
                placeholder={t.type === 'drums' ? 'K/4 S K S' : '留空表示这一轨本小节不弹'}
                onChange={(e) => upd((x) => withTrackValue(x, t.id, t.type, e.target.value), `track-${t.id}`)}
              />
            </Field>
          ),
        )}

      <Field label="简谱旋律" hint="1-7 唱名，0 休止，1' 高音，5, 低音，/8 八分，- 延长一拍">
        <Input className="font-mono" value={m.melody ?? ''} spellCheck={false} onChange={(e) => upd((x) => ({ ...x, melody: e.target.value || undefined }), 'melody')} placeholder="1 1 5 5" />
      </Field>
      <Field label="歌词" hint="每行一段歌词（第一段、第二段…），_ 表示拖腔不出新字">
        <Textarea
          rows={Math.max(1, verses.length)}
          value={verses.join('\n')}
          onChange={(e) =>
            upd((x) => {
              const lines = e.target.value.split('\n')
              const v = lines.length <= 1 ? lines[0] || undefined : lines
              return { ...x, lyrics: v }
            }, 'lyrics')
          }
          placeholder="一闪一闪"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="标注文字">
          <Input value={m.text ?? ''} onChange={(e) => upd((x) => ({ ...x, text: e.target.value || undefined }), 'text')} placeholder="渐慢 / 重复两遍" />
        </Field>
        <Field label="弱起小节" group>
          <div className="flex h-10 items-center">
            <Switch checked={!!m.pickup} onChange={(v) => upd((x) => ({ ...x, pickup: v || undefined }), 'pickup')} />
          </div>
        </Field>
      </div>
      {diags.length > 0 && (
        <div className="space-y-1">
          {diags.map((d, i) => (
            <div key={i} className={cn('rounded-lg px-2.5 py-1.5 text-xs', d.level === 'error' ? 'bg-[color-mix(in_oklab,var(--err)_12%,transparent)] text-err' : 'bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-warn')}>
              {d.message}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/** 某条轨在小节里的六线谱 / 击打串 */
function trackValue(m: MeasureDoc, id: string, type: TrackType): string {
  const v = m.tracks?.[id]
  if (v === undefined) return ''
  if (typeof v === 'string') return v
  return (type === 'drums' ? v.hits : v.tab) ?? ''
}

/** 改写某条轨的六线谱 / 击打串；对象写法里的其它字段（标注等）保留 */
function withTrackValue(m: MeasureDoc, id: string, type: TrackType, val: string): MeasureDoc {
  const tracks = { ...(m.tracks ?? {}) }
  const cur = tracks[id]
  const field = type === 'drums' ? 'hits' : 'tab'
  if (cur && typeof cur === 'object') {
    const next = { ...cur, [field]: val || undefined }
    if (Object.values(next).some((x) => x !== undefined)) tracks[id] = next
    else delete tracks[id]
  } else if (val) tracks[id] = val
  else delete tracks[id]
  return { ...m, tracks: Object.keys(tracks).length ? tracks : undefined }
}
