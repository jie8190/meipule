// 编辑器的文档操作（不可变更新）
import type { CompiledMeasure, MeasureDoc, SectionDoc, SongDoc } from '@/lib/notation/types'
import { durTicks, ticksToDurSpec } from '@/lib/notation/parse'

export function normMeasure(m: MeasureDoc | string | undefined): MeasureDoc {
  if (typeof m === 'string') return m.trim().includes(' ') ? { chords: m.trim() } : { chord: m.trim() }
  return m ? { ...m } : {}
}

/** progression 速记转成 measures，方便逐小节编辑 */
export function ensureMeasures(sec: SectionDoc): SectionDoc {
  if (Array.isArray(sec.measures) || typeof sec.progression !== 'string') return sec
  const chunks = sec.progression.split('|').map((c) => c.trim()).filter(Boolean)
  let last = ''
  const measures: MeasureDoc[] = chunks.map((c) => {
    const v = c === '%' ? last : c
    last = v
    return normMeasure(v)
  })
  const { progression: _p, ...rest } = sec
  void _p
  return { ...rest, measures }
}

export function updateSection(doc: SongDoc, si: number, fn: (s: SectionDoc) => SectionDoc): SongDoc {
  const sections = doc.sections.map((s, i) => (i === si ? fn(s) : s))
  return { ...doc, sections }
}

export function updateMeasure(doc: SongDoc, si: number, mi: number, fn: (m: MeasureDoc) => MeasureDoc): SongDoc {
  return updateSection(doc, si, (s0) => {
    const s = ensureMeasures(s0)
    const measures = (s.measures ?? []).map((m, i) => (i === mi ? clean(fn(normMeasure(m))) : m))
    return { ...s, measures }
  })
}

/** 去掉空字段 */
export function clean<T extends object>(o: T): T {
  const out = { ...o } as Record<string, unknown>
  for (const k of Object.keys(out)) {
    if (k === 'tab') continue // 空 tab 也要保留，表示手写模式
    const v = out[k]
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || v === false) delete out[k]
  }
  return out as T
}

export function insertMeasures(doc: SongDoc, si: number, at: number, items: MeasureDoc[]): SongDoc {
  return updateSection(doc, si, (s0) => {
    const s = ensureMeasures(s0)
    const ms = [...(s.measures ?? [])]
    ms.splice(at, 0, ...items)
    return { ...s, measures: ms }
  })
}

export function removeMeasure(doc: SongDoc, si: number, mi: number): SongDoc {
  return updateSection(doc, si, (s0) => {
    const s = ensureMeasures(s0)
    return { ...s, measures: (s.measures ?? []).filter((_, i) => i !== mi) }
  })
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const a = [...arr]
  const [x] = a.splice(from, 1)
  a.splice(to, 0, x)
  return a
}

/** "G D Em C | Am F G C" → 小节数组；| 或空格都可分隔，逗号表示同一小节多个和弦 */
export function parseProgressionInput(text: string): MeasureDoc[] {
  const t = text.trim()
  if (!t) return []
  const chunks = t.includes('|') ? t.split('|') : t.split(/\s+/)
  return chunks
    .map((c) => c.trim().replace(/,/g, ' ').replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((c) => normMeasure(c))
}

export function renamePattern(doc: SongDoc, from: string, to: string): SongDoc {
  if (!doc.patterns || from === to || !to.trim()) return doc
  const patterns: NonNullable<SongDoc['patterns']> = {}
  for (const [k, v] of Object.entries(doc.patterns)) patterns[k === from ? to : k] = v
  const sections = doc.sections.map((s) => ({
    ...s,
    pattern: s.pattern === from ? to : s.pattern,
    measures: s.measures?.map((m) => (typeof m === 'object' && m.pattern === from ? { ...m, pattern: to } : m)),
  }))
  return { ...doc, patterns, sections, pattern: doc.pattern === from ? to : doc.pattern }
}

const STD = [1920, 1440, 960, 720, 480, 360, 320, 240, 180, 160, 120, 80, 60]

function durToken(ticks: number): string {
  const d = ticksToDurSpec(ticks)
  return `/${d.base}${'.'.repeat(d.dots)}${d.triplet ? 't' : ''}`
}

/** 把编译后的伴奏（可能来自节奏型）展开成精确 tab 记法，便于逐音修改 */
export function beatsToTab(m: CompiledMeasure): string {
  const out: string[] = []
  let lastDur = ''
  const push = (body: string, ticks: number) => {
    const tok = durToken(ticks)
    out.push(tok === lastDur ? body : body + tok)
    lastDur = tok
  }
  for (const b of m.guitar) {
    let body: string
    if (b.kind === 'notes') {
      body = b.notes
        .map((n) => `${n.string}:${n.dead ? 'x' : n.fret}${n.tech ?? ''}${n.vibrato ? '~' : ''}${n.harmonic ? '*' : ''}${n.accent ? '>' : ''}`)
        .join('+')
    } else if (b.kind === 'strum' && b.strum) {
      const st = b.strum
      body = st.dir === 'chop' ? 'X' : st.dir === 'down' ? (st.light ? 'd' : 'D') : st.light ? 'u' : 'U'
      if (st.accent) body += '>'
    } else if (b.kind === 'rest') body = 'r'
    else body = '-'
    // 非标准时值拆成 标准时值 + 延音
    let remain = b.dur
    let first = true
    while (remain > 0) {
      const chunk = STD.find((v) => v <= remain) ?? remain
      push(first ? body : '-', chunk)
      first = false
      remain -= chunk
    }
  }
  return out.join(' ')
}

export { durTicks }
