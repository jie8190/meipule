// 导入 Guitar Pro（.gp3 .gp4 .gp5 .gpx .gp）和 MusicXML：用 alphaTab 读文件，再转成「没谱了」格式。
// alphaTab 体积较大，只在导入这类文件时才加载。
import type { model } from '@coderline/alphatab'
import { isValidChord } from '../music/chords'
import { midiToNoteName, TUNINGS } from '../music/theory'
import { splitDuration } from './parse'
import { TPQ, type DrumInst, type MeasureDoc, type SectionDoc, type SongDoc, type TrackDoc } from './types'

type Score = model.Score
type Staff = model.Staff
type Beat = model.Beat
type Note = model.Note
type MasterBar = model.MasterBar

/** alphaTab 的 tick：每个四分音符 960 */
const AT_TPQ = 960
const toTicks = (t: number) => Math.round((t * TPQ) / AT_TPQ)

export const SCORE_FILE_RE = /\.(gp|gp3|gp4|gp5|gpx|gp7|gp8|xml|musicxml|mxl|capx)$/i

export interface ScoreImport {
  doc: SongDoc
  /** 转换时略过的内容，给用户看 */
  notes: string[]
}

/** 读取乐谱文件并转换 */
export async function importScoreFile(name: string, bytes: Uint8Array): Promise<ScoreImport> {
  const at = await import('@coderline/alphatab')
  const settings = new at.Settings()
  settings.core.logLevel = at.LogLevel.None
  let score: Score
  try {
    score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings)
  } catch (e) {
    throw new Error(`读不了这个文件（${name}）：可能文件损坏，或不是 Guitar Pro / MusicXML 格式。${(e as Error).message ?? ''}`.trim())
  }
  return scoreToSong(score, name)
}

// ---------- 打击乐 ----------

/** GM 鼓的 MIDI 音高 → 鼓轨记号 */
function drumInst(midi: number): DrumInst {
  if (midi === 35 || midi === 36) return 'K'
  if (midi === 38 || midi === 40 || midi === 91) return 'S'
  if (midi === 46) return 'O'
  if ([42, 44, 51, 53, 59, 92, 93, 126, 127].includes(midi)) return 'H'
  if ([49, 52, 55, 57, 30].includes(midi)) return 'C'
  if ([41, 43, 45, 47, 48, 50].includes(midi)) return 'T'
  return 'X'
}

function drumMidi(note: Note, staff: Staff): number {
  const arts = staff.track.percussionArticulations
  const i = note.percussionArticulation
  if (arts?.length && i >= 0 && i < arts.length) return arts[i].outputMidiNumber
  return i
}

// ---------- 一个小节里的拍 ----------

interface Event {
  start: number
  end: number
  beat: Beat
}

/** 把一个小节里所有声部的拍按起始时间合成一串（指弹谱常把低音和旋律分在两个声部） */
function barEvents(staff: Staff, barIndex: number): Event[] {
  const bar = staff.bars[barIndex]
  const out: Event[] = []
  if (!bar) return out
  for (const voice of bar.voices) {
    if (voice.isEmpty) continue
    for (const beat of voice.beats) {
      if (beat.graceType !== 0) continue // 装饰音略过
      out.push({ start: beat.playbackStart, end: beat.playbackStart + beat.playbackDuration, beat })
    }
  }
  return out
}

function noteToken(n: Note, strings: number): string | null {
  if (n.fret < 0 || n.string < 1) return null
  const s = strings + 1 - n.string // alphaTab 的 1 弦是最低音弦
  if (s < 1 || s > 6) return null
  if (n.isDead) return `${s}:x`
  let tech = ''
  if (n.isHammerPullDestination && n.hammerPullOrigin) tech += n.fret >= n.hammerPullOrigin.fret ? 'h' : 'p'
  else if (n.slideOrigin && (n.slideOrigin.slideOutType === 1 || n.slideOrigin.slideOutType === 2)) tech += 's'
  if (n.hasBend) tech += 'b'
  if (n.harmonicType !== 0) tech += '*'
  if (n.vibrato !== 0) tech += '~'
  if (n.accentuated !== 0) tech += '>'
  return `${s}:${n.fret}${tech}`
}

/** 吉他轨一个小节 → tab 记号串 */
function guitarBar(staff: Staff, barIndex: number, barTicks: number): string {
  const events = barEvents(staff, barIndex)
  const strings = staff.tuning.length
  const onsets = [...new Set([0, ...events.map((e) => e.start)])].filter((t) => t < barTicks).sort((a, b) => a - b)
  const toks: string[] = []
  onsets.forEach((t, i) => {
    const next = i + 1 < onsets.length ? onsets[i + 1] : barTicks
    const durs = splitDuration(toTicks(next - t))
    const starting = events.filter((e) => e.start === t && !e.beat.isRest)
    const notes = starting.flatMap((e) => e.beat.notes.filter((n) => !n.isTieDestination))
    const parts = [...new Set(notes.map((n) => noteToken(n, strings)).filter((x): x is string => !!x))].sort((a, b) => parseInt(a) - parseInt(b))
    let head: string
    if (parts.length) head = parts.join('+')
    else {
      // 没有新音：前面的音还在响就延音，否则休止
      const sounding = events.some((e) => !e.beat.isRest && e.start <= t && e.end > t)
      head = sounding ? '-' : 'r'
    }
    toks.push(`${head}/${durs[0]}`)
    for (const d of durs.slice(1)) toks.push(`-/${d}`)
  })
  return toks.join(' ')
}

/** 鼓轨一个小节 → hits 记号串 */
function drumBar(staff: Staff, barIndex: number, barTicks: number): string {
  const events = barEvents(staff, barIndex)
  const onsets = [...new Set([0, ...events.map((e) => e.start)])].filter((t) => t < barTicks).sort((a, b) => a - b)
  const toks: string[] = []
  onsets.forEach((t, i) => {
    const next = i + 1 < onsets.length ? onsets[i + 1] : barTicks
    const durs = splitDuration(toTicks(next - t))
    const notes = events.filter((e) => e.start === t && !e.beat.isRest).flatMap((e) => e.beat.notes)
    const insts = [...new Set(notes.map((n) => drumInst(drumMidi(n, staff))))]
    const head = insts.length ? insts.join('+') : 'r'
    toks.push(`${head}/${durs[0]}`)
    for (const d of durs.slice(1)) toks.push(`-/${d}`)
  })
  return toks.join(' ')
}

const hasContent = (s: string) => /\d:|[KSHOCTX]/.test(s)

// ---------- 调、调弦 ----------

const MAJOR_BY_SHARPS: Record<number, string> = { [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' }
const MINOR_BY_SHARPS: Record<number, string> = { [-7]: 'Abm', [-6]: 'Ebm', [-5]: 'Bbm', [-4]: 'Fm', [-3]: 'Cm', [-2]: 'Gm', [-1]: 'Dm', 0: 'Am', 1: 'Em', 2: 'Bm', 3: 'F#m', 4: 'C#m', 5: 'G#m', 6: 'D#m', 7: 'A#m' }

/** alphaTab 的调弦从高音弦到低音弦；我们的格式低音弦在前。常见调弦写预设名，其它写音名 */
function tuningOf(staff: Staff): string | string[] {
  const notes = [...staff.tuning].reverse()
  const preset = TUNINGS.find((p) => p.notes.join() === notes.join())
  return preset ? preset.id : notes.map((n) => midiToNoteName(n))
}
const isStandard = (t: string | string[]) => t === 'standard'

// ---------- 反复 ----------

interface Block {
  /** 小节下标 */
  bars: number[]
  repeat: number
  name?: string
}

/**
 * 按段落标记和反复记号分块：没有跳房子的简单反复保留成「重复 N 次」的段落，
 * 有跳房子（1. 2. 结尾）的反复按演奏顺序展开。
 */
function planBlocks(masterBars: MasterBar[]): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  const flush = () => {
    if (cur && cur.bars.length) blocks.push(cur)
    cur = null
  }
  let i = 0
  while (i < masterBars.length) {
    const mb = masterBars[i]
    const marker = mb.section?.text?.trim() || mb.section?.marker?.trim() || undefined
    if (mb.isRepeatStart) {
      // 找到反复结束
      let end = i
      while (end < masterBars.length && !(masterBars[end].repeatCount > 0)) end++
      if (end < masterBars.length) {
        const range = masterBars.slice(i, end + 1)
        const count = Math.max(2, masterBars[end].repeatCount)
        const hasAlt = range.some((b) => b.alternateEndings !== 0) || (end + 1 < masterBars.length && masterBars[end + 1].alternateEndings !== 0)
        flush()
        if (!hasAlt) {
          blocks.push({ bars: range.map((_, k) => i + k), repeat: count, name: marker })
          i = end + 1
          continue
        }
        // 有跳房子：按遍数展开，房子小节只在对应的那一遍出现
        const played: number[] = []
        let after = end + 1
        while (after < masterBars.length && masterBars[after].alternateEndings !== 0) after++
        for (let pass = 1; pass <= count; pass++) {
          for (let k = i; k < after; k++) {
            const alt = masterBars[k].alternateEndings
            if (alt === 0 || alt & (1 << (pass - 1))) played.push(k)
            if (k === end && pass < count) break
          }
        }
        blocks.push({ bars: played, repeat: 1, name: marker })
        i = after
        continue
      }
    }
    if (marker || !cur) {
      flush()
      cur = { bars: [], repeat: 1, name: marker }
    }
    cur!.bars.push(i)
    i++
  }
  flush()
  return blocks
}

// ---------- 主流程 ----------

export function scoreToSong(score: Score, fileName: string): ScoreImport {
  const notes: string[] = []
  const guitars: Staff[] = []
  const drums: Staff[] = []
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const label = track.name?.trim() || `第 ${track.index + 1} 轨`
      if (staff.isPercussion) {
        drums.push(staff)
        continue
      }
      const fretted = staff.bars.some((b) => b.voices.some((v) => v.beats.some((bt) => bt.notes.some((n) => n.fret >= 0 && n.string > 0))))
      if (staff.tuning.length === 6 && fretted) guitars.push(staff)
      else if (staff.tuning.length && fretted) notes.push(`略过了「${label}」：${staff.tuning.length} 弦乐器，目前只支持 6 弦吉他`)
      else notes.push(`略过了「${label}」：没有六线谱（钢琴、人声等）`)
    }
  }
  if (!guitars.length && !drums.length) throw new Error('这个文件里没有吉他六线谱可以导入')

  const mbs = score.masterBars
  const first = mbs[0]
  const time = first ? `${first.timeSignatureNumerator}/${first.timeSignatureDenominator}` : '4/4'
  const multi = guitars.length + drums.length > 1
  const main = guitars[0]
  const ids = new Map<Staff, string>()
  guitars.forEach((s, i) => ids.set(s, guitars.length === 1 ? 'G' : `G${i + 1}`))
  drums.forEach((s, i) => ids.set(s, drums.length === 1 ? 'drums' : `D${i + 1}`))

  const customChords: Record<string, string> = {}
  const blocks = planBlocks(mbs)
  const sections: SectionDoc[] = []
  let lastTime = time
  let lastName = ''
  for (const block of blocks) {
    const measures: MeasureDoc[] = []
    for (const bi of block.bars) {
      const mb = mbs[bi]
      const t = `${mb.timeSignatureNumerator}/${mb.timeSignatureDenominator}`
      const barTicks = mb.calculateDuration()
      const m: MeasureDoc = {}
      if (t !== lastTime) m.time = t
      lastTime = t
      if (mb.isAnacrusis) m.pickup = true
      if (main) {
        const tab = guitarBar(main, bi, barTicks)
        if (hasContent(tab)) m.tab = tab
        else m.pattern = null
        // 和弦名、按法
        const beatTicks = (AT_TPQ * 4) / mb.timeSignatureDenominator
        const chords: { name: string; beat: number }[] = []
        for (const e of barEvents(main, bi)) {
          const c = e.beat.chord
          const name = c?.name?.trim()
          if (!c || !name || !isValidChord(name) || chords.some((x) => x.name === name && x.beat === 1 + e.start / beatTicks)) continue
          chords.push({ name, beat: +(1 + e.start / beatTicks).toFixed(3) })
          if (c.strings?.length === 6 && c.strings.some((f) => f >= 0) && !customChords[name]) {
            const frets = [...c.strings].reverse()
            customChords[name] = frets.some((f) => f > 9) ? frets.map((f) => (f < 0 ? 'x' : f)).join(' ') : frets.map((f) => (f < 0 ? 'x' : f)).join('')
          }
        }
        chords.sort((a, b) => a.beat - b.beat)
        if (chords.length === 1 && chords[0].beat === 1) m.chord = chords[0].name
        else if (chords.length) m.chords = chords
        // 歌词
        const words = barEvents(main, bi)
          .sort((a, b) => a.start - b.start)
          .map((e) => e.beat.lyrics?.[0]?.trim())
          .filter((w): w is string => !!w)
        if (words.length) m.lyrics = words.join(' ')
      }
      if (multi) {
        const tracks: Record<string, string> = {}
        for (const g of guitars.slice(1)) {
          const tab = guitarBar(g, bi, barTicks)
          if (hasContent(tab)) tracks[ids.get(g)!] = tab
        }
        for (const d of drums) {
          const hits = drumBar(d, bi, barTicks)
          if (hasContent(hits)) tracks[ids.get(d)!] = hits
        }
        if (Object.keys(tracks).length) m.tracks = tracks
      }
      measures.push(m)
    }
    const name = block.name ?? (sections.length ? lastName : '')
    lastName = name
    const sec: SectionDoc = { name: name || undefined, measures }
    if (block.repeat > 1) sec.repeat = block.repeat
    sections.push(sec)
  }
  // 没有段落标记的曲子：一个大段落，不显示段名
  if (sections.length === 1 && !sections[0].name) sections[0].name = '全曲'

  const doc: SongDoc = {
    format: multi ? 'meipule/2' : 'meipule/1',
    title: score.title?.trim() || fileName.replace(SCORE_FILE_RE, ''),
    tempo: Math.round(score.tempo) || undefined,
    time,
    sections,
  }
  if (score.artist?.trim()) doc.artist = score.artist.trim()
  if (score.music?.trim()) doc.composer = score.music.trim()
  if (score.words?.trim()) doc.lyricist = score.words.trim()
  if (score.tab?.trim()) doc.transcriber = score.tab.trim()
  if (first && (first.keySignature !== 0 || first.keySignatureType === 1))
    doc.key = (first.keySignatureType === 1 ? MINOR_BY_SHARPS : MAJOR_BY_SHARPS)[first.keySignature as number] ?? undefined
  if (Object.keys(customChords).length) doc.chords = customChords

  if (multi) {
    doc.tracks = [...guitars, ...drums].map((s): TrackDoc => {
      const t: TrackDoc = { id: ids.get(s)!, name: s.track.name?.trim() || ids.get(s)! }
      if (s.isPercussion) t.type = 'drums'
      else {
        const tun = tuningOf(s)
        if (!isStandard(tun)) t.tuning = tun
        if (s.capo) t.capo = s.capo
      }
      return t
    })
    if (main?.capo) doc.capo = main.capo
  } else if (main) {
    const tun = tuningOf(main)
    if (!isStandard(tun)) doc.tuning = tun
    if (main.capo) doc.capo = main.capo
  }
  if (notes.length) doc.notes = notes.join('\n')
  return { doc, notes }
}
