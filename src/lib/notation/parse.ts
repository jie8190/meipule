// 记法解析：六线谱/节奏型步骤串、简谱旋律、歌词、和弦标记、和弦歌词行
import { TPQ, type DrumInst, type DurSpec, type LyricLine, type Tech } from './types'

export interface ParseError {
  token: string
  message: string
}

// ---------- 时值 ----------

export function durTicks(d: DurSpec): number {
  let t = (TPQ * 4) / d.base
  let add = t / 2
  for (let i = 0; i < d.dots; i++) {
    t += add
    add /= 2
  }
  if (d.triplet) t = (t * 2) / 3
  return Math.round(t)
}

const DUR_RE = /^(1|2|4|8|16|32|64)(\.{0,2})(t|3)?$/

export function parseDur(s: string): DurSpec | null {
  const m = DUR_RE.exec(s.trim())
  if (!m) return null
  return { base: parseInt(m[1], 10), dots: m[2].length, triplet: !!m[3] }
}

/** 由 tick 反推最接近的显示时值 */
export function ticksToDurSpec(ticks: number): DurSpec {
  const cands: DurSpec[] = []
  for (const base of [1, 2, 4, 8, 16, 32])
    for (let dots = 0; dots <= 2; dots++)
      for (const triplet of [false, true]) cands.push({ base, dots, triplet })
  let best = cands[0]
  let bestErr = Infinity
  for (const c of cands) {
    const t = durTicks(c)
    // 优先：不超过实际时长、无附点、非三连音
    const err = Math.abs(t - ticks) + (t > ticks ? 1 : 0) + c.dots * 0.5 + (c.triplet ? 0.7 : 0)
    if (err < bestErr) {
      best = c
      bestErr = err
    }
  }
  return best
}

export function isExactDur(ticks: number): boolean {
  const s = ticksToDurSpec(ticks)
  return durTicks(s) === ticks
}

// ---------- 六线谱 / 节奏型步骤 ----------

export interface RawNote {
  /** 弦号；'T' = 和弦根音低音弦，'T2' = 交替低音 */
  string: number | 'T' | 'T2'
  fret?: number
  dead?: boolean
  tech?: Tech
  harmonic?: boolean
  vibrato?: boolean
  accent?: boolean
}

export interface RawStep {
  kind: 'notes' | 'strum' | 'rest' | 'hold'
  notes: RawNote[]
  strum?: { dir: 'down' | 'up' | 'chop'; light: boolean; accent: boolean; range?: [number, number] }
  dur?: DurSpec
  dotted?: boolean
  token: string
}

const STRUM_ALIASES: Record<string, string> = {
  '↓': 'D',
  '↑': 'U',
  下: 'D',
  上: 'U',
  切: 'X',
}

const NOTE_RE = /^(T2|T1|T|B|[1-6])(?::(\d{1,2}|x|X))?([hpsb~*>]*)$/

/** 预处理：把括号内的空格转成 +，"(6:3 3:0)" → "6:3+3:0" */
function normalizeGroups(src: string): string {
  return src.replace(/[([{]([^)\]}]*)[)\]}](\/[\w.]+)?/g, (_m, inner: string, dur?: string) => {
    // D(1-4) 这类扫弦范围保持原样
    if (/^\d-\d$/.test(inner.trim())) return _m
    const parts = inner.split(/[\s,+]+/).filter(Boolean)
    return parts.join('+') + (dur ?? '')
  })
}

export function parseSteps(src: string): { steps: RawStep[]; errors: ParseError[] } {
  const steps: RawStep[] = []
  const errors: ParseError[] = []
  const text = normalizeGroups(src.replace(/[，,|]/g, ' '))
  for (const rawTok of text.split(/\s+/).filter(Boolean)) {
    let tok = rawTok
    for (const [k, v] of Object.entries(STRUM_ALIASES)) if (tok.startsWith(k)) tok = v + tok.slice(k.length)
    let body = tok
    let dur: DurSpec | undefined
    const slash = tok.indexOf('/')
    if (slash >= 0) {
      body = tok.slice(0, slash)
      const d = parseDur(tok.slice(slash + 1))
      if (!d) {
        errors.push({ token: rawTok, message: `无法识别的时值 "${tok.slice(slash + 1)}"（应为 1/2/4/8/16/32，可加 . 附点或 t 三连音）` })
        continue
      }
      dur = d
    }
    if (body === '-' || body === '~') {
      steps.push({ kind: 'hold', notes: [], dur, token: rawTok })
      continue
    }
    if (body === 'r' || body === 'R' || body === '0') {
      steps.push({ kind: 'rest', notes: [], dur, token: rawTok })
      continue
    }
    const sm = /^([DUXdu])(?:\((\d)-(\d)\))?(>?)$/.exec(body)
    if (sm) {
      const dir = sm[1] === 'X' ? 'chop' : sm[1].toUpperCase() === 'D' ? 'down' : 'up'
      const light = sm[1] === 'd' || sm[1] === 'u'
      const range: [number, number] | undefined = sm[2] ? [parseInt(sm[2], 10), parseInt(sm[3], 10)] : undefined
      if (range && (range[0] < 1 || range[0] > 6 || range[1] < 1 || range[1] > 6)) {
        errors.push({ token: rawTok, message: '扫弦范围的弦号应在 1-6 之间' })
        continue
      }
      steps.push({ kind: 'strum', notes: [], strum: { dir, light, accent: !!sm[4], range }, dur, token: rawTok })
      continue
    }
    const notes: RawNote[] = []
    let bad = false
    for (const part of body.split('+').filter(Boolean)) {
      const m = NOTE_RE.exec(part)
      if (!m) {
        bad = true
        break
      }
      const s = m[1] === 'T' || m[1] === 'T1' || m[1] === 'B' ? 'T' : m[1] === 'T2' ? 'T2' : parseInt(m[1], 10)
      const note: RawNote = { string: s }
      if (m[2] !== undefined) {
        if (m[2] === 'x' || m[2] === 'X') {
          note.dead = true
          note.fret = 0
        } else note.fret = parseInt(m[2], 10)
      }
      for (const ch of m[3]) {
        if (ch === 'h' || ch === 'p' || ch === 's' || ch === 'b') note.tech = ch
        else if (ch === '~') note.vibrato = true
        else if (ch === '*') note.harmonic = true
        else if (ch === '>') note.accent = true
      }
      notes.push(note)
    }
    if (bad || notes.length === 0) {
      errors.push({
        token: rawTok,
        message: `无法识别 "${rawTok}"。音符写作 弦:品（如 3:2），扫弦用 D/U/X，延音 -，休止 r`,
      })
      continue
    }
    steps.push({ kind: 'notes', notes, dur, token: rawTok })
  }
  return { steps, errors }
}

// ---------- 鼓轨击打 ----------

export interface RawHit {
  kind: 'hit' | 'rest' | 'hold'
  notes: { inst: DrumInst; accent: boolean; light: boolean }[]
  dur?: DurSpec
  token: string
}

const DRUM_INSTS = 'KSHOCTX'

/**
 * 鼓轨记号：K 底鼓、S 军鼓、H 闭镲、O 开镲、C 吊镲、T 通鼓、X 拍弦/闷击；
 * 小写为轻击，> 重音，K+H 或 (K H) 同时击打；时值、延音 -、休止 r 与六线谱相同。
 */
export function parseHits(src: string): { hits: RawHit[]; errors: ParseError[] } {
  const hits: RawHit[] = []
  const errors: ParseError[] = []
  const text = normalizeGroups(src.replace(/[，,|]/g, ' '))
  for (const rawTok of text.split(/\s+/).filter(Boolean)) {
    let body = rawTok
    let dur: DurSpec | undefined
    const slash = rawTok.indexOf('/')
    if (slash >= 0) {
      body = rawTok.slice(0, slash)
      const d = parseDur(rawTok.slice(slash + 1))
      if (!d) {
        errors.push({ token: rawTok, message: `无法识别的时值 "${rawTok.slice(slash + 1)}"（应为 1/2/4/8/16/32，可加 . 附点或 t 三连音）` })
        continue
      }
      dur = d
    }
    if (body === '-' || body === '~') {
      hits.push({ kind: 'hold', notes: [], dur, token: rawTok })
      continue
    }
    if (body === 'r' || body === 'R' || body === '0') {
      hits.push({ kind: 'rest', notes: [], dur, token: rawTok })
      continue
    }
    const notes: RawHit['notes'] = []
    let bad = false
    for (const part of body.split('+').filter(Boolean)) {
      const m = /^([A-Za-z])(>?)$/.exec(part)
      const up = m?.[1].toUpperCase() ?? ''
      if (!m || !DRUM_INSTS.includes(up)) {
        bad = true
        break
      }
      notes.push({ inst: up as DrumInst, accent: !!m[2], light: m[1] !== up })
    }
    if (bad || !notes.length) {
      errors.push({ token: rawTok, message: `无法识别 "${rawTok}"。鼓轨记号：K 底鼓、S 军鼓、H 闭镲、O 开镲、C 吊镲、T 通鼓、X 拍弦，小写为轻击` })
      continue
    }
    hits.push({ kind: 'hit', notes, dur, token: rawTok })
  }
  return { hits, errors }
}

/** 允许自动推断的时值（不含三连音） */
export const INFER_OK = new Set([1920, 1440, 960, 720, 480, 360, 240, 180, 120, 60])

/**
 * 给步骤分配时值。
 * - 若全部未写时值：优先用 unit；否则尝试用小节长度平均分配；
 * - 否则：未写时值的步骤沿用上一个时值（开头沿用 unit 或第一个显式时值）。
 */
export function resolveDurations<T extends { dur?: DurSpec }>(
  steps: T[],
  opts: { unit?: number; measureTicks?: number; beatTicks?: number },
): number[] {
  const anyExplicit = steps.some((s) => s.dur)
  if (!anyExplicit) {
    if (opts.unit) return steps.map(() => durTicks({ base: opts.unit!, dots: 0, triplet: false }))
    if (opts.measureTicks && steps.length > 0) {
      const per = opts.measureTicks / steps.length
      if (INFER_OK.has(per)) return steps.map(() => per)
    }
    const fallback = opts.beatTicks ?? TPQ / 2
    return steps.map(() => fallback)
  }
  let cur = opts.unit
    ? durTicks({ base: opts.unit, dots: 0, triplet: false })
    : durTicks(steps.find((s) => s.dur)!.dur!)
  return steps.map((s) => {
    if (s.dur) cur = durTicks(s.dur)
    return cur
  })
}

// ---------- 简谱 ----------

export interface RawMelodyNote {
  kind: 'note' | 'rest' | 'hold'
  degree: number
  acc: number
  octave: number
  dotted: boolean
  dur?: DurSpec
  token: string
}

const MELODY_RE = /^([#b♯♭]?)([0-7])((?:'|’|,|，)*)(\.?)$/

export function parseMelody(src: string): { notes: RawMelodyNote[]; errors: ParseError[] } {
  const notes: RawMelodyNote[] = []
  const errors: ParseError[] = []
  for (const rawTok of src.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    let body = rawTok
    let dur: DurSpec | undefined
    const slash = rawTok.indexOf('/')
    if (slash >= 0) {
      body = rawTok.slice(0, slash)
      const d = parseDur(rawTok.slice(slash + 1))
      if (!d) {
        errors.push({ token: rawTok, message: `无法识别的时值 "${rawTok.slice(slash + 1)}"` })
        continue
      }
      dur = d
    }
    if (body === '-' || body === '—') {
      notes.push({ kind: 'hold', degree: 0, acc: 0, octave: 0, dotted: false, dur, token: rawTok })
      continue
    }
    const m = MELODY_RE.exec(body)
    if (!m) {
      errors.push({ token: rawTok, message: `无法识别的简谱 "${rawTok}"。示例：5、1'（高八度）、6,（低八度）、#4、3/8（八分）、-（延长一拍）` })
      continue
    }
    const degree = parseInt(m[2], 10)
    const acc = m[1] === '#' || m[1] === '♯' ? 1 : m[1] ? -1 : 0
    let octave = 0
    for (const ch of m[3]) octave += ch === "'" || ch === '’' ? 1 : -1
    notes.push({ kind: degree === 0 ? 'rest' : 'note', degree, acc, octave, dotted: m[4] === '.', dur, token: rawTok })
  }
  return { notes, errors }
}

// ---------- 歌词 ----------

const CJK = '\\u3400-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff\\uac00-\\ud7af'
const PUNCT = '，。、！？；：,.!?;:…"”’）)」』'
const LYRIC_RE = new RegExp(
  `_|[${CJK}][${PUNCT}]*|[A-Za-z0-9À-ÿ'’]+-?[${PUNCT}]*|[^\\s${PUNCT}][${PUNCT}]*`,
  'g',
)

/** 把歌词切成"字"：中文按字，英文按单词（连字符分音节），_ 表示跳过一个音 */
export function splitLyrics(s: string): string[] {
  return (s.match(LYRIC_RE) ?? []).map((t) => t)
}

// ---------- 小节内和弦 ----------

export interface RawChordMark {
  name: string
  /** 小节内位置（0 起的 tick） */
  tick: number
}

/**
 * "F C" → 平均分配；"C - - G" → 每个记号占一拍的等分；
 * 数组项可以是字符串或 {name, beat}（beat 从 1 开始）
 */
export function parseMeasureChords(
  input: string | (string | { name: string; beat: number })[] | undefined,
  single: string | undefined,
  measureTicks: number,
  beatTicks: number,
): { marks: RawChordMark[]; errors: string[] } {
  const errors: string[] = []
  if (input === undefined || input === null || input === '') {
    return { marks: single ? [{ name: single.trim(), tick: 0 }] : [], errors }
  }
  if (typeof input === 'string') {
    const toks = input.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)
    const n = toks.length
    const marks: RawChordMark[] = []
    toks.forEach((t, i) => {
      if (t === '-' || t === '.' || t === '%') return
      marks.push({ name: t, tick: Math.round((measureTicks * i) / n) })
    })
    return { marks, errors }
  }
  if (Array.isArray(input)) {
    const n = input.length
    const marks: RawChordMark[] = []
    input.forEach((it, i) => {
      if (typeof it === 'string') {
        if (it === '-' || it === '.') return
        marks.push({ name: it.trim(), tick: Math.round((measureTicks * i) / n) })
      } else if (it && typeof it === 'object' && typeof it.name === 'string') {
        const beat = typeof it.beat === 'number' ? it.beat : 1
        const tick = Math.round((beat - 1) * beatTicks)
        if (tick < 0 || tick >= measureTicks) errors.push(`和弦 ${it.name} 的 beat=${beat} 超出小节范围`)
        marks.push({ name: it.name.trim(), tick: Math.max(0, Math.min(measureTicks - 1, tick)) })
      }
    })
    marks.sort((a, b) => a.tick - b.tick)
    return { marks, errors }
  }
  errors.push('chords 应为字符串或数组')
  return { marks: [], errors }
}

// ---------- 和弦歌词行 ----------

const CHORD_TOKEN_RE = /^[A-G][#b]?[^\s|]*$/

export function parseLyricLine(line: string): LyricLine {
  const raw = line ?? ''
  const t = raw.trim()
  if (!t) return { kind: 'blank', segments: [] }
  if (t.startsWith('#')) return { kind: 'heading', segments: [], text: t.replace(/^#+\s*/, '') }
  if (!t.includes('[')) {
    const toks = t.split(/\s+/).filter((x) => x !== '|' && x !== '||')
    const cleaned = toks.map((x) => x.replace(/^\|+|\|+$/g, '')).filter(Boolean)
    if (cleaned.length && cleaned.every((x) => CHORD_TOKEN_RE.test(x) || x === '-' || x === '%')) {
      return { kind: 'chords', segments: cleaned.map((c) => ({ chord: c === '-' || c === '%' ? undefined : c, text: c === '%' ? '%' : '' })) }
    }
    return { kind: 'lyric', segments: [{ text: raw }] }
  }
  const segments: { chord?: string; text: string }[] = []
  const re = /\[([^\]]*)\]/g
  let last = 0
  let pendingChord: string | undefined
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const text = raw.slice(last, m.index)
    if (text || pendingChord !== undefined) segments.push({ chord: pendingChord, text })
    pendingChord = m[1].trim()
    last = m.index + m[0].length
  }
  const tail = raw.slice(last)
  if (tail || pendingChord !== undefined) segments.push({ chord: pendingChord, text: tail })
  return { kind: 'lyric', segments }
}

/** 拍号 "4/4" → [4, 4] */
export function parseTime(s: string | undefined): [number, number] | null {
  if (!s) return null
  const m = /^\s*(\d{1,2})\s*\/\s*(1|2|4|8|16)\s*$/.exec(s)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10)]
}
