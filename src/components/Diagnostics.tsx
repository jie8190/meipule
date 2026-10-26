import { useState } from 'react'
import { CircleAlert, TriangleAlert, CheckCircle2, ChevronDown } from 'lucide-react'
import type { Diagnostic, Score } from '@/lib/notation/types'
import { summarize } from '@/lib/importer'
import { Cover } from './Cover'
import { cn } from './ui'

export function DiagnosticsList({ diags, max = 6, className }: { diags: Diagnostic[]; max?: number; className?: string }) {
  const [all, setAll] = useState(false)
  if (!diags.length) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] px-3 py-2.5 text-[13px] text-ok', className)}>
        <CheckCircle2 className="size-4" /> 格式校验通过，没有发现问题
      </div>
    )
  }
  const sorted = [...diags].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
  const shown = all ? sorted : sorted.slice(0, max)
  return (
    <div className={cn('space-y-1.5', className)}>
      {shown.map((d, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-2.5 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed',
            d.level === 'error' ? 'bg-[color-mix(in_oklab,var(--err)_10%,transparent)]' : 'bg-[color-mix(in_oklab,var(--warn)_9%,transparent)]',
          )}
        >
          {d.level === 'error' ? <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-err" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />}
          <div className="min-w-0">
            <span className="mr-1.5 font-medium text-fg">{d.where}</span>
            <span className="text-fg-2">{d.message}</span>
          </div>
        </div>
      ))}
      {sorted.length > max && (
        <button onClick={() => setAll(!all)} className="flex items-center gap-1 px-1 text-xs text-fg-3 hover:text-fg-2">
          <ChevronDown className={cn('size-3.5 transition', all && 'rotate-180')} />
          {all ? '收起' : `还有 ${sorted.length - max} 条`}
        </button>
      )}
    </div>
  )
}

export function ScoreSummary({ score, className }: { score: Score; className?: string }) {
  const s = summarize(score)
  return (
    <div className={cn('flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-3', className)}>
      <Cover title={score.title} artist={score.artist} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{score.title}</div>
        <div className="truncate text-xs text-fg-3">{score.artist || '未知作者'}</div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
          {score.originalKey && <span>原调 {score.originalKey}</span>}
          {score.originalCapo > 0 && <span>Capo {score.originalCapo}</span>}
          <span>{score.tempo} BPM</span>
          <span>
            {score.timeNum}/{score.timeDen}
          </span>
          {score.tracks.length > 1 && <span>{score.tracks.length} 轨</span>}
          <span>{score.sections.length} 段</span>
          {s.measures > 0 && <span>{s.measures} 小节</span>}
          {s.chords > 0 && <span>{s.chords} 个和弦</span>}
        </div>
      </div>
    </div>
  )
}
