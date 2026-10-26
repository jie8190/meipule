// 分页扒谱：把逐页转写出来的 JSON 拼成一首完整的曲子
import type { SongDoc } from './types'

/** 页首接着上一页的段落时，AI 写的段落名 */
export const CONTINUED = '（接上页）'

/** 第 1 页读出来的全曲信息，后面每页都沿用 */
export function songHeader(doc: Partial<SongDoc>): Partial<SongDoc> {
  const keys = ['format', 'title', 'artist', 'key', 'capo', 'tempo', 'time', 'tuning', 'tracks', 'patterns', 'chords', 'pattern'] as const
  const out: Record<string, unknown> = {}
  for (const k of keys) if (doc[k] !== undefined) out[k] = doc[k]
  return out as Partial<SongDoc>
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 按页序合并：全曲信息以第 1 页为准（缺的字段用后面页补上）；
 * 后面页新出现的节奏型、和弦、音轨追加进去；页首写着「（接上页）」或和上一段同名的段落接到上一段后面。
 */
export function mergePages(pages: Partial<SongDoc>[]): SongDoc {
  // 先整份复制：下面会往段落里追加小节，不能改到调用方手里的各页数据（扒谱时每完成一页就重新合并一次）
  const docs = structuredClone(pages.filter(isObj))
  const base = (docs[0] ?? {}) as Partial<SongDoc>
  base.sections = Array.isArray(base.sections) ? base.sections : []
  const notes: string[] = typeof base.notes === 'string' && base.notes.trim() ? [base.notes.trim()] : []
  docs.slice(1).forEach((d, i) => {
    const page = i + 2
    for (const k of ['title', 'artist', 'key', 'capo', 'tempo', 'time', 'tuning'] as const)
      if (base[k] === undefined && d[k] !== undefined) (base as Record<string, unknown>)[k] = d[k]
    for (const k of ['patterns', 'chords'] as const) {
      if (!isObj(d[k])) continue
      const into = (isObj(base[k]) ? base[k] : {}) as Record<string, unknown>
      for (const [name, v] of Object.entries(d[k] as Record<string, unknown>)) if (!(name in into)) into[name] = v
      ;(base as Record<string, unknown>)[k] = into
    }
    if (Array.isArray(d.tracks)) {
      const tracks = Array.isArray(base.tracks) ? base.tracks : []
      for (const t of d.tracks) if (t && typeof t.id === 'string' && !tracks.some((x) => x.id === t.id)) tracks.push(t)
      if (tracks.length) base.tracks = tracks
    }
    if (typeof d.notes === 'string' && d.notes.trim()) notes.push(`第 ${page} 页：${d.notes.trim()}`)
    const secs = Array.isArray(d.sections) ? d.sections : []
    secs.forEach((sec, j) => {
      if (!isObj(sec)) return
      const prev = base.sections!.at(-1)
      const name = typeof sec.name === 'string' ? sec.name.trim() : ''
      const continues = j === 0 && prev && (name === CONTINUED || name === '' || name === prev.name)
      if (continues && Array.isArray(prev.measures) && Array.isArray(sec.measures)) {
        prev.measures = [...prev.measures, ...sec.measures]
        return
      }
      if (continues && Array.isArray(prev.lines) && Array.isArray(sec.lines)) {
        prev.lines = [...prev.lines, ...sec.lines]
        return
      }
      base.sections!.push(name === CONTINUED ? { ...sec, name: prev?.name ?? '段落' } : sec)
    })
  })
  if (notes.length) base.notes = notes.join('\n')
  if (!base.title) base.title = '未命名曲谱'
  return base as SongDoc
}
