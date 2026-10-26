// 导入分析：把任意文本识别为 单曲 / 多曲 / 备份，并编译校验
import { compileSong } from './notation/compile'
import { parseLenient } from './notation/spec'
import type { Score, SongDoc } from './notation/types'
import type { Backup } from './db'
import { isNative, shareTextFile } from './native'

export type ImportAnalysis =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'song'; doc: SongDoc; score: Score }
  | { kind: 'songs'; docs: SongDoc[]; scores: Score[] }
  | { kind: 'backup'; backup: Backup }

function looksLikeSong(v: unknown): v is SongDoc {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as SongDoc).sections)
}

export function analyzeImport(text: string): ImportAnalysis {
  if (!text.trim()) return { kind: 'empty' }
  const { value, error } = parseLenient(text)
  if (error) return { kind: 'error', message: error }
  if (value && typeof value === 'object' && (value as Backup).app === 'meipule' && Array.isArray((value as Backup).songs)) {
    return { kind: 'backup', backup: value as Backup }
  }
  if (Array.isArray(value)) {
    const docs = value.filter(looksLikeSong)
    if (!docs.length) return { kind: 'error', message: '数组里没有找到曲谱（每首曲谱需要包含 sections 字段）' }
    return { kind: 'songs', docs, scores: docs.map((d) => compileSong(d)) }
  }
  if (value && typeof value === 'object' && Array.isArray((value as { songs?: unknown }).songs)) {
    const docs = ((value as { songs: unknown[] }).songs).filter(looksLikeSong)
    if (docs.length) return { kind: 'songs', docs, scores: docs.map((d) => compileSong(d)) }
  }
  if (!looksLikeSong(value)) {
    if (value && typeof value === 'object' && 'title' in value) {
      return { kind: 'error', message: '缺少 sections（段落数组）字段，无法识别为曲谱' }
    }
    return { kind: 'error', message: '这不是「没谱了」曲谱格式：需要一个包含 title 和 sections 的 JSON 对象' }
  }
  return { kind: 'song', doc: value, score: compileSong(value) }
}

const DRAFT_KEY = 'meipule:draft'

export function stashDraft(doc: SongDoc) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(doc))
}

export function takeDraft(): SongDoc | null {
  const s = sessionStorage.getItem(DRAFT_KEY)
  if (!s) return null
  sessionStorage.removeItem(DRAFT_KEY)
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export function summarize(score: Score) {
  const tabSecs = score.sections.filter((s) => s.kind === 'tab').length
  const lineSecs = score.sections.length - tabSecs
  const errors = score.diagnostics.filter((d) => d.level === 'error').length
  const warnings = score.diagnostics.filter((d) => d.level === 'warning').length
  return { tabSecs, lineSecs, measures: score.measures.length, chords: score.chordsUsed.length, errors, warnings }
}

/** 导出文件：浏览器里直接下载；安卓 App 里弹出系统分享面板（可存到文件、发给微信等） */
export function downloadText(filename: string, text: string, type = 'application/json') {
  if (isNative) {
    shareTextFile(filename, text).catch((e) => console.error(e))
    return
  }
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'song'
}
