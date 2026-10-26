// 和弦：名称解析、移调、指法库与指法生成器
import { STANDARD_TUNING, keyPrefersFlat, mod12, noteToPc, parseKey, pcToName } from './theory'

export interface ChordInfo {
  root: number
  rootName: string
  suffix: string // 原始后缀，如 'm7' 'add9'
  quality: string // 规范化后的类型 key
  intervals: number[]
  bass?: number
  bassName?: string
}

/** 规范化的和弦类型 → 音程（相对根音的半音数） */
const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '69': [0, 4, 7, 9, 14],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mmaj7: [0, 3, 7, 11],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  '11': [0, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 17],
  '13': [0, 4, 10, 14, 21],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  add11: [0, 4, 7, 17],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  '7sus2': [0, 2, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  aug7: [0, 4, 8, 10],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7b5': [0, 4, 6, 10],
}

/** 后缀别名 → 规范 key */
const ALIASES: Record<string, string> = {
  '': '',
  M: '',
  maj: '',
  major: '',
  m: 'm',
  min: 'm',
  minor: 'm',
  '-': 'm',
  '5': '5',
  '6': '6',
  m6: 'm6',
  min6: 'm6',
  '69': '69',
  '6/9': '69',
  '6add9': '69',
  '7': '7',
  dom7: '7',
  maj7: 'maj7',
  M7: 'maj7',
  Maj7: 'maj7',
  'Δ': 'maj7',
  'Δ7': 'maj7',
  ma7: 'maj7',
  m7: 'm7',
  min7: 'm7',
  '-7': 'm7',
  mM7: 'mmaj7',
  mmaj7: 'mmaj7',
  'm(maj7)': 'mmaj7',
  minmaj7: 'mmaj7',
  '9': '9',
  maj9: 'maj9',
  M9: 'maj9',
  m9: 'm9',
  min9: 'm9',
  '11': '11',
  m11: 'm11',
  '13': '13',
  add9: 'add9',
  add2: 'add9',
  '(add9)': 'add9',
  '2': 'add9',
  madd9: 'madd9',
  'm(add9)': 'madd9',
  madd2: 'madd9',
  add11: 'add11',
  add4: 'add11',
  sus2: 'sus2',
  sus4: 'sus4',
  sus: 'sus4',
  '4': 'sus4',
  '7sus4': '7sus4',
  '7sus': '7sus4',
  '7sus2': '7sus2',
  dim: 'dim',
  o: 'dim',
  '°': 'dim',
  dim7: 'dim7',
  o7: 'dim7',
  '°7': 'dim7',
  m7b5: 'm7b5',
  'm7-5': 'm7b5',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  aug: 'aug',
  '+': 'aug',
  '#5': 'aug',
  aug7: 'aug7',
  '+7': 'aug7',
  '7#5': 'aug7',
  '7+': 'aug7',
  '7b9': '7b9',
  '7#9': '7#9',
  '7b5': '7b5',
  '7-5': '7b5',
}

const chordCache = new Map<string, ChordInfo | null>()

/** 解析和弦名：'C' 'F#m7' 'Bbmaj7' 'G/B' 'D/F#' 'Cadd9' */
export function parseChord(name: string): ChordInfo | null {
  const key = name
  if (chordCache.has(key)) return chordCache.get(key)!
  let result: ChordInfo | null = null
  const s = name.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(s)
  if (m) {
    const rootName = m[1] + m[2]
    const root = noteToPc(rootName)!
    const suffix = m[3].trim()
    const quality = ALIASES[suffix] ?? ALIASES[suffix.replace(/[()]/g, '')]
    if (quality !== undefined) {
      result = { root, rootName, suffix, quality, intervals: QUALITIES[quality] }
      if (m[4]) {
        result.bass = noteToPc(m[4])!
        result.bassName = m[4]
      }
    }
  }
  chordCache.set(key, result)
  return result
}

export function isValidChord(name: string): boolean {
  return parseChord(name) !== null
}

export function chordPcs(info: ChordInfo): number[] {
  return [...new Set(info.intervals.map((i) => mod12(info.root + i)))]
}

/** 和弦移调；preferFlat 决定升降号写法 */
export function transposeChord(name: string, semis: number, preferFlat?: boolean): string {
  if (semis === 0) return name
  const info = parseChord(name)
  if (!info) return name
  const flat = preferFlat ?? info.rootName.includes('b')
  const root = pcToName(info.root + semis, flat)
  const bass = info.bassName !== undefined ? '/' + pcToName(info.bass! + semis, flat) : ''
  return root + info.suffix + bass
}

/** 根据目标调决定升降号写法 */
export function transposeChordInKey(name: string, semis: number, targetKey: string | undefined): string {
  return transposeChord(name, semis, keyPrefersFlat(parseKey(targetKey)))
}

// ---------------- 指法 ----------------

export interface ChordShape {
  /** 6 弦 → 1 弦，-1 = 不弹 */
  frets: number[]
  /** 0 = 空弦/不按，1-4 = 手指 */
  fingers?: number[]
  barre?: { fret: number; from: number; to: number } // from/to 为 frets 数组下标
  source?: 'custom' | 'library' | 'generated'
}

/** 标准调弦下的常用和弦（与国内吉他谱习惯一致） */
const LIBRARY: Record<string, string> = {
  C: 'x32010',
  D: 'xx0232',
  E: '022100',
  F: '133211',
  G: '320003',
  A: 'x02220',
  B: 'x24442',
  Bb: 'x13331',
  'F#': '244322',
  Eb: 'x68886',
  Ab: '466544',
  Db: 'x46664',
  Am: 'x02210',
  Bm: 'x24432',
  Cm: 'x35543',
  Dm: 'xx0231',
  Em: '022000',
  Fm: '133111',
  Gm: '355333',
  'F#m': '244222',
  'C#m': 'x46654',
  'G#m': '466444',
  Bbm: 'x13321',
  Ebm: 'x68876',
  C7: 'x32310',
  D7: 'xx0212',
  E7: '020100',
  F7: '131211',
  G7: '320001',
  A7: 'x02020',
  B7: 'x21202',
  Am7: 'x02010',
  Dm7: 'xx0211',
  Em7: '022030',
  Bm7: 'x24232',
  'F#m7': '242222',
  Cm7: 'x35343',
  Gm7: '353333',
  'C#m7': 'x46454',
  Fm7: '131111',
  Cmaj7: 'x32000',
  Dmaj7: 'xx0222',
  Emaj7: '021100',
  Fmaj7: 'xx3210',
  Gmaj7: '320002',
  Amaj7: 'x02120',
  Bbmaj7: 'x13231',
  Csus2: 'x30033',
  Csus4: 'x33011',
  Dsus2: 'xx0230',
  Dsus4: 'xx0233',
  Esus4: '022200',
  Gsus4: '330013',
  Asus2: 'x02200',
  Asus4: 'x02230',
  Cadd9: 'x32033',
  Gadd9: '300203',
  Fadd9: 'xx3213',
  D7sus4: 'xx0213',
  A7sus4: 'x02030',
  E7sus4: '020200',
  G6: '320000',
  C6: 'x32210',
  A6: 'x02222',
  D6: 'xx0202',
  E5: '022xxx',
  A5: 'x022xx',
  D5: 'xx023x',
  G5: '355xxx',
  Bdim: 'x2343x',
  Bm7b5: 'x2323x',
  'F#m7b5': '2x221x',
  Edim7: 'xx2323',
  'G/B': 'x20003',
  'C/G': '332010',
  'C/E': '032010',
  'D/F#': '2x0232',
  'Am/G': '3x2210',
  'Am/E': '002210',
  'Am/F#': '2x2210',
  'F/C': 'x33211',
  'F/A': 'x03211',
  'F/G': '3x3211',
  'Em/D': 'xx0000',
  'Em/B': 'x22000',
  'G/F#': '2x0003',
  'D/A': 'x00232',
  'C/B': 'x22010',
  'Dm/C': 'x30231',
  'E/G#': '4x2100',
  'G/D': 'xx0003',
  'A/C#': 'x4222x',
  'Fmaj7/E': '0x3210',
  'G7/B': 'x20001',
  'D/C': 'x30232',
  'A/E': '002220',
  'E/B': 'x22100',
  'Bm/A': 'x04432',
  'Bb/D': 'xx0331',
}

const STANDARD_KEY = STANDARD_TUNING.join(',')

/** 'x32010' / 'x 10 12 12 11 10' / [-1,3,2,0,1,0] → frets 数组 */
export function parseFrets(input: unknown): number[] | null {
  if (Array.isArray(input)) {
    if (input.length !== 6) return null
    const out = input.map((v) => (v === 'x' || v === 'X' || v === null || v === -1 ? -1 : Number(v)))
    return out.every((n) => Number.isInteger(n) && n >= -1 && n <= 24) ? out : null
  }
  if (typeof input !== 'string') return null
  const s = input.trim()
  const parts = /[\s,]/.test(s) ? s.split(/[\s,]+/).filter(Boolean) : s.split('')
  if (parts.length !== 6) return null
  const out = parts.map((p) => (p === 'x' || p === 'X' || p === '-' ? -1 : Number(p)))
  return out.every((n) => Number.isInteger(n) && n >= -1 && n <= 24) ? out : null
}

export function fretsToString(frets: number[]): string {
  const big = frets.some((f) => f > 9)
  return frets.map((f) => (f < 0 ? 'x' : String(f))).join(big ? ' ' : '')
}

/** 推断手指与横按；playable=false 表示一只手按不出来 */
export function assignFingers(frets: number[]): Pick<ChordShape, 'fingers' | 'barre'> & { playable: boolean } {
  const fingers = frets.map(() => 0)
  const pressed = frets.map((f, i) => ({ f, i })).filter((x) => x.f > 0)
  if (pressed.length === 0) return { fingers, playable: true }
  const minF = Math.min(...pressed.map((p) => p.f))
  let barre: ChordShape['barre']
  const atMin = pressed.filter((p) => p.f === minF)
  // 需要横按：按弦数超过 4，且最低品出现在多根弦、区间内没有空弦
  if (atMin.length >= 2) {
    const from = atMin[0].i
    const to = atMin[atMin.length - 1].i
    let ok = true
    for (let i = from; i <= to; i++) if (frets[i] === 0 || (frets[i] > 0 && frets[i] < minF)) ok = false
    if (ok && pressed.length > 4) {
      barre = { fret: minF, from, to }
    }
  }
  let next = 1
  if (barre) {
    for (let i = barre.from; i <= barre.to; i++) if (frets[i] === minF) fingers[i] = 1
    next = 2
  }
  const rest = pressed
    .filter((p) => fingers[p.i] === 0)
    .sort((a, b) => a.f - b.f || a.i - b.i)
  let playable = true
  let prev: { f: number; i: number; finger: number } | null = null
  for (const p of rest) {
    let want = Math.max(next, p.f - minF + 1)
    if (want > 4) {
      // 同品相邻弦可以用同一根手指小横按
      if (prev && prev.f === p.f && Math.abs(prev.i - p.i) === 1) want = prev.finger
      else {
        playable = false
        want = 4
      }
    }
    fingers[p.i] = want
    next = want + 1
    prev = { f: p.f, i: p.i, finger: want }
  }
  return { fingers, barre, playable }
}

function shapeFromFrets(frets: number[], source: ChordShape['source']): ChordShape {
  const { fingers, barre } = assignFingers(frets)
  return { frets, fingers, barre, source }
}

/** 等音名规范化以便查库：A# → Bb 等 */
function libraryLookup(info: ChordInfo): string | null {
  const rootVariants = [pcToName(info.root, false), pcToName(info.root, true)]
  const bassVariants =
    info.bass !== undefined ? [pcToName(info.bass, false), pcToName(info.bass, true)] : ['']
  const suffixes = new Set([info.suffix, canonicalSuffix(info.quality)])
  for (const r of rootVariants)
    for (const s of suffixes)
      for (const b of bassVariants) {
        const k = r + s + (b ? '/' + b : '')
        if (LIBRARY[k]) return LIBRARY[k]
      }
  return null
}

function canonicalSuffix(q: string): string {
  return q === 'mmaj7' ? 'mM7' : q
}

const shapeCache = new Map<string, ChordShape | null>()

/** 取和弦指法：自定义 > 常用库 > 生成器 */
export function getChordShape(
  name: string,
  opts: { tuning?: number[]; custom?: Record<string, ChordShape> } = {},
): ChordShape | null {
  if (opts.custom && opts.custom[name]) return opts.custom[name]
  const tuning = opts.tuning ?? STANDARD_TUNING
  const cacheKey = name + '|' + tuning.join(',')
  if (shapeCache.has(cacheKey)) return shapeCache.get(cacheKey)!
  const info = parseChord(name)
  let shape: ChordShape | null = null
  if (info) {
    if (tuning.join(',') === STANDARD_KEY) {
      const lib = libraryLookup(info)
      if (lib) shape = shapeFromFrets(parseFrets(lib)!, 'library')
    }
    if (!shape) {
      const gen = generateVoicings(info, tuning, 1)
      shape = gen[0] ?? null
    }
  }
  shapeCache.set(cacheKey, shape)
  return shape
}

/**
 * 指法生成器：在每个把位窗口内枚举可行按法，按可弹性打分。
 * 返回分数从高到低的若干个指法。
 */
export function generateVoicings(info: ChordInfo, tuning: number[] = STANDARD_TUNING, limit = 6): ChordShape[] {
  const pcs = chordPcs(info)
  const bassPc = info.bass ?? info.root
  const allPcs = info.bass !== undefined && !pcs.includes(info.bass) ? [...pcs, info.bass] : pcs
  // 必需音：三和弦要全部到齐；四音及以上的和弦可省略纯五度
  const big = info.intervals.length >= 4
  const required = new Set(
    info.intervals
      .filter((iv) => !(iv === 7 && big) && !(iv === 0 && info.bass !== undefined && big))
      .map((iv) => mod12(info.root + iv)),
  )
  if (info.bass !== undefined) required.add(info.bass)
  const minStrings = info.quality === '5' ? 2 : 3
  const results: { shape: ChordShape; score: number; key: string }[] = []
  const seen = new Set<string>()

  for (let base = 0; base <= 12; base++) {
    const options: number[][] = tuning.map((open) => {
      const opts = [-1]
      if (allPcs.includes(mod12(open))) opts.push(0)
      const lo = base === 0 ? 1 : base
      const hi = base === 0 ? 3 : base + 3
      for (let f = lo; f <= hi; f++) if (allPcs.includes(mod12(open + f))) opts.push(f)
      return opts
    })
    const cur = new Array(6).fill(-1)
    const walk = (s: number) => {
      if (s === 6) {
        evaluate(cur.slice(), base)
        return
      }
      for (const f of options[s]) {
        cur[s] = f
        walk(s + 1)
      }
    }
    walk(0)
  }

  function evaluate(frets: number[], base: number) {
    const sounded = frets.map((f, i) => ({ f, i })).filter((x) => x.f >= 0)
    if (sounded.length < minStrings) return
    const first = sounded[0].i
    // 低音必须是根音（或分割和弦的低音）
    if (mod12(tuning[first] + frets[first]) !== bassPc) return
    // 覆盖全部必需音
    const present = new Set(sounded.map((x) => mod12(tuning[x.i] + x.f)))
    for (const r of required) if (!present.has(r)) return
    const fretted = sounded.filter((x) => x.f > 0)
    if (fretted.length) {
      const minF = Math.min(...fretted.map((x) => x.f))
      const maxF = Math.max(...fretted.map((x) => x.f))
      if (maxF - minF > 3) return
      if (base > 0 && minF !== base) return // 每个指法只在其最低把位窗口计一次
      if (base === 0 && minF > 3) return
    } else if (base > 0) return
    // 中间哑弦
    let internalMutes = 0
    for (let i = first; i < 6; i++) if (frets[i] < 0) internalMutes++
    if (internalMutes > 1) return
    // 手指数
    const { fingers, barre, playable } = assignFingers(frets)
    if (!playable) return
    const used = new Set(fingers!.filter((f) => f > 0))
    // 横按时，横按区间内不可有空弦
    if (barre) for (let i = barre.from; i <= barre.to; i++) if (frets[i] === 0) return
    const key = frets.join(',')
    if (seen.has(key)) return
    seen.add(key)
    const opens = sounded.filter((x) => x.f === 0).length
    const minPressed = fretted.length ? Math.min(...fretted.map((x) => x.f)) : 0
    let score = sounded.length * 2.2
    score -= minPressed * 0.55
    const maxPressed = fretted.length ? Math.max(...fretted.map((x) => x.f)) : 0
    // 高把位只允许低音空弦，其它空弦混在里面通常很别扭
    if (maxPressed >= 7 && sounded.some((x) => x.f === 0 && x.i !== first)) return
    // 空弦只在开放把位加分
    score += opens * (maxPressed <= 4 ? 0.6 : -1.2)
    score -= internalMutes * 3.5
    score -= used.size * 0.35
    if (frets[5] < 0) score -= 1.5 // 1 弦不响，听感偏闷
    if (barre) score -= 0.8
    // 非食指的小横按越多越别扭
    for (const f of [2, 3, 4]) {
      const n = fingers!.filter((x) => x === f).length
      if (n > 1) score -= (n - 1) * 1.2
    }
    // 重复的三音过多略扣分
    const third = sounded.filter((x) => mod12(tuning[x.i] + x.f - info.root) === 4 || mod12(tuning[x.i] + x.f - info.root) === 3).length
    if (third > 2) score -= 1
    results.push({ shape: { frets, fingers, barre, source: 'generated' }, score, key })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit).map((r) => r.shape)
}

/** 取某个和弦的多个按法（和弦库页面用） */
export function getChordVoicings(name: string, tuning: number[] = STANDARD_TUNING, limit = 8): ChordShape[] {
  const info = parseChord(name)
  if (!info) return []
  const out: ChordShape[] = []
  const keys = new Set<string>()
  const primary = getChordShape(name, { tuning })
  if (primary) {
    out.push(primary)
    keys.add(primary.frets.join(','))
  }
  // 每个把位区间最多取两个，让按法分布在整个指板上
  const region = (v: ChordShape) => {
    const p = v.frets.filter((f) => f > 0)
    const min = p.length ? Math.min(...p) : 0
    return min <= 3 ? 0 : min <= 6 ? 1 : min <= 9 ? 2 : 3
  }
  const perRegion = [0, 0, 0, 0]
  if (primary) perRegion[region(primary)]++
  for (const v of generateVoicings(info, tuning, 60)) {
    const k = v.frets.join(',')
    if (keys.has(k)) continue
    const r = region(v)
    if (perRegion[r] >= 2) continue
    perRegion[r]++
    keys.add(k)
    out.push(v)
    if (out.length >= limit) break
  }
  const head = out.slice(0, primary ? 1 : 0)
  const rest = out.slice(head.length).sort((a, b) => region(a) - region(b))
  return [...head, ...rest]
}

/** 指法的最低发声弦（低音弦），返回弦号 1-6 */
export function bassString(shape: ChordShape): number {
  for (let i = 0; i < 6; i++) if (shape.frets[i] >= 0) return 6 - i
  return 6
}

/** 和弦图展示用：起始品位 */
export function diagramBaseFret(frets: number[], span = 4): number {
  const pressed = frets.filter((f) => f > 0)
  if (!pressed.length) return 1
  const max = Math.max(...pressed)
  if (max <= span) return 1
  return Math.min(...pressed)
}

export const CHORD_QUALITY_LIST: { suffix: string; label: string }[] = [
  { suffix: '', label: '大三' },
  { suffix: 'm', label: '小三' },
  { suffix: '7', label: '属七' },
  { suffix: 'maj7', label: '大七' },
  { suffix: 'm7', label: '小七' },
  { suffix: 'sus2', label: '挂二' },
  { suffix: 'sus4', label: '挂四' },
  { suffix: 'add9', label: '加九' },
  { suffix: '6', label: '大六' },
  { suffix: 'm6', label: '小六' },
  { suffix: '9', label: '属九' },
  { suffix: 'm9', label: '小九' },
  { suffix: 'maj9', label: '大九' },
  { suffix: '7sus4', label: '七挂四' },
  { suffix: 'dim', label: '减三' },
  { suffix: 'dim7', label: '减七' },
  { suffix: 'm7b5', label: '半减七' },
  { suffix: 'aug', label: '增三' },
  { suffix: '5', label: '强力' },
]

export function describeChord(name: string): string {
  const info = parseChord(name)
  if (!info) return ''
  const q = CHORD_QUALITY_LIST.find((c) => (ALIASES[c.suffix] ?? c.suffix) === info.quality)
  const notes = chordPcs(info).map((pc) => pcToName(pc, info.rootName.includes('b')))
  return `${q?.label ?? info.suffix} · ${notes.join(' ')}${info.bassName ? ` · 低音 ${info.bassName}` : ''}`
}
