// 基础乐理：音名、调、移调、MIDI

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** 选调列表（大调），按吉他手常用写法 */
export const KEY_CHOICES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export const mod12 = (n: number) => ((n % 12) + 12) % 12

/** 'C#' → 1, 'Bb' → 10, 'E#' → 5，非法返回 null */
export function noteToPc(name: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]*)$/.exec(name.trim())
  if (!m) return null
  let pc = LETTER_PC[m[1].toUpperCase()]
  for (const ch of m[2]) pc += ch === '#' || ch === '♯' ? 1 : -1
  return mod12(pc)
}

export function pcToName(pc: number, preferFlat = false): string {
  return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]
}

export interface KeyInfo {
  pc: number
  minor: boolean
  name: string
}

/** 解析调名：'G' 'Bb' 'F#m' 'Am' 'C major' 'A minor' */
export function parseKey(key: string | undefined | null): KeyInfo | null {
  if (!key) return null
  const s = key.trim().replace(/\s*(major|maj|大调)$/i, '')
  const m = /^([A-Ga-g][#b♯♭]?)\s*(m|min|minor|小调)?$/i.exec(s)
  if (!m) return null
  const pc = noteToPc(m[1])
  if (pc === null) return null
  const minor = !!m[2]
  return { pc, minor, name: m[1][0].toUpperCase() + m[1].slice(1) + (minor ? 'm' : '') }
}

const FLAT_MAJOR_PCS = new Set([5, 10, 3, 8, 1, 6]) // F Bb Eb Ab Db Gb

/** 该调写和弦时是否倾向用降号 */
export function keyPrefersFlat(key: KeyInfo | null | undefined): boolean {
  if (!key) return false
  const majorPc = key.minor ? mod12(key.pc + 3) : key.pc
  return FLAT_MAJOR_PCS.has(majorPc)
}

export function keyName(pc: number, minor: boolean, preferFlat?: boolean): string {
  const majorPc = minor ? mod12(pc + 3) : pc
  const flat = preferFlat ?? FLAT_MAJOR_PCS.has(majorPc)
  // F# 大调习惯写 F#，而不是 Gb
  let n = pcToName(pc, flat)
  if (!minor && pc === 6) n = 'F#'
  return n + (minor ? 'm' : '')
}

export function transposeKey(key: string, semis: number): string {
  const k = parseKey(key)
  if (!k) return key
  return keyName(mod12(k.pc + semis), k.minor)
}

/** 最短移调距离：-5..+6 */
export function shortestShift(from: number, to: number): number {
  const d = mod12(to - from)
  return d > 6 ? d - 12 : d
}

// ---------- MIDI ----------

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

/** 'E2' → 40；'C#4' → 61 */
export function noteNameToMidi(name: string): number | null {
  const m = /^([A-Ga-g][#b♯♭]?)(-?\d)$/.exec(name.trim())
  if (!m) return null
  const pc = noteToPc(m[1])
  if (pc === null) return null
  return (parseInt(m[2], 10) + 1) * 12 + pc
}

export function midiToNoteName(midi: number, preferFlat = false): string {
  return pcToName(midi, preferFlat) + (Math.floor(midi / 12) - 1)
}

// ---------- 调弦 ----------

export interface TuningPreset {
  id: string
  name: string
  notes: number[] // 6 弦 → 1 弦（低 → 高）
}

export const TUNINGS: TuningPreset[] = [
  { id: 'standard', name: '标准 EADGBE', notes: [40, 45, 50, 55, 59, 64] },
  { id: 'dropD', name: 'Drop D', notes: [38, 45, 50, 55, 59, 64] },
  { id: 'halfDown', name: '降半音 Eb', notes: [39, 44, 49, 54, 58, 63] },
  { id: 'DADGAD', name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  { id: 'openG', name: 'Open G', notes: [38, 43, 50, 55, 59, 62] },
  { id: 'openD', name: 'Open D', notes: [38, 45, 50, 54, 57, 62] },
  { id: 'openE', name: 'Open E', notes: [40, 47, 52, 56, 59, 64] },
  { id: 'dropC', name: 'Drop C', notes: [36, 43, 48, 53, 57, 62] },
]

export const STANDARD_TUNING = TUNINGS[0].notes

export function resolveTuning(t: unknown): { notes: number[]; name: string; error?: string } {
  if (t === undefined || t === null || t === '') return { notes: STANDARD_TUNING, name: '标准' }
  if (typeof t === 'string') {
    const key = t.replace(/[\s_-]/g, '').toLowerCase()
    const preset = TUNINGS.find((p) => p.id.toLowerCase() === key || p.name.replace(/\s/g, '').toLowerCase() === key)
    if (preset) return { notes: preset.notes, name: preset.name }
    if (key === 'standard' || key === '标准') return { notes: STANDARD_TUNING, name: '标准' }
    // 'DADGAD' 'EADGBE' 这类 6 字母写法
    const letters = t.trim().match(/[A-Ga-g][#b]?/g)
    if (letters && letters.length === 6) {
      const notes = guessOctaves(letters)
      if (notes) return { notes, name: t.trim() }
    }
    return { notes: STANDARD_TUNING, name: '标准', error: `无法识别的调弦 "${t}"，已使用标准调弦` }
  }
  if (Array.isArray(t) && t.length === 6) {
    const notes = t.map((n) => (typeof n === 'number' ? n : noteNameToMidi(String(n))))
    if (notes.every((n): n is number => typeof n === 'number')) {
      const preset = TUNINGS.find((p) => p.notes.join() === notes.join())
      if (preset) return { notes, name: preset.id === 'standard' ? '标准' : preset.name }
      return { notes, name: notes.map((n) => midiToNoteName(n).replace(/-?\d/g, '')).join('') }
    }
  }
  return { notes: STANDARD_TUNING, name: '标准', error: '调弦格式应为 6 个音名数组（低音弦在前），如 ["D2","A2","D3","G3","B3","E4"]' }
}

/** 根据标准调弦，把 6 个无八度的音名猜成最接近的 MIDI 音 */
function guessOctaves(letters: string[]): number[] | null {
  const out: number[] = []
  for (let i = 0; i < 6; i++) {
    const pc = noteToPc(letters[i])
    if (pc === null) return null
    const ref = STANDARD_TUNING[i]
    let best = ref
    let bestD = 99
    for (let m = ref - 7; m <= ref + 7; m++) {
      if (mod12(m) === pc && Math.abs(m - ref) < bestD) {
        best = m
        bestD = Math.abs(m - ref)
      }
    }
    out.push(best)
  }
  return out
}
