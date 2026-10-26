// 播放调度器：前瞻式调度 + 可循环 + 变速，光标位置由 AudioContext 时钟推算
import { audio } from './engine'
import { TPQ, type Score } from '../notation/types'
import { buildTimeline, locate, type Timeline, type TimelineEvent } from '../notation/timeline'

export interface PlayerOptions {
  guitar: boolean
  melody: boolean
  metronome: boolean
  countIn: boolean
  speed: number
  /** 多轨：静音的音轨下标 */
  muted: number[]
  /** 多轨：独奏的音轨（其它轨都不出声） */
  solo: number | null
}

interface Segment {
  time0: number
  tick0: number
  tickEnd: number
}

type Status = 'stopped' | 'playing'

export class Player {
  score: Score | null = null
  timeline: Timeline | null = null
  loopRange: [number, number] | null = null
  status: Status = 'stopped'
  options: PlayerOptions = { guitar: true, melody: true, metronome: false, countIn: false, speed: 1, muted: [], solo: null }
  /** 暂停/停止时停留的位置 */
  restTick = 0

  private segs: Segment[] = []
  private nextIdx = 0
  private timer: number | null = null
  private listeners = new Set<() => void>()
  private finishAt: number | null = null

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  load(score: Score, loopRange: [number, number] | null = this.loopRange) {
    const wasPlaying = this.status === 'playing'
    const pos = wasPlaying ? this.currentMeasurePos() : null
    if (wasPlaying) this.halt()
    // 换了一首（音轨不同）就清掉静音/独奏
    const ids = (s: Score | null) => s?.tracks.map((t) => t.id).join('|') + '@' + s?.title
    if (ids(this.score) !== ids(score)) this.options = { ...this.options, muted: [], solo: null }
    this.score = score
    this.loopRange = loopRange
    this.timeline = buildTimeline(score, loopRange)
    this.restTick = 0
    if (pos) {
      const t = this.tickForMeasure(pos.measure, pos.offset)
      if (t !== null) this.start(t, false)
    }
    this.emit()
  }

  setLoop(range: [number, number] | null) {
    if (!this.score) return
    const wasPlaying = this.status === 'playing'
    const pos = this.currentMeasurePos()
    this.halt()
    this.loopRange = range
    this.timeline = buildTimeline(this.score, range)
    let t = 0
    if (pos) t = this.tickForMeasure(pos.measure, pos.offset) ?? 0
    this.restTick = t
    if (wasPlaying) this.start(t, false)
    this.emit()
  }

  /** 这条轨现在是否出声 */
  audible(track: number): boolean {
    const o = this.options
    return o.solo !== null ? o.solo === track : !o.muted.includes(track)
  }

  setOptions(o: Partial<PlayerOptions>) {
    const speedChanged = o.speed !== undefined && o.speed !== this.options.speed
    this.options = { ...this.options, ...o }
    // 刚被静音的轨：正在响的弦立即止住
    if ((o.muted || o.solo !== undefined) && this.score && audio.ctx)
      this.score.tracks.forEach((_, i) => !this.audible(i) && audio.muteAll(audio.now, i))
    if (speedChanged && this.status === 'playing') {
      const tick = this.getTick() ?? 0
      this.halt()
      this.start(tick, false)
    }
    this.emit()
  }

  get secondsPerTick(): number {
    const s = this.score
    if (!s) return 0.001
    const beatTicks = (TPQ * 4) / s.timeDen
    return 60 / (s.tempo * this.options.speed) / beatTicks
  }

  play(fromTick?: number) {
    if (!this.timeline || !this.timeline.order.length) return
    let t = fromTick ?? this.restTick
    if (t >= this.timeline.total) t = 0
    this.start(t, this.options.countIn)
  }

  toggle() {
    if (this.status === 'playing') this.pause()
    else this.play()
  }

  pause() {
    if (this.status !== 'playing') return
    this.restTick = this.getTick() ?? 0
    this.halt()
    this.emit()
  }

  stop() {
    this.halt()
    this.restTick = 0
    this.emit()
  }

  /** 跳到某个小节（谱面下标）开头 */
  seekMeasure(measure: number, offset = 0) {
    const t = this.tickForMeasure(measure, offset)
    if (t === null) return
    if (this.status === 'playing') {
      this.halt()
      this.start(t, false)
    } else this.restTick = t
    this.emit()
  }

  tickForMeasure(measure: number, offset = 0): number | null {
    if (!this.timeline) return null
    const pm = this.timeline.order.find((p) => p.measure === measure)
    return pm ? pm.start + Math.min(offset, pm.len - 1) : null
  }

  /** 当前播放到的 tick（时间线坐标）；倒数阶段返回起点 */
  getTick(): number | null {
    if (this.status !== 'playing') return this.restTick
    const now = audio.now
    let seg = this.segs[0]
    for (const s of this.segs) if (s.time0 <= now) seg = s
    if (!seg) return this.restTick
    if (now < seg.time0) return seg.tick0
    const tick = seg.tick0 + (now - seg.time0) / this.secondsPerTick
    return Math.min(seg.tickEnd, tick)
  }

  /** 是否处于预备拍 */
  isCountingIn(): boolean {
    return this.status === 'playing' && this.segs.length > 0 && audio.now < this.segs[0].time0
  }

  currentMeasurePos(): { measure: number; offset: number; idx: number } | null {
    if (!this.timeline) return null
    const t = this.getTick()
    if (t === null) return null
    return locate(this.timeline, t)
  }

  private start(fromTick: number, countIn: boolean) {
    const tl = this.timeline
    const score = this.score
    if (!tl || !score) return
    const ctx = audio.ensure()
    this.halt()
    score.tracks.forEach((tk, i) => audio.setTrackGain(i, tk.volume))
    let t0 = ctx.currentTime + 0.08
    if (countIn) {
      const beat = (TPQ * 4) / score.timeDen
      const n = score.timeNum
      const beatSec = beat * this.secondsPerTick
      for (let i = 0; i < n; i++) audio.click(t0 + i * beatSec, i === 0 ? 2 : 0)
      t0 += n * beatSec
    }
    this.segs = [{ time0: t0, tick0: fromTick, tickEnd: tl.total }]
    this.nextIdx = lowerBound(tl.events, fromTick)
    this.finishAt = null
    this.status = 'playing'
    this.schedule()
    this.timer = window.setInterval(() => this.schedule(), 25)
    this.emit()
  }

  private halt() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    audio.stopAll()
    this.status = 'stopped'
    this.segs = []
    this.finishAt = null
  }

  private schedule() {
    const tl = this.timeline
    if (!tl || this.status !== 'playing') return
    const now = audio.now
    if (this.finishAt !== null) {
      if (now >= this.finishAt) {
        this.halt()
        this.restTick = 0
        this.emit()
      }
      return
    }
    const horizon = now + 0.16
    const spt = this.secondsPerTick
    let seg = this.segs[this.segs.length - 1]
    // 丢弃已经过去很久的分段
    while (this.segs.length > 2 && this.segs[1].time0 < now - 1) this.segs.shift()
    for (let guard = 0; guard < 4096; guard++) {
      const ev = tl.events[this.nextIdx]
      if (!ev || ev.tick >= seg.tickEnd) {
        const endTime = seg.time0 + (seg.tickEnd - seg.tick0) * spt
        if (endTime > horizon) break
        if (this.loopRange) {
          seg = { time0: endTime, tick0: 0, tickEnd: tl.total }
          this.segs.push(seg)
          this.nextIdx = 0
          continue
        }
        this.finishAt = endTime + 0.3
        break
      }
      const t = seg.time0 + (ev.tick - seg.tick0) * spt
      if (t > horizon) break
      if (t >= now - 0.02) this.dispatch(ev, t, spt)
      this.nextIdx++
    }
  }

  private dispatch(ev: TimelineEvent, t: number, spt: number) {
    const o = this.options
    switch (ev.kind) {
      case 'click':
        if (o.metronome) audio.click(t, ev.level)
        break
      case 'pluck':
        if (!o.guitar || !this.audible(ev.track)) break
        ev.notes.forEach((n, i) =>
          audio.pluck(n.midi, t + i * 0.004, {
            string: n.string,
            vel: (n.accent ? 0.95 : 0.72) * (i === 0 && ev.notes.length > 1 ? 1.05 : 1),
            tech: n.tech,
            dead: n.dead,
            harmonic: n.harmonic,
            track: ev.track,
          }),
        )
        break
      case 'strum':
        if (o.guitar && this.audible(ev.track)) audio.strum(ev.notes, t, ev.dir, { light: ev.light, accent: ev.accent, track: ev.track })
        break
      case 'chop':
        if (o.guitar && this.audible(ev.track)) audio.chop(t, ev.track)
        break
      case 'mute':
        if (o.guitar) audio.muteAll(t, ev.track)
        break
      case 'drum':
        if (o.guitar && this.audible(ev.track)) audio.drum(ev.inst, t, ev.vel, ev.track)
        break
      case 'melody':
        if (o.melody) audio.melody(ev.midi, t, ev.dur * spt)
        break
    }
  }
}

function lowerBound(events: TimelineEvent[], tick: number): number {
  let lo = 0
  let hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].tick < tick) lo = mid + 1
    else hi = mid
  }
  return lo
}

export const player = new Player()
