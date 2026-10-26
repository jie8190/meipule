// 编译：把 JSON 曲谱文档变成可渲染、可播放的谱面模型
import {
  bassString,
  getChordShape,
  parseChord,
  parseFrets,
  assignFingers,
  chordPcs,
  transposeChordInKey,
  type ChordShape,
} from '../music/chords'
import { keyName, mod12, parseKey, resolveTuning } from '../music/theory'
import {
  INFER_OK,
  durTicks,
  parseLyricLine,
  parseMeasureChords,
  parseHits,
  parseMelody,
  parseSteps,
  parseTime,
  resolveDurations,
  splitLyrics,
  ticksToDurSpec,
  type RawStep,
} from './parse'
import {
  TPQ,
  type ChordMark,
  type CompileOptions,
  type CompiledMeasure,
  type CompiledSection,
  type Diagnostic,
  type DrumHit,
  type GuitarBeat,
  type LyricOnly,
  type MeasureDoc,
  type MeasurePart,
  type MelodyNote,
  type PatternDef,
  type Score,
  type SectionDoc,
  type SongDoc,
  type StrumInfo,
  type TabNote,
  type TrackDoc,
  type TrackInfo,
  type TrackMeasureDoc,
  type TrackType,
} from './types'

/** 编译期的音轨上下文 */
interface TrackCtx extends TrackInfo {
  doc: TrackDoc
  /** 本轨调弦下的和弦按法 */
  shapeOf: (name: string) => ChordShape | null
  /** 本轨六线谱整体移调的半音数 */
  noteShift: number
  /** 小节共用和弦（主轨指法）→ 本轨指法的半音数（两轨变调夹不同时不为 0） */
  chordOffset: number
}

/** "%" 同上一小节，"%4" 同 4 小节之前 */
const COPY_RE = /^%(\d*)$/

interface PatternCompiled {
  id: string
  name: string
  steps: RawStep[]
  unit?: number
}

const MAJOR_STEPS = [0, 0, 2, 4, 5, 7, 9, 11] // 下标为简谱级数

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function compileSong(input: unknown, opts: CompileOptions = {}): Score {
  const diags: Diagnostic[] = []
  const err = (where: string, message: string) => diags.push({ level: 'error', where, message })
  const warn = (where: string, message: string) => diags.push({ level: 'warning', where, message })

  const doc = (isObj(input) ? input : {}) as Partial<SongDoc>
  if (!isObj(input)) err('全曲', '曲谱必须是一个 JSON 对象')

  const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : '未命名曲谱'
  if (!(typeof doc.title === 'string' && doc.title.trim())) warn('全曲', '缺少 title（曲名）')

  // ---- 拍号、速度、调弦 ----
  const songTime = parseTime(doc.time) ?? [4, 4]
  if (doc.time !== undefined && !parseTime(doc.time)) warn('全曲', `无法识别的拍号 "${doc.time}"，已按 4/4 处理`)
  let tempo = Number(doc.tempo)
  if (!Number.isFinite(tempo) || tempo <= 0) {
    if (doc.tempo !== undefined) warn('全曲', `tempo 应为正数`)
    tempo = 80
  }
  tempo = Math.max(20, Math.min(320, tempo))
  // ---- 音轨（meipule/2）；不写 tracks 时只有一条主吉他轨 ----
  const trackDocs: TrackDoc[] = []
  if (doc.tracks !== undefined) {
    if (!Array.isArray(doc.tracks)) warn('tracks', 'tracks 应为数组，如 [{"id": "G1"}, {"id": "kick", "type": "drums"}]')
    else
      doc.tracks.forEach((t, i) => {
        if (!isObj(t) || typeof t.id !== 'string' || !t.id.trim()) {
          warn('tracks', `第 ${i + 1} 条音轨缺少 id`)
          return
        }
        if (trackDocs.some((x) => x.id === t.id)) {
          warn('tracks', `音轨 id "${t.id}" 重复`)
          return
        }
        if (t.type !== undefined && t.type !== 'guitar' && t.type !== 'drums') warn(`音轨 ${t.id}`, 'type 应为 "guitar" 或 "drums"')
        trackDocs.push(t as TrackDoc)
      })
  }
  if (!trackDocs.length) trackDocs.push({ id: 'main', name: '吉他', type: 'guitar' })
  const typeOf = (t: TrackDoc): TrackType => (t.type === 'drums' ? 'drums' : 'guitar')
  // 主轨：第一条吉他轨。小节顶层的 tab/pattern 属于主轨，全曲的调、变调夹也以主轨为准
  const mainIdx = trackDocs.findIndex((t) => typeOf(t) === 'guitar')
  const mainDoc = mainIdx >= 0 ? trackDocs[mainIdx] : undefined

  const tuningRes = resolveTuning(mainDoc?.tuning ?? doc.tuning)
  if (tuningRes.error) warn('全曲', tuningRes.error)
  const tuning = tuningRes.notes

  // ---- 调、变调夹、移调 ----
  const shift = opts.shift ?? 0
  let originalCapo = Number(mainDoc?.capo ?? doc.capo ?? 0)
  if (!Number.isInteger(originalCapo) || originalCapo < 0 || originalCapo > 12) {
    warn('全曲', `capo 应为 0-12 的整数`)
    originalCapo = 0
  }
  const capo = opts.capo ?? originalCapo

  let keyInfo = parseKey(doc.key)
  if (doc.key && !keyInfo) warn('全曲', `无法识别的调 "${doc.key}"`)
  if (!keyInfo) keyInfo = inferKey(doc)
  const originalKey = keyInfo ? keyInfo.name : null
  const origShapePc = keyInfo ? mod12(keyInfo.pc - originalCapo) : null
  const shapeKey = keyInfo ? keyName(mod12(origShapePc! + shift), keyInfo.minor) : null
  const soundingPc = keyInfo ? mod12(origShapePc! + shift + capo) : null
  const soundingKey = keyInfo ? keyName(soundingPc!, keyInfo.minor) : null
  const doPc = keyInfo ? (keyInfo.minor ? mod12(soundingPc! + 3) : soundingPc!) : 0
  const doName = keyInfo ? keyName(doPc, false) : null
  // 简谱 do 放在 G3..F#4 附近
  let doMidi = 60 + doPc
  if (doMidi > 66) doMidi -= 12

  const tr = (name: string) => (shift ? transposeChordInKey(name, shift, shapeKey ?? undefined) : name)

  // ---- 自定义和弦 ----
  const custom: Record<string, ChordShape> = {}
  if (doc.chords !== undefined) {
    if (!isObj(doc.chords)) warn('chords', 'chords 应为对象，如 {"G": "320003"}')
    else
      for (const [name, def] of Object.entries(doc.chords)) {
        const fretsSrc = isObj(def) ? (def as { frets: unknown }).frets : def
        const frets = parseFrets(fretsSrc)
        if (!frets) {
          warn(`chords.${name}`, `和弦 ${name} 的指法无法识别，应为 "x32010" 这样 6 位（低音弦在前）`)
          continue
        }
        if (shift !== 0) continue // 移调后使用指法库/生成器
        const fingersSrc = isObj(def) ? (def as { fingers?: unknown }).fingers : undefined
        const fingers = fingersSrc !== undefined ? parseFrets(fingersSrc) : null
        const auto = assignFingers(frets)
        custom[name] = {
          frets,
          fingers: fingers ? fingers.map((f) => Math.max(0, f)) : auto.fingers,
          barre: auto.barre,
          source: 'custom',
        }
      }
  }
  const shapeOf = (name: string) => getChordShape(name, { tuning, custom })

  // 每条轨各自的调弦、变调夹。移调时整体发声变化 soundShift 对所有吉他轨相同：
  // 变调夹跟着主轨一起挪（不能小于 0），挪不了的部分由六线谱移调补上
  const capoDelta = capo - originalCapo
  const soundShift = shift + capoDelta
  const tracks: TrackCtx[] = trackDocs.map((td, ti) => {
    const type = typeOf(td)
    const isMain = ti === mainIdx
    const name = typeof td.name === 'string' && td.name.trim() ? td.name.trim() : td.id
    // 其它轨没写 tuning 时用全曲的 tuning（不是主轨的）
    let tun = tuning
    let tunName = tuningRes.name
    if (!isMain) {
      const r = resolveTuning(td.tuning ?? doc.tuning)
      if (r.error && td.tuning !== undefined && type === 'guitar') warn(`音轨 ${name}`, r.error)
      tun = r.notes
      tunName = r.name
    }
    let c0 = isMain ? originalCapo : Number(td.capo ?? doc.capo ?? 0)
    if (!Number.isInteger(c0) || c0 < 0 || c0 > 12) {
      warn(`音轨 ${name}`, 'capo 应为 0-12 的整数')
      c0 = 0
    }
    const c1 = isMain ? capo : Math.max(0, Math.min(12, c0 + capoDelta))
    const sameTuning = tun.join() === tuning.join()
    const volume = Number(td.volume ?? 1)
    return {
      id: td.id,
      name,
      type,
      tuning: tun,
      tuningName: tunName,
      capo: type === 'guitar' ? c1 : 0,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1,
      hidden: !!td.hidden,
      hasContent: false,
      doc: td,
      shapeOf: isMain ? shapeOf : (n: string) => getChordShape(n, { tuning: tun, custom: sameTuning ? custom : {} }),
      noteShift: isMain ? shift : soundShift - (c1 - c0),
      chordOffset: capo - c1,
    }
  })
  const history: { part: MeasurePart; ticks: number }[][] = tracks.map(() => [])

  // ---- 节奏型 ----
  const patterns = new Map<string, PatternCompiled>()
  if (doc.patterns !== undefined) {
    if (!isObj(doc.patterns)) warn('patterns', 'patterns 应为对象')
    else
      for (const [id, raw] of Object.entries(doc.patterns)) {
        const def: PatternDef | null =
          typeof raw === 'string' ? { steps: raw } : isObj(raw) && typeof raw.steps === 'string' ? (raw as PatternDef) : null
        if (!def) {
          err(`节奏型 ${id}`, '节奏型应为字符串或 {"steps": "..."}')
          continue
        }
        const { steps, errors } = parseSteps(def.steps)
        for (const e of errors) err(`节奏型 ${id}`, e.message)
        const unit = def.unit && [1, 2, 4, 8, 16, 32].includes(def.unit) ? def.unit : undefined
        patterns.set(id, { id, name: def.name ?? id, steps, unit })
      }
  }

  // ---- 段落 ----
  const sections: CompiledSection[] = []
  const measures: CompiledMeasure[] = []
  const chordOrder: string[] = []
  const chordCount = new Map<string, number>()
  const noteChord = (n: string) => {
    if (!chordOrder.includes(n)) chordOrder.push(n)
    chordCount.set(n, (chordCount.get(n) ?? 0) + 1)
  }
  let currentChord: string | undefined
  let prevTime = `${songTime[0]}/${songTime[1]}`
  let hasMelody = false
  let hasLyrics = false
  let hasTab = false

  const docSections = Array.isArray(doc.sections) ? doc.sections : []
  if (!Array.isArray(doc.sections)) err('全曲', '缺少 sections（段落数组）')
  else if (doc.sections.length === 0) warn('全曲', 'sections 为空')

  docSections.forEach((secRaw, si) => {
    const sec: SectionDoc = isObj(secRaw) ? (secRaw as SectionDoc) : {}
    const name = typeof sec.name === 'string' && sec.name.trim() ? sec.name.trim() : `段落 ${si + 1}`
    const where0 = `「${name}」`
    if (!isObj(secRaw)) {
      err(where0, '段落应为对象')
      return
    }

    // 和弦歌词谱
    if (Array.isArray(sec.lines)) {
      const lines = sec.lines.map((l) => {
        const line = parseLyricLine(typeof l === 'string' ? l : String(l ?? ''))
        for (const seg of line.segments) {
          if (seg.chord) {
            if (!parseChord(seg.chord)) warn(where0, `无法识别的和弦 "${seg.chord}"`)
            seg.chord = tr(seg.chord)
            noteChord(seg.chord)
          }
          if (seg.text.trim()) hasLyrics = true
        }
        return line
      })
      sections.push({ kind: 'lines', index: si, name, lines, note: sec.note })
      return
    }

    let mDocs: (MeasureDoc | string)[] = []
    if (Array.isArray(sec.measures)) mDocs = sec.measures
    else if (typeof sec.progression === 'string') {
      const chunks = sec.progression.split('|').map((c) => c.trim()).filter(Boolean)
      let last = ''
      for (const c of chunks) {
        const v = c === '%' ? last : c
        mDocs.push(v)
        last = v
      }
    } else {
      const extra = Object.keys(sec).filter((k) => !['name', 'note', 'repeat', 'pattern', 'time'].includes(k))
      if (extra.length) warn(where0, `段落需要 measures（小节数组）、progression（和弦进行）或 lines（和弦歌词）之一，无法识别 ${extra.join('、')}`)
      // 没有内容的段落作为标记显示（段名 + 备注）
      sections.push({ kind: 'lines', index: si, name, lines: [], note: sec.note })
      return
    }

    const secPattern = typeof sec.pattern === 'string' ? sec.pattern : undefined
    const secTime = sec.time ?? undefined
    if (secTime && !parseTime(secTime)) warn(where0, `无法识别的拍号 "${secTime}"`)
    const indices: number[] = []
    let repeat = Math.round(Number(sec.repeat ?? 1))
    if (!Number.isFinite(repeat) || repeat < 1) repeat = 1
    if (repeat > 16) repeat = 16

    mDocs.forEach((mRaw, mi) => {
      const where = `${where0}第 ${mi + 1} 小节`
      const m: MeasureDoc =
        typeof mRaw === 'string'
          ? { chords: mRaw }
          : isObj(mRaw)
            ? (mRaw as MeasureDoc)
            : (warn(where, '小节应为对象或和弦字符串'), {})

      const timeStr = m.time ?? secTime ?? doc.time
      const [tn, td] = parseTime(timeStr) ?? songTime
      if (m.time && !parseTime(m.time)) warn(where, `无法识别的拍号 "${m.time}"`)
      const beatTicks = (TPQ * 4) / td
      const expectedTicks = tn * beatTicks
      const timeKey = `${tn}/${td}`
      const showTime = measures.length === 0 || timeKey !== prevTime
      prevTime = timeKey

      // 和弦
      const chordRes = parseMeasureChords(m.chords, m.chord, expectedTicks, beatTicks)
      for (const e of chordRes.errors) warn(where, e)
      const startChord = currentChord
      const marks: ChordMark[] = chordRes.marks.map((cm) => {
        const valid = !!parseChord(cm.name)
        if (!valid) warn(where, `无法识别的和弦 "${cm.name}"`)
        const name = valid ? tr(cm.name) : cm.name
        if (valid) noteChord(name)
        return { tick: cm.tick, name, shape: valid ? shapeOf(name) : null, valid }
      })
      const chordAt = (tick: number): string | undefined => {
        let c = startChord
        for (const mk of marks) if (mk.tick <= tick && mk.valid) c = mk.name
        return c
      }
      for (const mk of marks) if (mk.valid) currentChord = mk.name

      // 各音轨
      if (isObj(m.tracks)) {
        for (const id of Object.keys(m.tracks)) if (!tracks.some((t) => t.id === id)) warn(where, `找不到音轨 "${id}"，请先在 tracks 中定义`)
      } else if (m.tracks !== undefined) warn(where, 'tracks 应为对象，如 {"G2": "3:0/4 2:1"}')
      if (mainIdx < 0 && ((typeof m.tab === 'string' && m.tab.trim()) || typeof m.pattern === 'string'))
        warn(where, '没有吉他轨，小节的 tab/pattern 不会生效')
      const multi = tracks.length > 1
      const parts: MeasurePart[] = []
      const partTicks: number[] = []
      tracks.forEach((tk, ti) => {
        const label = multi ? `${tk.name}：` : ''
        const c = contentOf(m, tk, ti, where)
        const part: MeasurePart = { guitar: [], drums: [], text: typeof c?.text === 'string' && c.text.trim() ? c.text : undefined }
        let ticks = 0
        const copySrc = (c?.tab ?? c?.hits)?.trim()
        const copy = copySrc ? COPY_RE.exec(copySrc) : null
        if (copy) {
          const n = Math.max(1, parseInt(copy[1] || '1', 10))
          const src = history[ti][measures.length - n]
          if (!src) warn(where, `${label}"%${copy[1]}" 往前数 ${n} 个小节没有内容可以复制`)
          else {
            part.guitar = structuredClone(src.part.guitar)
            part.drums = structuredClone(src.part.drums)
            ticks = src.ticks
          }
        } else if (tk.type === 'drums') {
          if (c?.tab !== undefined && c.hits === undefined) warn(where, `${label}鼓轨请用 hits 写击打（已按 hits 处理）`)
          const src = c?.hits ?? c?.tab
          if (typeof src === 'string' && src.trim()) {
            const parsed = parseHits(src)
            for (const e of parsed.errors) err(where, `${label}hits：${e.message}`)
            const durs = resolveDurations(parsed.hits, { measureTicks: m.pickup ? undefined : expectedTicks, beatTicks: TPQ / 2 })
            part.drums = buildDrums(parsed.hits, durs)
            ticks = durs.reduce((a, b) => a + b, 0)
            if (!m.pickup && ticks !== expectedTicks) warn(where, `${label}击打时值合计 ${+(ticks / beatTicks).toFixed(2)} 拍，拍号要求 ${tn} 拍`)
          }
        } else {
          if (c?.hits !== undefined) warn(where, `${label}吉他轨请用 tab，hits 只用于鼓轨`)
          // 本轨单独写了和弦时按本轨指法，否则把小节和弦换算到本轨的变调夹
          let chordOf: (tick: number) => string | undefined = (tick) => {
            const n = chordAt(tick)
            return n && tk.chordOffset ? transposeChordInKey(n, tk.chordOffset, undefined) : n
          }
          if (c && (c.chord !== undefined || c.chords !== undefined)) {
            const own = parseMeasureChords(c.chords, c.chord, expectedTicks, beatTicks)
            for (const e of own.errors) warn(where, `${label}${e}`)
            const marks = own.marks
              .filter((mk) => (parseChord(mk.name) ? true : (warn(where, `${label}无法识别的和弦 "${mk.name}"`), false)))
              .map((mk) => ({ tick: mk.tick, name: tk.noteShift ? transposeChordInKey(mk.name, tk.noteShift, undefined) : mk.name }))
            const prev = chordOf
            chordOf = (tick) => {
              let n = marks.length && marks[0].tick <= tick ? undefined : prev(tick)
              for (const mk of marks) if (mk.tick <= tick) n = mk.name
              return n
            }
          }
          let steps: RawStep[] = []
          let stepDurs: number[] = []
          let fromPattern = false
          if (typeof c?.tab === 'string' && c.tab.trim()) {
            const parsed = parseSteps(c.tab)
            for (const e of parsed.errors) err(where, `${label}tab：${e.message}`)
            steps = parsed.steps
            stepDurs = resolveDurations(steps, { measureTicks: m.pickup ? undefined : expectedTicks, beatTicks: TPQ / 2 })
            const total = stepDurs.reduce((a, b) => a + b, 0)
            if (!m.pickup && total !== expectedTicks) warn(where, `${label}六线谱时值合计 ${+(total / beatTicks).toFixed(2)} 拍，拍号要求 ${tn} 拍`)
          } else {
            const secTrack = isObj(sec.tracks) && isObj(sec.tracks[tk.id]) ? sec.tracks[tk.id] : undefined
            const pid =
              c && c.pattern !== undefined
                ? c.pattern
                : secTrack && secTrack.pattern !== undefined
                  ? secTrack.pattern
                  : ti === mainIdx
                    ? (secPattern ?? tk.doc.pattern ?? doc.pattern)
                    : tk.doc.pattern
            if (pid) {
              let pat = patterns.get(pid)
              if (!pat) {
                // 允许直接内联节奏串
                const inline = parseSteps(pid)
                if (inline.errors.length === 0 && inline.steps.length > 1) pat = { id: pid, name: pid, steps: inline.steps }
                else err(where, `${label}找不到节奏型 "${pid}"，请在 patterns 中定义`)
              }
              if (pat) {
                ;[steps, stepDurs] = tilePattern(pat, expectedTicks)
                fromPattern = true
              }
            }
          }
          part.guitar = buildGuitar(steps, stepDurs, chordOf, where + (multi ? `（${tk.name}）` : ''), fromPattern, tk)
          ticks = stepDurs.reduce((a, b) => a + b, 0)
        }
        if (part.guitar.length || part.drums.length) tk.hasContent = true
        history[ti][measures.length] = { part, ticks }
        parts.push(part)
        partTicks.push(ticks)
      })
      const mainPart = mainIdx >= 0 ? parts[mainIdx] : undefined
      const guitar = mainPart?.guitar ?? []
      const guitarTicks = mainIdx >= 0 ? partTicks[mainIdx] : 0
      if (parts.some((p) => p.guitar.length || p.drums.length)) hasTab = true

      // 旋律
      let melody: MelodyNote[] = []
      let melodyTicks = 0
      if (typeof m.melody === 'string' && m.melody.trim()) {
        const parsed = parseMelody(m.melody)
        for (const e of parsed.errors) err(where, `melody：${e.message}`)
        const raw = parsed.notes
        const anyExplicit = raw.some((n) => n.dur)
        let durs: number[]
        if (!anyExplicit) {
          // 只有在没有延音线、附点时，才按小节平均推断（如 8 个音 → 八分音符）
          const per = expectedTicks / Math.max(1, raw.length)
          const plain = raw.every((n) => n.kind !== 'hold' && !n.dotted)
          const even = !m.pickup && plain && INFER_OK.has(per)
          durs = raw.map((n) => (even ? per : n.kind === 'hold' ? beatTicks : TPQ))
        } else {
          let cur = TPQ
          durs = raw.map((n) => {
            if (n.dur) {
              cur = durTicks(n.dur)
              return cur
            }
            return n.kind === 'hold' ? beatTicks : cur
          })
        }
        let t = 0
        melody = raw.map((n, i) => {
          const d = n.dotted ? Math.round(durs[i] * 1.5) : durs[i]
          const note: MelodyNote = {
            tick: t,
            dur: d,
            durSpec: ticksToDurSpec(d),
            kind: n.kind,
            degree: n.degree,
            acc: n.acc,
            octave: n.octave,
            dotted: n.dotted,
            lyric: [],
          }
          if (n.kind === 'note') note.midi = doMidi + MAJOR_STEPS[n.degree] + n.acc + 12 * n.octave
          t += d
          return note
        })
        melodyTicks = t
        if (melody.length) hasMelody = true
      }

      // 歌词
      const verses: string[] =
        typeof m.lyrics === 'string' ? [m.lyrics] : Array.isArray(m.lyrics) ? m.lyrics.map((v) => String(v ?? '')) : []
      const lyricsOnly: LyricOnly[] = []
      let verseCount = 0
      if (verses.some((v) => v.trim())) {
        hasLyrics = true
        verseCount = verses.length
        const playable = melody.filter((n) => n.kind === 'note')
        if (playable.length) {
          verses.forEach((v, vi) => {
            const syl = splitLyrics(v)
            let ni = 0
            for (const s of syl) {
              if (ni >= playable.length) {
                // 多出的字并到最后一个音上
                const last = playable[playable.length - 1]
                last.lyric[vi] = (last.lyric[vi] ?? '') + s.replace(/^_$/, '')
                continue
              }
              if (s !== '_') playable[ni].lyric[vi] = s
              ni++
            }
            if (syl.length > playable.length)
              warn(where, `第 ${vi + 1} 段歌词有 ${syl.length} 个字，但旋律只有 ${playable.length} 个音`)
          })
        } else {
          // 没有旋律：按时间平均摆放
          const per = verses.map((v) => splitLyrics(v).filter((s) => s !== '_'))
          const n = Math.max(...per.map((p) => p.length))
          const span = Math.max(guitarTicks, expectedTicks)
          for (let i = 0; i < n; i++) {
            lyricsOnly.push({ tick: Math.round((span * i) / n), text: per.map((p) => p[i]) })
          }
        }
      }

      // 时长校验（各轨的六线谱/击打在上面已经单独校验）
      const contentTicks = Math.max(melodyTicks, ...partTicks)
      let ticks = expectedTicks
      if (m.pickup) ticks = contentTicks || expectedTicks
      else {
        if (melody.length && melodyTicks !== expectedTicks)
          warn(where, `旋律时值合计 ${+(melodyTicks / beatTicks).toFixed(2)} 拍，拍号要求 ${tn} 拍`)
        if (contentTicks > ticks) ticks = contentTicks
      }

      const cm: CompiledMeasure = {
        index: measures.length,
        section: si,
        indexInSection: mi,
        ticks,
        expectedTicks,
        timeNum: tn,
        timeDen: td,
        showTime,
        chords: marks,
        startChord,
        guitar,
        parts,
        melody,
        lyricsOnly,
        verses: verseCount,
        text: typeof m.text === 'string' ? m.text : undefined,
        pickup: !!m.pickup,
      }
      indices.push(cm.index)
      measures.push(cm)
    })
    sections.push({ kind: 'tab', index: si, name, repeat, measures: indices, note: sec.note })
  })

  // ---------- 音轨内容 ----------

  /** 某条轨在某小节的内容；主轨还可以写在小节顶层（tab / pattern） */
  function contentOf(m: MeasureDoc, tk: TrackCtx, ti: number, where: string): TrackMeasureDoc | null {
    const raw = isObj(m.tracks) ? (m.tracks as Record<string, unknown>)[tk.id] : undefined
    if (raw !== undefined && raw !== null) {
      if (typeof raw === 'string') return tk.type === 'drums' ? { hits: raw } : { tab: raw }
      if (isObj(raw)) return raw as TrackMeasureDoc
      warn(where, `${tk.name} 的内容应为字符串或对象`)
      return null
    }
    if (ti !== mainIdx) return null
    const c: TrackMeasureDoc = {}
    if (typeof m.tab === 'string' && m.tab.trim()) c.tab = m.tab
    if (m.pattern !== undefined) c.pattern = m.pattern
    return c
  }

  /** 节奏型平铺填满小节 */
  function tilePattern(pat: PatternCompiled, expectedTicks: number): [RawStep[], number[]] {
    const durs = resolveDurations(pat.steps, { unit: pat.unit, measureTicks: expectedTicks, beatTicks: TPQ / 2 })
    const steps: RawStep[] = []
    const out: number[] = []
    const total = durs.reduce((a, b) => a + b, 0)
    if (total <= 0) return [steps, out]
    let t = 0
    let i = 0
    while (t < expectedTicks && i < 512) {
      const k = i % pat.steps.length
      const d = Math.min(durs[k], expectedTicks - t)
      steps.push(pat.steps[k])
      out.push(d)
      t += d
      i++
    }
    return [steps, out]
  }

  /** 鼓轨击打 → 拍；延音并入前一拍 */
  function buildDrums(raw: ReturnType<typeof parseHits>['hits'], durs: number[]): DrumHit[] {
    const out: DrumHit[] = []
    let t = 0
    raw.forEach((h, i) => {
      const d = durs[i]
      const last = out[out.length - 1]
      if (h.kind === 'hold' && last) last.dur += d
      else out.push({ tick: t, dur: d, durSpec: ticksToDurSpec(d), kind: h.kind === 'hold' ? 'rest' : h.kind, notes: h.notes })
      t += d
    })
    for (const h of out) h.durSpec = ticksToDurSpec(h.dur)
    return out
  }

  // ---------- 伴奏步骤 → 拍 ----------
  function buildGuitar(
    steps: RawStep[],
    durs: number[],
    chordAt: (tick: number) => string | undefined,
    where: string,
    fromPattern: boolean,
    tk: TrackCtx,
  ): GuitarBeat[] {
    const { shapeOf, tuning, noteShift: shift } = tk
    const beats: GuitarBeat[] = []
    let t = 0
    let warnedNoChord = false
    let fretted = 0
    let inChord = 0
    const chordSeen = new Map<string, number>()
    steps.forEach((st, i) => {
      const d = durs[i]
      const chord = chordAt(t)
      const shape = chord ? shapeOf(chord) : null
      if (st.kind === 'hold') {
        const last = beats[beats.length - 1]
        if (last) last.dur += d
        else beats.push({ tick: t, dur: d, durSpec: ticksToDurSpec(d), kind: 'hold', notes: [], chord })
      } else if (st.kind === 'rest') {
        beats.push({ tick: t, dur: d, durSpec: ticksToDurSpec(d), kind: 'rest', notes: [], chord })
      } else if (st.kind === 'strum') {
        const s = st.strum!
        const bass = shape ? bassString(shape) : 6
        let from: number
        let to: number
        if (s.range) {
          from = Math.max(s.range[0], s.range[1])
          to = Math.min(s.range[0], s.range[1])
        } else if (s.dir === 'up') {
          from = s.light ? Math.min(3, bass) : Math.min(4, bass)
          to = 1
        } else {
          from = s.light ? Math.min(4, bass) : bass
          to = 1
        }
        const notes: TabNote[] = []
        if (shape) {
          for (let str = from; str >= to; str--) {
            const f = shape.frets[6 - str]
            if (f >= 0) notes.push({ string: str, fret: f, midi: tuning[6 - str] + f })
          }
        } else if (!warnedNoChord) {
          warnedNoChord = true
          if (!fromPattern || chord === undefined) warn(where, '扫弦需要和弦，本小节之前没有出现和弦')
        }
        const strum: StrumInfo = { dir: s.dir, light: s.light, accent: s.accent, from, to, notes }
        beats.push({ tick: t, dur: d, durSpec: ticksToDurSpec(d), kind: 'strum', notes: [], strum, chord })
      } else {
        const notes: TabNote[] = []
        for (const rn of st.notes) {
          let str: number
          if (rn.string === 'T' || rn.string === 'T2') {
            if (!shape) {
              if (!warnedNoChord) {
                warnedNoChord = true
                warn(where, `"${st.token}" 中的 T（低音）需要和弦`)
              }
              continue
            }
            str = rn.string === 'T' ? bassString(shape) : altBass(shape, chord!, tuning)
          } else str = rn.string
          let fret = rn.fret
          if (fret === undefined) {
            if (!shape) {
              if (!warnedNoChord) {
                warnedNoChord = true
                warn(where, `"${st.token}" 没写品位，且没有和弦可参考（写成 弦:品，如 3:2）`)
              }
              continue
            }
            fret = shape.frets[6 - str]
            if (fret < 0) {
              const info = parseChord(chord!)
              const openPc = mod12(tuning[6 - str])
              if (info && chordPcs(info).includes(openPc)) fret = 0
              else continue
            }
          } else if (shift && !rn.dead && !rn.harmonic) {
            const moved = relocate(str, fret + shift, tuning)
            str = moved.string
            fret = moved.fret
          }
          // 同一拍同一根弦只保留一个音
          const dup = notes.findIndex((n) => n.string === str)
          const note: TabNote = {
            string: str,
            fret,
            midi: tuning[6 - str] + (rn.harmonic ? harmonicOffset(fret) : fret),
            dead: rn.dead,
            tech: rn.tech,
            harmonic: rn.harmonic,
            vibrato: rn.vibrato,
            accent: rn.accent,
          }
          if (dup >= 0) notes[dup] = note
          else notes.push(note)
          if (rn.fret !== undefined && !rn.dead && chord) {
            const info = parseChord(chord)
            if (info) {
              fretted++
              if (chordPcs(info).includes(mod12(note.midi))) inChord++
              chordSeen.set(chord, (chordSeen.get(chord) ?? 0) + 1)
            }
          }
        }
        notes.sort((a, b) => a.string - b.string)
        beats.push({ tick: t, dur: d, durSpec: ticksToDurSpec(d), kind: notes.length ? 'notes' : 'rest', notes, chord })
      }
      t += d
    })
    for (const b of beats) b.durSpec = ticksToDurSpec(b.dur)
    // 分解和弦伴奏里的音几乎都属于和弦；大半不属于时，多半是读谱时弦号数错了
    if (!fromPattern && fretted >= 6 && inChord / fretted < 0.5) {
      const main = [...chordSeen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      warn(where, `六线谱的 ${fretted} 个音里只有 ${inChord} 个属于和弦 ${main}，弦号可能数错了（最上面一条线是 1 弦）`)
    }
    return beats
  }

  /** 交替低音：优先找低音附近的五音 */
  function altBass(shape: ChordShape, chord: string, tuning: number[]): number {
    const b = bassString(shape)
    const info = parseChord(chord)
    const cands = [b - 1, b - 2, b + 1].filter((s) => s >= 4 && s <= 6)
    const pitchOf = (s: number) => {
      const f = shape.frets[6 - s]
      return f >= 0 ? tuning[6 - s] + f : tuning[6 - s]
    }
    if (info) {
      const fifth = mod12(info.root + 7)
      const pcs = chordPcs(info)
      const f = cands.find((s) => mod12(pitchOf(s)) === fifth)
      if (f) return f
      const t = cands.find((s) => pcs.includes(mod12(pitchOf(s))))
      if (t) return t
    }
    return cands[0] ?? b
  }

  /** 移调后把超出范围的品位挪到相邻弦 */
  function relocate(str: number, fret: number, tuning: number[]): { string: number; fret: number } {
    let s = str
    let f = fret
    const pitch = tuning[6 - s] + f
    while (f < 0 && s < 6) {
      s++
      f = pitch - tuning[6 - s]
    }
    while (f > 17 && s > 1) {
      s--
      f = pitch - tuning[6 - s]
    }
    if (f < 0) f += 12
    return { string: s, fret: f }
  }

  const chordsUsed = chordOrder.map((name) => ({ name, shape: shapeOf(name) }))

  // 只有段落名、没有任何小节或和弦歌词：多半是 AI 没把谱子扒出来
  const hasLines = sections.some((s) => s.kind === 'lines' && s.lines.length > 0)
  if (docSections.length > 0 && measures.length === 0 && !hasLines)
    warn('全曲', '曲谱只有段落名，没有任何小节或和弦歌词，谱面会是空的')

  if (keyInfo && doc.key) {
    const est = estimateShapeKey(chordCount, chordOrder)
    const keyMajor = keyInfo.minor ? mod12(keyInfo.pc + 3) : keyInfo.pc
    const expected = mod12(keyMajor - originalCapo + shift)
    if (est && est.pc !== expected && est.total >= 4 && est.score >= 0.8 * est.total && (est.scores[expected] ?? 0) <= 0.6 * est.score) {
      const suggest = mod12(keyMajor - (est.pc - shift))
      warn(
        '全曲',
        `和弦看起来是 ${keyName(est.pc, false)} 调指法，但原调 ${originalKey}、变调夹 ${originalCapo} 品对应的是 ${keyName(expected, false)} 调指法。` +
          (suggest > 0 && suggest <= 9 ? `如果谱上写着「${keyName(mod12(est.pc - shift), false)}调 夹${suggest}品」，capo 应为 ${suggest}。` : '请核对 key 和 capo。'),
      )
    }
  }

  return {
    title,
    artist: typeof doc.artist === 'string' ? doc.artist : '',
    meta: {
      album: doc.album,
      composer: doc.composer,
      lyricist: doc.lyricist,
      transcriber: doc.transcriber,
      difficulty: typeof doc.difficulty === 'number' ? doc.difficulty : undefined,
      tags: Array.isArray(doc.tags) ? doc.tags.filter((t): t is string => typeof t === 'string') : [],
      notes: typeof doc.notes === 'string' ? doc.notes : undefined,
    },
    originalKey,
    shapeKey,
    soundingKey,
    doName,
    shift,
    capo,
    originalCapo,
    tempo,
    timeNum: songTime[0],
    timeDen: songTime[1],
    tuning,
    tuningName: tuningRes.name,
    tracks: tracks.map(({ doc: _d, shapeOf: _s, noteShift: _n, chordOffset: _c, ...info }) => info),
    mainTrack: mainIdx,
    sections,
    measures,
    chordsUsed,
    hasMelody,
    hasLyrics,
    hasTab,
    diagnostics: diags,
    doMidi,
  }
}

/** 自然泛音比空弦高多少半音：12 品 +12，7/19 品 +19，5/24 品 +24，4/9/16 品 +28；其它品位按人工泛音（+12）处理 */
export function harmonicOffset(fret: number): number {
  const natural: Record<number, number> = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28, 3: 31 }
  return natural[fret] ?? fret + 12
}

/** 和弦是否是某个大调的顺阶和弦（按根音级数和大小调性质判断） */
function diatonicFit(name: string, keyPc: number): boolean {
  const info = parseChord(name)
  if (!info) return false
  const deg = mod12(info.root - keyPc)
  const q = info.quality
  if (q === 'dim' || q === 'm7b5' || q === 'dim7') return deg === 11
  if (q.startsWith('m') && !q.startsWith('maj')) return deg === 2 || deg === 4 || deg === 9
  if (q === '7' || q === '9' || q === '11' || q === '13' || q === '7sus4' || q === '7b9' || q === '7#9') return deg === 7 || deg === 0 || deg === 5
  return deg === 0 || deg === 5 || deg === 7
}

/** 根据和弦用法估计指法调（大调），返回得分最高的调 */
function estimateShapeKey(counts: Map<string, number>, order: string[]) {
  if (!counts.size) return null
  let total = 0
  for (const c of counts.values()) total += c
  const scores: number[] = []
  let best = 0
  for (let k = 0; k < 12; k++) {
    let sc = 0
    for (const [name, c] of counts) if (diatonicFit(name, k)) sc += c
    // 主和弦常出现在开头和结尾
    const first = parseChord(order[0] ?? '')
    const last = parseChord(order[order.length - 1] ?? '')
    if (first && first.root === k) sc += 0.5
    if (last && last.root === k) sc += 0.5
    scores[k] = sc
    if (sc > scores[best]) best = k
  }
  return { pc: best, score: scores[best], total, scores }
}

/** 没写调时，用第一个和弦猜 */
function inferKey(doc: Partial<SongDoc>): ReturnType<typeof parseKey> {
  const secs = Array.isArray(doc.sections) ? doc.sections : []
  for (const s of secs) {
    if (!isObj(s)) continue
    const sec = s as SectionDoc
    const cands: string[] = []
    if (Array.isArray(sec.measures))
      for (const m of sec.measures) {
        if (typeof m === 'string') cands.push(m.split(/\s+/)[0])
        else if (isObj(m)) {
          if (typeof m.chord === 'string') cands.push(m.chord)
          else if (typeof m.chords === 'string') cands.push(m.chords.split(/\s+/)[0])
        }
      }
    if (typeof sec.progression === 'string') cands.push(sec.progression.split(/[|\s]+/).filter(Boolean)[0])
    if (Array.isArray(sec.lines))
      for (const l of sec.lines) {
        const m = /\[([^\]]+)\]/.exec(String(l))
        if (m) cands.push(m[1])
      }
    for (const c of cands) {
      const info = c ? parseChord(c) : null
      if (info) {
        // 和弦是指法，实际发声要加上变调夹
        const capo = Number(doc.capo ?? 0) || 0
        const pc = mod12(info.root + capo)
        const minor = info.quality.startsWith('m') && !info.quality.startsWith('maj')
        return { pc, minor, name: keyName(pc, minor) }
      }
    }
  }
  return null
}

/** 计算选调列表对应的 shift：目标指法调 → 半音 */
export function shiftForShapeKey(score: Pick<Score, 'originalKey' | 'originalCapo'>, targetShapePc: number): number {
  const k = parseKey(score.originalKey)
  if (!k) return 0
  const origShape = mod12(k.pc - score.originalCapo)
  const d = mod12(targetShapePc - origShape)
  return d > 6 ? d - 12 : d
}
