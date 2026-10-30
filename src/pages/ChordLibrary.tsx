import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Search, Volume2 } from 'lucide-react'
import { CHORD_QUALITY_LIST, describeChord, fretsToString, getChordVoicings, parseChord } from '@/lib/music/chords'
import { ChordDiagram } from '@/components/ChordDiagram'
import { strumShape } from '@/components/ChordModal'
import { useSettings } from '@/store/settings'
import { cn, Input, PageHeader } from '@/components/ui'

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export default function ChordLibrary() {
  const [params, setParams] = useSearchParams()
  const initial = parseChord(params.get('c') ?? '')
  const [root, setRoot] = useState(initial?.rootName ?? 'C')
  const [suffix, setSuffix] = useState(initial ? initial.suffix : '')
  const [q, setQ] = useState(params.get('c') ?? '')
  const paper = useSettings((s) => s.scorePaper)

  const name = useMemo(() => {
    const typed = q.trim()
    if (typed && parseChord(typed)) return typed
    return root + suffix
  }, [q, root, suffix])
  const voicings = useMemo(() => getChordVoicings(name, undefined, 8), [name])

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <PageHeader
        eyebrow="Chords · Voicings"
        title="和弦库"
        description="任意和弦都能生成按法：常用和弦用国内谱面习惯指法，其它由算法计算最好按的把位"
        actions={
        <Input
          icon={<Search className="size-4" />}
          className="w-full sm:w-72"
          placeholder="输入和弦名，如 F#m7b5、Cadd9、G/B"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            const info = parseChord(e.target.value.trim())
            if (info) setParams({ c: e.target.value.trim() }, { replace: true })
          }}
        />
        }
      />

      <div className="mt-6 flex flex-wrap gap-1.5">
        {ROOTS.map((r) => (
          <button
            key={r}
            onClick={() => {
              setRoot(r)
              setQ('')
            }}
            className={cn('h-10 min-w-12 rounded-xl px-3 text-sm font-bold transition', root === r && !q ? 'bg-fg text-bg' : 'bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg-2 hover:text-fg')}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {CHORD_QUALITY_LIST.map((qq) => (
          <button
            key={qq.suffix}
            onClick={() => {
              setSuffix(qq.suffix)
              setQ('')
            }}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition',
              suffix === qq.suffix && !q ? 'bg-accent-soft font-semibold text-accent' : 'bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] text-fg-2 hover:text-fg',
            )}
          >
            <span className="font-mono text-xs">{qq.suffix || 'M'}</span>
            {qq.label}
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-baseline gap-4">
        <h2 className="text-5xl font-bold tracking-tight">{name}</h2>
        <span className="text-sm text-fg-2">{describeChord(name)}</span>
      </div>

      {voicings.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line-2 py-16 text-center text-sm text-fg-3">无法识别这个和弦名</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {voicings.map((v, i) => (
            <motion.button
              key={name + v.frets.join()}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => strumShape(v)}
              data-score={paper ? 'paper' : undefined}
              className="group relative flex flex-col items-center rounded-[24px] px-3 pb-4 pt-10 ring-1 ring-line transition hover:-translate-y-1 hover:ring-line-3"
              style={{ background: 'var(--score-paper)' }}
            >
              {i === 0 && <span className="absolute left-3 top-3 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">常用</span>}
              <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full opacity-60 transition group-hover:opacity-100" style={{ color: 'var(--score-ink)' }}>
                <Volume2 className="size-4" />
              </span>
              <ChordDiagram shape={v} size={150} />
              <span className="mt-2 font-mono text-xs" style={{ color: 'var(--score-dim)' }}>
                {fretsToString(v.frets)}
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
