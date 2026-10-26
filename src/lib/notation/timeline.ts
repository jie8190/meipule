// 把谱面展开成按时间排列的播放事件
import { TPQ, type DrumInst, type Score } from './types'

export interface PlayMeasure {
  measure: number
  start: number
  len: number
}

export interface NoteRef {
  string: number
  midi: number
}

/** track：音轨下标（score.tracks） */
export type TimelineEvent =
  | { kind: 'pluck'; tick: number; track: number; notes: (NoteRef & { dead?: boolean; tech?: string; accent?: boolean; harmonic?: boolean })[]; dur: number }
  | { kind: 'strum'; tick: number; track: number; notes: NoteRef[]; dir: 'down' | 'up'; light: boolean; accent: boolean; dur: number }
  | { kind: 'chop'; tick: number; track: number; notes: NoteRef[] }
  | { kind: 'mute'; tick: number; track: number }
  | { kind: 'drum'; tick: number; track: number; inst: DrumInst; vel: number }
  | { kind: 'melody'; tick: number; midi: number; dur: number }
  | { kind: 'click'; tick: number; level: 0 | 1 | 2 }

export interface Timeline {
  order: PlayMeasure[]
  events: TimelineEvent[]
  total: number
}

/** range：按谱面顺序的小节下标区间（含两端），用于 AB 循环 */
export function buildTimeline(score: Score, range?: [number, number] | null): Timeline {
  const seq: number[] = []
  if (range) {
    const [a, b] = range[0] <= range[1] ? range : [range[1], range[0]]
    for (let i = a; i <= b; i++) if (score.measures[i]) seq.push(i)
  } else {
    for (const sec of score.sections) {
      if (sec.kind !== 'tab') continue
      for (let r = 0; r < sec.repeat; r++) seq.push(...sec.measures)
    }
  }

  const order: PlayMeasure[] = []
  const events: TimelineEvent[] = []
  let t = 0
  let lastMelody: Extract<TimelineEvent, { kind: 'melody' }> | null = null

  for (const mi of seq) {
    const m = score.measures[mi]
    order.push({ measure: mi, start: t, len: m.ticks })

    // 节拍器
    const beat = (TPQ * 4) / m.timeDen
    const compound = m.timeDen === 8 && m.timeNum % 3 === 0 && m.timeNum > 3
    for (let k = 0; k * beat < m.ticks; k++) {
      const level: 0 | 1 | 2 = k === 0 ? 2 : compound && k % 3 === 0 ? 1 : 0
      events.push({ kind: 'click', tick: t + k * beat, level })
    }

    m.parts.forEach((part, track) => {
      const capo = score.tracks[track]?.capo ?? 0
      for (const g of part.guitar) {
        const tick = t + g.tick
        if (g.kind === 'notes') {
          events.push({
            kind: 'pluck',
            tick,
            track,
            dur: g.dur,
            notes: g.notes.map((n) => ({
              string: n.string,
              midi: n.midi + capo,
              dead: n.dead,
              tech: n.tech,
              accent: n.accent,
              harmonic: n.harmonic,
            })),
          })
        } else if (g.kind === 'strum' && g.strum) {
          const notes = g.strum.notes.map((n) => ({ string: n.string, midi: n.midi + capo }))
          if (g.strum.dir === 'chop') events.push({ kind: 'chop', tick, track, notes })
          else
            events.push({
              kind: 'strum',
              tick,
              track,
              notes,
              dir: g.strum.dir,
              light: g.strum.light,
              accent: g.strum.accent,
              dur: g.dur,
            })
        } else if (g.kind === 'rest') {
          events.push({ kind: 'mute', tick, track })
        }
      }
      for (const h of part.drums) {
        if (h.kind !== 'hit') continue
        for (const n of h.notes) events.push({ kind: 'drum', tick: t + h.tick, track, inst: n.inst, vel: n.accent ? 1 : n.light ? 0.45 : 0.78 })
      }
    })

    for (const n of m.melody) {
      const tick = t + n.tick
      if (n.kind === 'note' && n.midi !== undefined) {
        lastMelody = { kind: 'melody', tick, midi: n.midi, dur: n.dur }
        events.push(lastMelody)
      } else if (n.kind === 'hold') {
        if (lastMelody && lastMelody.tick + lastMelody.dur === tick) lastMelody.dur += n.dur
      } else lastMelody = null
    }
    if (!m.melody.length) lastMelody = null

    t += m.ticks
  }

  const rank = (e: TimelineEvent) => (e.kind === 'click' ? 0 : e.kind === 'mute' || e.kind === 'chop' ? 1 : 2)
  events.sort((a, b) => a.tick - b.tick || rank(a) - rank(b))
  return { order, events, total: t }
}

/** 二分查找：绝对 tick → 播放序列中的位置 */
export function locate(tl: Timeline, tick: number): { idx: number; measure: number; offset: number } | null {
  const o = tl.order
  if (!o.length) return null
  let lo = 0
  let hi = o.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (o[mid].start <= tick) lo = mid
    else hi = mid - 1
  }
  const pm = o[lo]
  return { idx: lo, measure: pm.measure, offset: Math.max(0, Math.min(pm.len, tick - pm.start)) }
}

/** 某小节在播放序列中第一次出现的起点 */
export function firstStartOf(tl: Timeline, measure: number): number | null {
  const pm = tl.order.find((p) => p.measure === measure)
  return pm ? pm.start : null
}
