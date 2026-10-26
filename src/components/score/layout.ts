// 谱面排版：多声部对齐、按宽度断行、两端对齐
import { TPQ, type CompiledMeasure, type CompiledTabSection, type Score, type TrackType } from '@/lib/notation/types'

export interface LayoutOptions {
  width: number
  scale: number
  showTab: boolean
  showDiagrams: boolean
  showChordNames: boolean
  showMelody: boolean
  showLyrics: boolean
  /** 多轨：不显示的音轨下标（不传时按曲谱里的 hidden） */
  hiddenTracks?: number[]
}

export interface MeasureLayout {
  index: number
  x: number
  width: number
  /** 各起拍点的中心 x（相对系统左侧） */
  ticks: number[]
  xs: number[]
  endX: number
  /** 系统开头的谱号/拍号占位 */
  lead: number
}

export interface Rows {
  label: number
  text: number
  chord: number
  diagram: number
  staff: number
  rhythm: number
  melody: number
  lyrics: number
  bottom: number
}

/** 一条音轨在系统里占的一层（六线谱或鼓谱） */
export interface Lane {
  track: number
  type: TrackType
  name: string
  /** 这一层的顶部（含轨名行） */
  top: number
  /** 六线谱第一条线 / 鼓谱区域顶部 */
  staffTop: number
  /** 小节线下端 */
  staffBot: number
  bottom: number
}

export interface SystemLayout {
  index: number
  section: number
  sectionName: string
  showLabel: boolean
  repeat: number
  isSectionEnd: boolean
  isSectionStart: boolean
  measures: MeasureLayout[]
  y: number
  height: number
  width: number
  rows: Rows
  /** 本段有六线谱内容才画谱线；只有和弦+歌词的段落按和弦谱显示 */
  hasStaff: boolean
  /** 各音轨的谱线层（从上到下） */
  lanes: Lane[]
  /** 多轨曲谱：每层上方显示轨名 */
  multiTrack: boolean
  /** 这一行有简谱音符才留简谱行（前奏、间奏等纯吉他行不留空行） */
  hasMelody: boolean
  verses: number
  hasChords: boolean
  hasText: boolean
}

export interface ScoreLayout {
  systems: SystemLayout[]
  height: number
  width: number
  k: Metrics
  /** 小节 → 所在系统 */
  measureSystem: Map<number, number>
}

export interface Metrics {
  s: number
  gap: number
  fret: number
  chordFont: number
  diagramW: number
  diagramH: number
  jianpu: number
  lyric: number
  padL: number
  padR: number
  clef: number
  timeSig: number
  noteOffset: number
}

export function metrics(scale: number): Metrics {
  const s = scale
  return {
    s,
    gap: 12 * s,
    fret: 12.5 * s,
    chordFont: 13.5 * s,
    diagramW: 34 * s,
    diagramH: 44 * s,
    jianpu: 16 * s,
    lyric: 14.5 * s,
    padL: 12 * s,
    padR: 8 * s,
    clef: 26 * s,
    timeSig: 18 * s,
    noteOffset: 9 * s,
  }
}

// ---------- 文字测量 ----------
let canvas: HTMLCanvasElement | null = null
const widthCache = new Map<string, number>()
export const SCORE_FONT = `"Inter Variable", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif`

export function textWidth(text: string, size: number, weight = 500): number {
  const key = `${weight}|${size}|${text}`
  const hit = widthCache.get(key)
  if (hit !== undefined) return hit
  let w: number
  if (typeof document !== 'undefined') {
    canvas ??= document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    ctx.font = `${weight} ${size}px ${SCORE_FONT}`
    w = ctx.measureText(text).width
  } else {
    w = [...text].reduce((a, c) => a + (/[㐀-鿿]/.test(c) ? size : size * 0.6), 0)
  }
  widthCache.set(key, w)
  return w
}

// ---------- 单小节自然宽度 ----------

interface MeasureNatural {
  ticks: number[]
  widths: number[]
  total: number
}

/** density：基础间距系数，1 为自然间距，小于 1 为紧凑间距（避让约束不变） */
function measureNatural(m: CompiledMeasure, o: LayoutOptions, k: Metrics, lanes: number[], hasMelody: boolean, density = 1): MeasureNatural {
  const set = new Set<number>()
  for (const t of lanes) {
    const p = m.parts[t]
    if (!p) continue
    for (const g of p.guitar) set.add(g.tick)
    for (const h of p.drums) set.add(h.tick)
  }
  if (hasMelody || o.showLyrics) for (const n of m.melody) set.add(n.tick)
  if (o.showChordNames) for (const c of m.chords) set.add(c.tick)
  if (o.showLyrics) for (const l of m.lyricsOnly) set.add(l.tick)
  set.add(0)
  const ticks = [...set].filter((t) => t < m.ticks || t === 0).sort((a, b) => a - b)
  const widths = ticks.map((t, i) => {
    const next = i + 1 < ticks.length ? ticks[i + 1] : Math.max(m.ticks, t + TPQ / 4)
    const d = Math.max(30, next - t)
    return (13 + 23 * Math.pow(d / TPQ, 0.62)) * k.s * density
  })
  const idx = new Map(ticks.map((t, i) => [t, i]))

  // 每一行内相邻元素中心距需要容纳各自宽度
  type Item = { i: number; w: number }
  const rows: Item[][] = []
  const gap = 5 * k.s
  for (const t of lanes) {
    const p = m.parts[t]
    if (!p) continue
    rows.push(
      p.guitar
        .filter((g) => g.kind === 'notes' || g.kind === 'strum')
        .map((g) => {
          const maxDigits = Math.max(1, ...g.notes.map((n) => (n.harmonic ? String(n.fret).length + 2 : String(n.fret).length)))
          return { i: idx.get(g.tick)!, w: (maxDigits * 7.5 + 4) * k.s }
        }),
    )
    rows.push(p.drums.filter((h) => h.kind === 'hit').map((h) => ({ i: idx.get(h.tick)!, w: 10 * k.s })))
  }
  if (hasMelody) rows.push(m.melody.map((n) => ({ i: idx.get(n.tick)!, w: (n.acc ? 15 : 10) * k.s + (n.dotted ? 6 * k.s : 0) })))
  if (o.showChordNames) {
    rows.push(
      m.chords.map((c) => ({
        i: idx.get(c.tick)!,
        w: Math.max(o.showDiagrams ? k.diagramW + 6 * k.s : 0, textWidth(c.name, k.chordFont, 700) + 8 * k.s),
      })),
    )
  }
  if (o.showLyrics) {
    const verses = Math.max(m.verses, ...m.melody.map((n) => n.lyric.length), ...m.lyricsOnly.map((l) => l.text.length))
    for (let v = 0; v < verses; v++) {
      const items: Item[] = []
      for (const n of m.melody) {
        const t = n.lyric[v]
        if (t) items.push({ i: idx.get(n.tick)!, w: textWidth(t, k.lyric, 500) + 4 * k.s })
      }
      for (const l of m.lyricsOnly) {
        const t = l.text[v]
        if (t) items.push({ i: idx.get(l.tick)!, w: textWidth(t, k.lyric, 500) + 4 * k.s })
      }
      items.sort((a, b) => a.i - b.i)
      rows.push(items)
    }
  }
  for (const row of rows) {
    for (let r = 0; r < row.length; r++) {
      const a = row[r]
      const b = row[r + 1]
      const need = b ? (a.w + b.w) / 2 + gap : a.w / 2 + 2 * k.s
      const end = b ? b.i : widths.length
      let sum = 0
      for (let i = a.i; i < end; i++) sum += widths[i]
      if (!b) sum += k.padR - k.noteOffset
      if (sum < need && end > a.i) {
        const f = need / Math.max(1, sum)
        for (let i = a.i; i < end; i++) widths[i] *= f
      }
    }
  }
  const total = widths.reduce((a, b) => a + b, 0) + k.padL + k.padR
  return { ticks, widths, total }
}

// ---------- 整体排版 ----------

export function layoutScore(score: Score, o: LayoutOptions): ScoreLayout {
  const k = metrics(o.scale)
  const hasMelody = o.showMelody && score.hasMelody
  const multiTrack = score.tracks.length > 1
  const hidden = o.hiddenTracks ?? score.tracks.flatMap((t, i) => (t.hidden ? [i] : []))
  const avail = Math.max(240, o.width)
  // 放不下时允许把间距压到多紧：窄屏（手机竖屏）压得更狠，好让一行多放小节
  const density = avail < 640 ? 0.62 : 0.85
  const systems: SystemLayout[] = []
  const measureSystem = new Map<number, number>()
  let y = 0

  const tabSections = score.sections.filter((s): s is CompiledTabSection => s.kind === 'tab')
  for (const sec of tabSections) {
    if (!sec.measures.length) continue
    // 本段要画的音轨：没隐藏、并且本段有内容
    const secLanes = o.showTab
      ? score.tracks
          .map((_, t) => t)
          .filter((t) => !hidden.includes(t) && sec.measures.some((mi) => {
            const p = score.measures[mi].parts[t]
            return !!p && (p.guitar.length > 0 || p.drums.length > 0)
          }))
      : []
    const secStaff = secLanes.length > 0
    const naturals = sec.measures.map((mi) => measureNatural(score.measures[mi], o, k, secLanes, hasMelody))
    const tights = sec.measures.map((mi) => measureNatural(score.measures[mi], o, k, secLanes, hasMelody, density))
    // 断行
    const lines: number[][] = []
    let cur: number[] = []
    let used = 0
    sec.measures.forEach((mi, j) => {
      const m = score.measures[mi]
      const lead = (cur.length === 0 ? (secStaff ? k.clef : 6 * k.s) : 0) + (m.showTime ? k.timeSig : 0)
      const w = tights[j].total + lead
      if (cur.length && used + w > avail) {
        lines.push(cur)
        cur = []
        used = 0
        const lead2 = (secStaff ? k.clef : 6 * k.s) + (m.showTime ? k.timeSig : 0)
        cur.push(j)
        used = tights[j].total + lead2
      } else {
        cur.push(j)
        used += w
      }
    })
    if (cur.length) lines.push(cur)

    lines.forEach((line, li) => {
      const isLast = li === lines.length - 1
      const leads = line.map((j, p) => (p === 0 ? (secStaff ? k.clef : 6 * k.s) : 0) + (score.measures[sec.measures[j]].showTime ? k.timeSig : 0))
      const natural = line.reduce((a, j, p) => a + naturals[j].total + leads[p], 0)
      const tight = line.reduce((a, j, p) => a + tights[j].total + leads[p], 0)
      // 自然间距放不下时，在紧凑与自然之间插值，正好占满一行
      const mix = natural <= avail ? 1 : tight >= avail ? 0 : (avail - tight) / (natural - tight)
      const slotW = (j: number, i: number) => tights[j].widths[i] + mix * (naturals[j].widths[i] - tights[j].widths[i])
      const base = natural <= avail ? natural : Math.max(tight, avail)
      const fill = base / avail
      const stretch = !isLast || fill > 0.72 || (lines.length > 1 && fill > 0.55) ? Math.max(1, avail / base) : 1
      const leadSum = leads.reduce((a, b) => a + b, 0)
      const pads = line.length * (k.padL + k.padR)
      const slotTotal = base - leadSum - pads
      // 单个小节连紧凑间距都放不下时硬压，宁可挤一点也不要超出屏幕被裁掉
      const slotScale = stretch > 1 || base > avail ? (avail - leadSum - pads) / slotTotal : 1

      let x = 0
      const ms: MeasureLayout[] = line.map((j, p) => {
        const mi = sec.measures[j]
        const nat = naturals[j]
        const lead = leads[p]
        const startX = x
        let cx = startX + lead + k.padL
        const xs: number[] = []
        nat.widths.forEach((_, i) => {
          xs.push(cx + k.noteOffset)
          cx += slotW(j, i) * slotScale
        })
        const endX = cx + k.padR
        x = endX
        return { index: mi, x: startX, width: endX - startX, ticks: nat.ticks, xs, endX, lead }
      })

      // 行高
      const mm = line.map((j) => score.measures[sec.measures[j]])
      const hasChords = o.showChordNames && mm.some((m) => m.chords.length > 0)
      const hasText = mm.some((m) => !!m.text)
      const lineMelody = hasMelody && mm.some((m) => m.melody.length > 0)
      const verses = o.showLyrics
        ? Math.max(0, ...mm.map((m) => Math.max(m.verses, ...m.melody.map((n) => n.lyric.length), ...m.lyricsOnly.map((l) => l.text.length))))
        : 0
      const showLabel = li === 0
      const rows = {} as Rows
      let ry = 0
      rows.label = ry
      if (showLabel) ry += 30 * k.s
      rows.text = ry
      if (hasText) ry += 16 * k.s
      rows.chord = ry
      if (hasChords) ry += 20 * k.s
      rows.diagram = ry
      if (hasChords && o.showDiagrams) ry += k.diagramH + 4 * k.s
      if (!hasChords && !hasText && !showLabel) ry += 8 * k.s
      // 各音轨一层：多轨时每层上方留一行写轨名和本轨标注
      const laneText = (t: number) => mm.some((m) => !!m.parts[t]?.text)
      const lanes: Lane[] = secLanes.map((t) => {
        const tk = score.tracks[t]
        const top = ry
        if (multiTrack || laneText(t)) ry += 13 * k.s
        const staffTop = ry + 6 * k.s
        let staffBot: number
        if (tk.type === 'drums') {
          staffBot = staffTop + 18 * k.s
          ry = staffTop + 8 * k.s + 30 * k.s + 4 * k.s
        } else {
          staffBot = staffTop + k.gap * 5
          ry = staffBot + 4 * k.s + 30 * k.s
        }
        return { track: t, type: tk.type, name: tk.name, top, staffTop, staffBot, bottom: ry }
      })
      rows.staff = lanes[0]?.staffTop ?? ry + 6 * k.s
      rows.rhythm = lanes.length ? lanes[lanes.length - 1].bottom - 30 * k.s : ry
      rows.melody = ry
      if (lineMelody) ry += 38 * k.s
      rows.lyrics = ry
      ry += verses * 22 * k.s
      rows.bottom = ry
      const height = ry + 22 * k.s

      const sys: SystemLayout = {
        index: systems.length,
        section: sec.index,
        sectionName: sec.name,
        showLabel,
        repeat: sec.repeat,
        isSectionEnd: isLast,
        isSectionStart: li === 0,
        measures: ms,
        y,
        height,
        width: x,
        rows,
        hasStaff: secStaff,
        lanes,
        multiTrack,
        hasMelody: lineMelody,
        verses,
        hasChords,
        hasText,
      }
      for (const m of ms) measureSystem.set(m.index, sys.index)
      systems.push(sys)
      y += height
    })
  }
  return { systems, height: y, width: avail, k, measureSystem }
}

/** 小节内 tick → x（在起拍点之间线性插值） */
export function tickToX(m: MeasureLayout, measureTicks: number, tick: number): number {
  const { ticks, xs } = m
  if (!ticks.length) return m.x
  if (tick <= ticks[0]) return xs[0]
  for (let i = 0; i < ticks.length - 1; i++) {
    if (tick < ticks[i + 1]) {
      const f = (tick - ticks[i]) / (ticks[i + 1] - ticks[i])
      return xs[i] + f * (xs[i + 1] - xs[i])
    }
  }
  const last = ticks.length - 1
  const endTick = Math.max(measureTicks, ticks[last] + 1)
  const endX = m.endX - 6
  const f = Math.min(1, (tick - ticks[last]) / (endTick - ticks[last]))
  return xs[last] + f * (endX - xs[last])
}
