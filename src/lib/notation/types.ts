// 「没谱了」曲谱格式：输入（JSON 文档）与编译后的谱面模型
import type { ChordShape } from '../music/chords'

// ======================= 输入：JSON 文档 =======================

export type ChordDef = string | number[] | { frets: string | number[]; fingers?: string | number[] }

export interface PatternDef {
  name?: string
  /** 默认时值（4 = 四分，8 = 八分，16 = 十六分） */
  unit?: number
  /** 步骤串，如 "T 3 2 3 1 3 2 3" 或 "D - D U - U D U" */
  steps: string
}

export interface MeasureDoc {
  /** 整小节一个和弦 */
  chord?: string
  /** 小节内多个和弦："F C"（平均分配）、"C - - G"（按拍）或 [{name, beat}] */
  chords?: string | (string | { name: string; beat: number })[]
  /** 使用的节奏型 id；null 表示本小节不生成伴奏 */
  pattern?: string | null
  /** 精确的六线谱记法，覆盖节奏型 */
  tab?: string
  /** 简谱旋律 */
  melody?: string
  /** 歌词；数组表示多段歌词（第一段、第二段…） */
  lyrics?: string | string[]
  /** 小节上方的文字标注 */
  text?: string
  /** 本小节拍号（仅本小节） */
  time?: string
  /** 弱起小节：时值按实际内容计算 */
  pickup?: boolean
  /**
   * 多轨（meipule/2）：其它音轨在本小节的内容，键为音轨 id。
   * 字符串是简写：吉他轨当作 tab，鼓轨当作 hits；"%" 表示同上一小节，"%4" 表示同 4 小节之前（Loop）。
   */
  tracks?: Record<string, string | TrackMeasureDoc>
}

/** 某一轨在某个小节里的内容 */
export interface TrackMeasureDoc {
  /** 吉他轨：精确六线谱，或 "%" / "%N" 复制之前的小节 */
  tab?: string
  /** 吉他轨：节奏型 id；null 表示本小节不弹 */
  pattern?: string | null
  /** 吉他轨：本轨单独的和弦（默认沿用小节的和弦） */
  chord?: string
  chords?: string | (string | { name: string; beat: number })[]
  /** 鼓轨：击打记号串，如 "K/4 S K S" */
  hits?: string
  /** 本轨上方的文字标注（如「开始第二轨 Loop」） */
  text?: string
}

export type TrackType = 'guitar' | 'drums'

/** 音轨定义（meipule/2） */
export interface TrackDoc {
  /** 唯一标识，小节里用它引用，如 "G2"、"kick" */
  id: string
  /** 显示名，默认同 id */
  name?: string
  /** guitar（默认）或 drums */
  type?: TrackType
  /** 吉他轨调弦，默认用全曲 tuning */
  tuning?: string | (string | number)[]
  /** 吉他轨变调夹，默认用全曲 capo */
  capo?: number
  /** 本轨默认节奏型 */
  pattern?: string
  /** 音量 0-1，默认 1 */
  volume?: number
  /** 默认在谱面上隐藏（仍会播放） */
  hidden?: boolean
}

export interface SectionDoc {
  name?: string
  /** 整段重复次数 */
  repeat?: number
  /** 本段默认节奏型 */
  pattern?: string
  /** 本段拍号 */
  time?: string
  /** 和弦进行速记："G | D | Em C | C" */
  progression?: string
  measures?: (MeasureDoc | string)[]
  /** 和弦歌词谱（ChordPro 风格）："[C]好一朵美丽的[Am]茉莉花" */
  lines?: string[]
  /** 段落备注 */
  note?: string
  /** 多轨：各音轨在本段的默认设置（目前支持 pattern） */
  tracks?: Record<string, { pattern?: string | null }>
}

export interface SongDoc {
  format?: string
  title: string
  artist?: string
  album?: string
  composer?: string
  lyricist?: string
  transcriber?: string
  /** 原调（实际发声的调），如 "G"、"Am" */
  key?: string
  /** 变调夹品位 */
  capo?: number
  /** 速度 BPM（以拍号分母为一拍） */
  tempo?: number
  /** 拍号，如 "4/4" "3/4" "6/8" */
  time?: string
  tuning?: string | (string | number)[]
  difficulty?: number
  tags?: string[]
  notes?: string
  /** 全曲默认节奏型 */
  pattern?: string
  chords?: Record<string, ChordDef>
  patterns?: Record<string, PatternDef | string>
  /** 多轨（meipule/2）：音轨列表；不写时只有一条吉他轨 */
  tracks?: TrackDoc[]
  sections: SectionDoc[]
}

// ======================= 编译结果：谱面模型 =======================

/** 每个四分音符的 tick 数 */
export const TPQ = 480

export interface DurSpec {
  base: number // 1 2 4 8 16 32
  dots: number
  triplet: boolean
}

export type Tech = 'h' | 'p' | 's' | 'b'

export interface TabNote {
  string: number // 1-6，1 为最细的高音 E 弦
  fret: number
  dead?: boolean
  tech?: Tech
  harmonic?: boolean
  vibrato?: boolean
  accent?: boolean
  midi: number // 不含变调夹
}

export interface StrumInfo {
  dir: 'down' | 'up' | 'chop'
  light: boolean
  accent: boolean
  /** 覆盖的弦号范围 [低音弦号, 高音弦号]，如 [6, 1] */
  from: number
  to: number
  notes: TabNote[]
}

export interface GuitarBeat {
  tick: number
  /** 合并延音后的实际时值 */
  dur: number
  durSpec: DurSpec
  kind: 'notes' | 'strum' | 'rest' | 'hold'
  notes: TabNote[]
  strum?: StrumInfo
  chord?: string
}

export interface MelodyNote {
  tick: number
  dur: number
  durSpec: DurSpec
  kind: 'note' | 'rest' | 'hold'
  degree: number
  acc: number
  octave: number
  dotted: boolean
  /** 每段歌词对应的字 */
  lyric: (string | undefined)[]
  midi?: number
}

export interface ChordMark {
  tick: number
  name: string
  shape: ChordShape | null
  valid: boolean
}

export interface LyricOnly {
  tick: number
  text: (string | undefined)[]
}

export type DrumInst = 'K' | 'S' | 'H' | 'O' | 'C' | 'T' | 'X'

export interface DrumHit {
  tick: number
  dur: number
  durSpec: DurSpec
  kind: 'hit' | 'rest' | 'hold'
  notes: { inst: DrumInst; accent: boolean; light: boolean }[]
}

/** 某一轨在某个小节里的编译结果 */
export interface MeasurePart {
  /** 吉他轨的拍 */
  guitar: GuitarBeat[]
  /** 鼓轨的击打 */
  drums: DrumHit[]
  /** 本轨上方的标注 */
  text?: string
}

export interface TrackInfo {
  id: string
  name: string
  type: TrackType
  /** 吉他轨：各弦空弦 MIDI（6 弦在前） */
  tuning: number[]
  tuningName: string
  /** 吉他轨变调夹（含移调后的调整） */
  capo: number
  volume: number
  hidden: boolean
  /** 本轨在全曲是否有内容 */
  hasContent: boolean
}

export interface CompiledMeasure {
  index: number
  section: number
  indexInSection: number
  /** 实际内容时长 */
  ticks: number
  /** 拍号要求的时长 */
  expectedTicks: number
  timeNum: number
  timeDen: number
  showTime: boolean
  chords: ChordMark[]
  /** 小节开头生效的和弦（可能延续自上一小节） */
  startChord?: string
  /** 主轨（第一条吉他轨）的拍，等于 parts[主轨].guitar */
  guitar: GuitarBeat[]
  /** 各音轨的内容，下标对应 score.tracks */
  parts: MeasurePart[]
  melody: MelodyNote[]
  lyricsOnly: LyricOnly[]
  verses: number
  text?: string
  pickup: boolean
}

export interface LyricSegment {
  chord?: string
  text: string
}

export interface LyricLine {
  kind: 'lyric' | 'chords' | 'heading' | 'blank'
  segments: LyricSegment[]
  text?: string
}

export interface CompiledTabSection {
  kind: 'tab'
  index: number
  name: string
  repeat: number
  measures: number[]
  note?: string
}

export interface CompiledLinesSection {
  kind: 'lines'
  index: number
  name: string
  lines: LyricLine[]
  note?: string
}

export type CompiledSection = CompiledTabSection | CompiledLinesSection

export interface Diagnostic {
  level: 'error' | 'warning' | 'info'
  where: string
  message: string
}

export interface CompileOptions {
  /** 指法移调（半音），配合变调夹保持原调 */
  shift?: number
  /** 变调夹覆盖 */
  capo?: number
}

export interface Score {
  title: string
  artist: string
  meta: {
    album?: string
    composer?: string
    lyricist?: string
    transcriber?: string
    difficulty?: number
    tags: string[]
    notes?: string
  }
  /** 原调（文档里写的） */
  originalKey: string | null
  /** 当前指法调（移调后） */
  shapeKey: string | null
  /** 实际发声调 */
  soundingKey: string | null
  /** 简谱 1 = ? */
  doName: string | null
  shift: number
  capo: number
  originalCapo: number
  tempo: number
  timeNum: number
  timeDen: number
  tuning: number[]
  tuningName: string
  /** 音轨；单轨曲谱也有一条（主轨） */
  tracks: TrackInfo[]
  /** 主轨（第一条吉他轨）在 tracks 中的下标 */
  mainTrack: number
  sections: CompiledSection[]
  measures: CompiledMeasure[]
  chordsUsed: { name: string; shape: ChordShape | null }[]
  hasMelody: boolean
  hasLyrics: boolean
  hasTab: boolean
  diagnostics: Diagnostic[]
  /** 简谱 do 的 MIDI（实际发声，含变调夹） */
  doMidi: number
}
