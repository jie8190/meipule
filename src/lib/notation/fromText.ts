// 文字谱转换：网页、App 里复制来的弹唱谱（和弦写在歌词上方 / [C] 内嵌 / ChordPro / 文字六线谱）→「没谱了」格式。
// 全部在本地按规则转换，不需要 AI。
import { isValidChord } from '../music/chords'
import { splitDuration } from './parse'
import type { MeasureDoc, SectionDoc, SongDoc } from './types'

export interface TextImport {
  doc: SongDoc
  notes: string[]
}

// ---------- 宽度：等宽排版里中文、全角字符占两格 ----------

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
const charWidth = (c: string) => (WIDE.test(c) ? 2 : 1)

/** 每个字符起始的列号 */
function columns(line: string): { chars: string[]; cols: number[] } {
  const chars = [...line]
  const cols: number[] = []
  let c = 0
  for (const ch of chars) {
    cols.push(c)
    c += charWidth(ch)
  }
  return { chars, cols }
}

// ---------- 行的种类 ----------

/** 和弦行里允许出现的非和弦记号 */
const FILLER = /^(\||\|\||-+|%|\/|\.+|x\d+|\(x?\d+\)|N\.?C\.?|\(|\)|→|:\|\||\|\|:)$/i

function chordToken(t: string): string | null {
  const s = t.replace(/^[([]+|[)\]]+$/g, '')
  return s && isValidChord(s) ? s : null
}

/** 整行都是和弦（夹杂小节线、反复记号也算） */
function isChordLine(line: string): boolean {
  const toks = line.trim().split(/\s+/).filter(Boolean)
  if (!toks.length) return false
  let chords = 0
  for (const t of toks) {
    if (chordToken(t)) chords++
    else if (!FILLER.test(t)) return false
  }
  return chords > 0
}

const SECTION_WORDS =
  /^(前奏|间奏|尾奏|主歌|副歌|桥段|过门|结尾|尾声|间奏曲|独奏|solo|intro|verse|pre-?chorus|chorus|bridge|outro|interlude|instrumental|refrain|hook|coda|ending|break|riff)\s*[a-z0-9一二三四五ⅠⅡⅢ]{0,3}$/i

/** 段落标题：[Verse 1]、【副歌】、主歌：、Chorus: 等；返回标题和同一行后面的和弦 */
function sectionHeader(line: string): { name: string; rest: string } | null {
  const t = line.trim()
  let m = /^\[([^\]]+)\]\s*(.*)$/.exec(t)
  if (m && !isValidChord(m[1].trim()) && !/\[[^\]]+\]/.test(m[2])) return { name: m[1].trim(), rest: m[2] }
  m = /^【([^】]+)】\s*[:：]?\s*(.*)$/.exec(t)
  if (m) return { name: m[1].trim(), rest: m[2] }
  m = /^([^:：\s][^:：]{0,15}?)\s*[:：]\s*(.*)$/.exec(t)
  if (m && SECTION_WORDS.test(m[1].trim()) && (!m[2] || isChordLine(m[2]))) return { name: m[1].trim(), rest: m[2] }
  if (SECTION_WORDS.test(t)) return { name: t, rest: '' }
  return null
}

/** 文字六线谱的一行：e|---0---|、B|-1-----| */
const TAB_LINE = /^\s*([eBGDAEbgdaE]|[1-6])?\s*[|:]?[-0-9hpbrsx/\\~|().*<>^=\s]{6,}$/
function isTabLine(line: string) {
  return TAB_LINE.test(line) && (line.match(/-/g)?.length ?? 0) >= 4
}

// ---------- 和弦对到歌词上 ----------

/** 和弦行 + 歌词行 → "[C]好一朵[Am]美丽的茉莉花"；按列号对齐，中文按两格算 */
export function mergeChordLyric(chordLine: string, lyric: string): string {
  const marks: { col: number; name: string }[] = []
  const { chars: cc, cols: ccols } = columns(chordLine)
  let i = 0
  while (i < cc.length) {
    if (/\s/.test(cc[i])) {
      i++
      continue
    }
    let j = i
    while (j < cc.length && !/\s/.test(cc[j])) j++
    const tok = cc.slice(i, j).join('')
    const name = chordToken(tok)
    if (name) marks.push({ col: ccols[i] + (tok.length - tok.replace(/^[([]+/, '').length), name })
    i = j
  }
  const { chars, cols } = columns(lyric.replace(/\s+$/, ''))
  const end = chars.length ? cols[chars.length - 1] + charWidth(chars[chars.length - 1]) : 0
  const at = new Map<number, string[]>()
  for (const mk of marks) {
    // 和弦落在哪个字上：起始列 >= 和弦列的第一个字；落在中文字的后半格时算这个字
    let k = chars.findIndex((_, x) => cols[x] + charWidth(chars[x]) > mk.col)
    if (k < 0 || mk.col >= end) k = chars.length
    // 和弦正对空格时，挪到后面第一个字上
    while (k < chars.length && /\s/.test(chars[k])) k++
    at.set(k, [...(at.get(k) ?? []), mk.name])
  }
  let out = ''
  for (let k = 0; k <= chars.length; k++) {
    for (const n of at.get(k) ?? []) out += `[${n}]`
    if (k < chars.length) out += chars[k]
  }
  return out.trim()
}

/** 只有和弦的行（前奏、间奏）：统一成 "| C | G | Am |" 或 "C G Am" */
function chordOnlyLine(line: string): string {
  const toks = line.trim().split(/\s+/).filter(Boolean)
  const out = toks.map((t) => chordToken(t) ?? (/^\|+:?|:?\|+$/.test(t) ? '|' : t === '-' || t === '%' ? t : '')).filter(Boolean)
  return out.join(' ')
}

// ---------- 文字六线谱 → 小节 ----------

/**
 * 6 行文字六线谱 → 小节。文字谱没有节奏，按字符间距估算时值（量化到十六分音符，每小节补满 4/4）。
 */
export function asciiTabToMeasures(lines: string[]): MeasureDoc[] {
  // 去掉行首的弦名
  const rows = lines.map((l) => l.replace(/^\s*([eBGDAEbgda]|[1-6])?\s*/, ''))
  const width = Math.max(...rows.map((r) => r.length))
  const grid = rows.map((r) => r.padEnd(width, '-'))
  // 小节线：所有行同一列都是 |（行首行尾的也算）
  const bars: number[] = []
  for (let c = 0; c < width; c++) if (grid.every((r) => r[c] === '|')) bars.push(c)
  if (!bars.length || bars[0] > 1) bars.unshift(-1)
  if (bars[bars.length - 1] < width - 2) bars.push(width)
  const measures: MeasureDoc[] = []
  for (let b = 0; b + 1 < bars.length; b++) {
    const from = bars[b] + 1
    const to = bars[b + 1]
    if (to - from < 2) continue
    // 每根弦上的音：起始列、品位、技巧
    type Hit = { col: number; tok: string }
    const hits: Hit[] = []
    grid.forEach((r, si) => {
      let c = from
      let tech = ''
      while (c < to) {
        const ch = r[c]
        if (/\d/.test(ch)) {
          let d = ch
          if (/\d/.test(r[c + 1] ?? '') && c + 1 < to && Number(ch + r[c + 1]) <= 24) d += r[++c]
          hits.push({ col: c - d.length + 1, tok: `${si + 1}:${d}${tech}` })
          tech = ''
        } else if (ch === 'x' || ch === 'X') {
          hits.push({ col: c, tok: `${si + 1}:x` })
        } else if (ch === 'h' || ch === 'p' || ch === 'b') tech = ch
        else if (ch === '/' || ch === '\\' || ch === 's') tech = 's'
        else if (ch === '~') tech = '~'
        c++
      }
    })
    if (!hits.length) {
      measures.push({ tab: 'r/1' })
      continue
    }
    const cols = [...new Set(hits.map((h) => h.col))].sort((a, b) => a - b)
    // 小节开头的一两个 - 只是排版间隔：不超过音符间距时不算休止
    const minGap = Math.min(...cols.slice(1).map((c, k) => c - cols[k]), to - cols[cols.length - 1])
    const start = cols[0] - from <= minGap ? cols[0] : from
    const span = to - start
    // 每个音占到下一个音为止，按字符比例分配；音很多时用三十二分音符为单位
    const units = cols.length > 12 ? 32 : 16
    const unitTicks = 1920 / units
    const slots = cols.map((c, k) => Math.max(1, Math.round((((k + 1 < cols.length ? cols[k + 1] : to) - c) / span) * units)))
    const lead = Math.round(((cols[0] - start) / span) * units)
    let total = lead + slots.reduce((a, x) => a + x, 0)
    // 补齐或压缩到正好一小节
    for (let k = slots.length - 1; total !== units && k >= 0; k--) {
      const adj = Math.max(1 - slots[k], units - total)
      slots[k] += adj
      total += adj
    }
    const toks: string[] = []
    if (lead > 0) splitDuration(lead * unitTicks).forEach((d) => toks.push(`r/${d}`))
    cols.forEach((c, k) => {
      const notes = hits.filter((h) => h.col === c).map((h) => h.tok).sort((a, b) => parseInt(a) - parseInt(b))
      const durs = splitDuration(slots[k] * unitTicks)
      toks.push(`${notes.join('+')}/${durs[0]}`)
      for (const d of durs.slice(1)) toks.push(`-/${d}`)
    })
    measures.push({ tab: toks.join(' ') })
  }
  return measures
}

// ---------- 主流程 ----------

/** 看起来像文字谱：有和弦行、[C] 内嵌和弦、ChordPro 指令或文字六线谱 */
export function looksLikeChordSheet(text: string): boolean {
  const lines = text.split(/\r?\n/)
  let score = 0
  for (const l of lines) {
    if (!l.trim()) continue
    if (/^\s*\{[a-z_]+(:.*)?\}\s*$/i.test(l)) score += 2
    else if (isChordLine(l)) score++
    else if ((l.match(/\[([^\]]+)\]/g) ?? []).filter((m) => isValidChord(m.slice(1, -1))).length) score++
    else if (isTabLine(l)) score++
  }
  return score >= 2
}

export function chordSheetToSong(raw: string): TextImport | null {
  if (!looksLikeChordSheet(raw)) return null
  const notes: string[] = []
  const text = raw
    .replace(/\r/g, '')
    .replace(/\t/g, '    ')
    .replace(/ /g, ' ')
    // Ultimate Guitar 复制出来的标记
    .replace(/\[\/?(ch|tab)\]/g, '')
  const lines = text.split('\n')
  const meta: Partial<SongDoc> = {}
  const sections: SectionDoc[] = []
  let cur: SectionDoc | null = null
  const ensure = () => (cur ??= { name: '', lines: [] })
  const push = (line: string) => {
    // 六线谱段落后面接着歌词：另起一段（同一段里不能既有小节又有和弦歌词）
    if (cur?.measures?.length) {
      if (line === '') return
      startSection('')
    }
    const sec = ensure()
    if (!sec.lines) sec.lines = []
    if (line === '' && (!sec.lines.length || sec.lines[sec.lines.length - 1] === '')) return
    sec.lines.push(line)
  }
  const startSection = (name: string) => {
    if (cur && ((cur.lines?.length ?? 0) || (cur.measures?.length ?? 0))) sections.push(cur)
    cur = { name, lines: [] }
  }

  // 标题、歌手、变调夹等：只看开头几行和明确写出来的字段
  const metaLine = (l: string): boolean => {
    const t = l.trim()
    let m: RegExpExecArray | null
    if ((m = /^(?:title|歌名|曲名)\s*[:：]\s*(.+)$/i.exec(t))) return ((meta.title = m[1].trim()), true)
    if ((m = /^(?:artist|singer|演唱|歌手|原唱)\s*[:：]\s*(.+)$/i.exec(t))) return ((meta.artist = m[1].trim()), true)
    if ((m = /^(?:capo|变调夹|夹)\s*[:：]?\s*(?:第\s*)?(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:fret|品)?\s*$/i.exec(t)))
      return ((meta.capo = Number(m[1])), true)
    if ((m = /^夹\s*(\d{1,2})\s*品$/.exec(t))) return ((meta.capo = Number(m[1])), true)
    if ((m = /^(?:no\s+capo|不夹|无变调夹)$/i.exec(t))) return true
    if ((m = /^(?:tempo|bpm|速度|拍速)\s*[:：]?\s*(\d{2,3})\s*(?:bpm)?$/i.exec(t))) return ((meta.tempo = Number(m[1])), true)
    if ((m = /^(?:原调|原唱调)\s*[:：]?\s*(?:1\s*=\s*)?([A-G][#b]?m?)\s*$/.exec(t))) return ((meta.key = m[1]), true)
    if ((m = /^(?:time|拍号)\s*[:：]?\s*(\d{1,2}\/\d{1,2})$/i.exec(t))) return ((meta.time = m[1]), true)
    if (/^(?:tuning|调弦)\s*[:：]/i.test(t)) {
      notes.push(`原谱写着「${t}」，调弦请在编辑器里确认`)
      return true
    }
    if (/^(?:作词|作曲|编曲|制谱|词|曲|lyrics by|music by|key)\s*[:：]/i.test(t)) return true
    return false
  }

  let firstContent = lines.findIndex((l) => l.trim())
  // 第一行不是和弦、标题、六线谱、指令，就当作曲名（「歌名 - 歌手」拆开）
  if (firstContent >= 0) {
    const l = lines[firstContent].trim()
    if (!isChordLine(l) && !sectionHeader(l) && !isTabLine(l) && !l.startsWith('{') && !/\[[^\]]+\]/.test(l) && !metaLine(l) && [...l].length <= 40) {
      const next = lines.slice(firstContent + 1).find((x) => x.trim()) ?? ''
      const nextIsLyric = !isChordLine(next) && !sectionHeader(next) && !isTabLine(next) && !metaLine(next.trim()) && !/^\s*\{/.test(next)
      // 下一行还是普通歌词：说明第一行也是歌词，不当标题
      const blankAfter = !lines[firstContent + 1]?.trim()
      if (!nextIsLyric || blankAfter) {
        const parts = l.split(/\s+[-–—]\s+|\s*[-–—]{2}\s*/)
        meta.title = parts[0].trim()
        if (parts[1] && !meta.artist) meta.artist = parts[1].trim()
        firstContent++
      }
    }
  }

  let tabBlock: string[] = []
  const flushTab = () => {
    if (!tabBlock.length) return
    if (tabBlock.length % 6 === 0) {
      // 紧挨着的几组谱（中间没空行）按 6 行一组
      const measures: MeasureDoc[] = []
      for (let k = 0; k < tabBlock.length; k += 6) measures.push(...asciiTabToMeasures(tabBlock.slice(k, k + 6)))
      if (measures.length) {
        // 前面已经有和弦歌词：六线谱另起一段（同一段里不能既有小节又有和弦歌词）
        if (cur?.lines?.some((l) => l !== '')) startSection(`${cur.name || '六线谱'}`)
        const sec = ensure()
        delete sec.lines
        if (!sec.name) sec.name = '六线谱'
        sec.measures = [...(sec.measures ?? []), ...measures]
        if (!notes.some((n) => n.startsWith('文字六线谱'))) notes.push('文字六线谱没有记节奏，时值是按字符间距估算的，播放前最好在编辑器里核对')
      }
    } else notes.push(`略过了一段 ${tabBlock.length} 行的文字六线谱（只支持 6 弦）`)
    tabBlock = []
  }

  for (let i = Math.max(0, firstContent); i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (isTabLine(line)) {
      tabBlock.push(line)
      continue
    }
    flushTab()
    if (!t) {
      push('')
      continue
    }
    // ChordPro 指令
    const dir = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(t)
    if (dir) {
      const [, k, v = ''] = dir
      const key = k.toLowerCase()
      if (key === 'title' || key === 't') meta.title = v
      else if (key === 'subtitle' || key === 'st' || key === 'artist') meta.artist ??= v
      else if (key === 'capo') meta.capo = Number(v) || undefined
      else if (key === 'tempo') meta.tempo = Number(v) || undefined
      else if (key === 'time') meta.time = v
      else if (key === 'key') meta.key ??= v
      else if (/^(start_of_|so)(chorus|c)$/.test(key) || key === 'soc') startSection(v || '副歌')
      else if (/^(start_of_verse|sov)$/.test(key)) startSection(v || '主歌')
      else if (/^(start_of_bridge|sob)$/.test(key)) startSection(v || '桥段')
      else if (/^(start_of_tab|sot)$/.test(key)) startSection(v || '六线谱')
      else if (/^(comment|c|ci|comment_italic|highlight)$/.test(key) && v) push(`# ${v}`)
      continue
    }
    if (metaLine(t)) continue
    const head = sectionHeader(line)
    if (head) {
      startSection(head.name)
      if (head.rest && isChordLine(head.rest)) push(chordOnlyLine(head.rest))
      continue
    }
    if (isChordLine(line)) {
      const next = lines[i + 1] ?? ''
      // 下一行是歌词：合并；否则是只有和弦的一行
      if (next.trim() && !isChordLine(next) && !sectionHeader(next) && !isTabLine(next) && !/^\s*\{/.test(next) && !/\[[^\]]+\]/.test(next)) {
        push(mergeChordLyric(line, next))
        i++
      } else push(chordOnlyLine(line))
      continue
    }
    push(t)
  }
  flushTab()
  if (cur && (((cur as SectionDoc).lines?.length ?? 0) || ((cur as SectionDoc).measures?.length ?? 0))) sections.push(cur)

  // 段落首尾的空行去掉；没有名字的段落起个名
  const out: SectionDoc[] = []
  for (const s of sections) {
    if (s.lines) {
      while (s.lines.length && s.lines[0] === '') s.lines.shift()
      while (s.lines.length && s.lines[s.lines.length - 1] === '') s.lines.pop()
      if (!s.lines.length) continue
    }
    if (!s.name) s.name = out.length ? '段落' : sections.length > 1 ? '开头' : '全曲'
    out.push(s)
  }
  if (!out.length) return null

  const doc: SongDoc = { format: 'meipule/1', title: meta.title?.trim() || '未命名曲谱', sections: out }
  if (meta.artist) doc.artist = meta.artist
  if (meta.key && isValidChord(meta.key)) doc.key = meta.key
  if (meta.capo) doc.capo = meta.capo
  if (meta.tempo) doc.tempo = meta.tempo
  if (meta.time) doc.time = meta.time
  if (notes.length) doc.notes = notes.join('\n')
  return { doc, notes }
}
