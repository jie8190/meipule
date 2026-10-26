// 音频引擎：Karplus-Strong 拨弦合成 + 箱体共鸣 + 混响；旋律引导音；鼓；节拍器
// 多轨：每条轨有自己的音量总线，响着的弦按「轨:弦」记录，止音只影响本轨
import { midiToFreq } from '../music/theory'
import type { DrumInst } from '../notation/types'

interface Voice {
  src: AudioScheduledSourceNode
  /** 拨弦波形的播放速率（滑音用）；泛音没有 */
  rate?: AudioParam
  gain: GainNode
  baseRate: number
  midi: number
  start: number
}

export interface Volumes {
  master: number
  guitar: number
  melody: number
  click: number
}

class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private guitarBus!: GainNode
  private melodyBus!: GainNode
  private clickBus!: GainNode
  private drumBus!: GainNode
  private trackBuses = new Map<string, GainNode>()
  private cache = new Map<string, { buffer: AudioBuffer; rate: number }>()
  private voices = new Map<string, Voice>()
  private scheduled = new Set<AudioScheduledSourceNode>()
  private noise!: AudioBuffer
  volumes: Volumes = { master: 0.9, guitar: 0.9, melody: 0.55, click: 0.6 }

  ensure(): AudioContext {
    if (!this.ctx) this.init()
    if (this.ctx!.state === 'suspended') void this.ctx!.resume()
    return this.ctx!
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0
  }

  private init() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.master = ctx.createGain()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 6
    limiter.ratio.value = 8
    limiter.attack.value = 0.003
    limiter.release.value = 0.15
    this.master.connect(limiter).connect(ctx.destination)

    // 吉他：箱体共鸣 EQ
    this.guitarBus = ctx.createGain()
    const body1 = peaking(ctx, 105, 3.5, 1)
    const body2 = peaking(ctx, 220, 2, 1.4)
    const presence = peaking(ctx, 2600, 1.5, 0.8)
    const air = ctx.createBiquadFilter()
    air.type = 'highshelf'
    air.frequency.value = 6500
    air.gain.value = -5
    this.guitarBus.connect(body1).connect(body2).connect(presence).connect(air)
    air.connect(this.master)

    // 混响
    const reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx, 2.2, 2.6)
    const send = ctx.createGain()
    send.gain.value = 0.2
    air.connect(send).connect(reverb).connect(this.master)

    this.melodyBus = ctx.createGain()
    const mSend = ctx.createGain()
    mSend.gain.value = 0.28
    this.melodyBus.connect(this.master)
    this.melodyBus.connect(mSend).connect(reverb)

    this.clickBus = ctx.createGain()
    this.clickBus.connect(this.master)

    this.drumBus = ctx.createGain()
    this.drumBus.gain.value = 0.85
    const dSend = ctx.createGain()
    dSend.gain.value = 0.12
    this.drumBus.connect(this.master)
    this.drumBus.connect(dSend).connect(reverb)

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const nd = this.noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
    this.applyVolumes()
  }

  setVolumes(v: Partial<Volumes>) {
    this.volumes = { ...this.volumes, ...v }
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02)
    this.guitarBus.gain.setTargetAtTime(this.volumes.guitar * 0.75, t, 0.02)
    this.melodyBus.gain.setTargetAtTime(this.volumes.melody, t, 0.02)
    this.clickBus.gain.setTargetAtTime(this.volumes.click, t, 0.02)
  }

  /** 某条轨的音量总线（吉他轨接到箱体 EQ，鼓轨接到鼓总线） */
  private bus(track: number, kind: 'guitar' | 'drums' = 'guitar'): GainNode {
    const key = `${kind}:${track}`
    let g = this.trackBuses.get(key)
    if (!g) {
      g = this.ctx!.createGain()
      g.connect(kind === 'drums' ? this.drumBus : this.guitarBus)
      this.trackBuses.set(key, g)
    }
    return g
  }

  /** 设置某条轨的音量（0-1），立即生效 */
  setTrackGain(track: number, gain: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (const kind of ['guitar', 'drums'] as const) this.bus(track, kind).gain.setTargetAtTime(gain, t, 0.02)
  }

  /** 生成（并缓存）某个音高的拨弦波形 */
  private string(midi: number, bright: number): { buffer: AudioBuffer; rate: number } {
    const variant = Math.random() < 0.5 ? 0 : 1
    const b = bright > 0.6 ? 2 : bright > 0.35 ? 1 : 0
    const key = `${midi}:${b}:${variant}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const f = midiToFreq(midi)
    // 环形缓冲每次与"下一个"样本求平均，实际周期是 N - 0.5 个样本；用 playbackRate 补偿到准确音高
    const N = Math.max(3, Math.round(sr / f + 0.5))
    const rate = (f * (N - 0.5)) / sr
    const dur = Math.max(1.8, Math.min(4.5, 4.6 - (midi - 40) * 0.055))
    const len = Math.floor(sr * dur)
    const buffer = ctx.createBuffer(1, len, sr)
    const data = buffer.getChannelData(0)
    const ring = new Float32Array(N)
    // 激励：滤波噪声 + 拨弦位置梳状滤波
    const a = 0.22 + b * 0.22
    let lp = 0
    for (let i = 0; i < N; i++) {
      lp += a * (Math.random() * 2 - 1 - lp)
      ring[i] = lp
    }
    const pick = Math.max(1, Math.floor(N * 0.12))
    const tmp = ring.slice()
    for (let i = 0; i < N; i++) ring[i] = tmp[i] - 0.6 * tmp[(i + pick) % N]
    let mean = 0
    for (let i = 0; i < N; i++) mean += ring[i]
    mean /= N
    for (let i = 0; i < N; i++) ring[i] -= mean
    // 衰减
    const t60 = dur * 0.75
    const g = Math.pow(0.001, 1 / (f * t60))
    let idx = 0
    let peak = 0
    for (let i = 0; i < len; i++) {
      const x0 = ring[idx]
      const nxt = idx + 1 === N ? 0 : idx + 1
      ring[idx] = g * 0.5 * (x0 + ring[nxt])
      data[i] = x0
      const ab = Math.abs(x0)
      if (ab > peak) peak = ab
      idx = nxt
    }
    const norm = peak > 0 ? 0.85 / peak : 1
    const fade = Math.floor(sr * 0.08)
    for (let i = 0; i < len; i++) {
      let v = data[i] * norm
      if (i > len - fade) v *= (len - i) / fade
      data[i] = v
    }
    const out = { buffer, rate }
    this.cache.set(key, out)
    return out
  }

  private track(node: AudioScheduledSourceNode) {
    this.scheduled.add(node)
    node.onended = () => this.scheduled.delete(node)
  }

  /** 拨一根弦；track 为音轨下标 */
  pluck(
    midi: number,
    when: number,
    opts: { string?: number; vel?: number; bright?: number; tech?: string; dead?: boolean; harmonic?: boolean; track?: number } = {},
  ) {
    const ctx = this.ensure()
    const t = Math.max(when, ctx.currentTime)
    const vel = opts.vel ?? 0.8
    const track = opts.track ?? 0
    if (opts.dead) {
      this.muteString(opts.string, t, track)
      this.noiseHit(t, 0.25 * vel, 900, 0.05, this.bus(track))
      return
    }
    const s = opts.string
    const vkey = s !== undefined ? `${track}:${s}` : undefined
    const prev = vkey ? this.voices.get(vkey) : undefined
    if (opts.harmonic) {
      this.harmonic(midi, t, vel, track, vkey, prev)
      return
    }
    // 滑音：直接把上一根弦的音高滑过去
    if (opts.tech === 's' && prev?.rate && t - prev.start < 3) {
      const newRate = prev.baseRate * Math.pow(2, (midi - prev.midi) / 12)
      prev.rate.setValueAtTime(prev.baseRate, t)
      prev.rate.linearRampToValueAtTime(newRate, t + 0.09)
      return
    }
    const bright = opts.bright ?? (opts.tech === 'h' || opts.tech === 'p' ? 0.2 : 0.5)
    const { buffer, rate } = this.string(midi, bright)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    const gain = ctx.createGain()
    const v = (opts.tech === 'h' || opts.tech === 'p' ? 0.55 : 1) * vel
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(v * 0.7, t + 0.003)
    src.connect(gain).connect(this.bus(track))
    if (opts.tech === 'b') {
      src.playbackRate.setValueAtTime(rate, t + 0.06)
      src.playbackRate.linearRampToValueAtTime(rate * Math.pow(2, 2 / 12), t + 0.22)
    }
    if (prev) this.release(prev, t)
    src.start(t)
    this.track(src)
    if (vkey) this.voices.set(vkey, { src, rate: src.playbackRate, gain, baseRate: rate, midi, start: t })
  }

  /** 泛音：接近纯音、钟声一样的长衰减 */
  private harmonic(midi: number, t: number, vel: number, track: number, vkey: string | undefined, prev: Voice | undefined) {
    const ctx = this.ctx!
    const f = midiToFreq(midi)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = f * 2
    const g2 = ctx.createGain()
    g2.gain.value = 0.18
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004)
    gain.gain.setTargetAtTime(0, t + 0.01, 1.1)
    o.connect(gain)
    o2.connect(g2).connect(gain)
    gain.connect(this.bus(track))
    if (prev) this.release(prev, t)
    for (const n of [o, o2]) {
      n.start(t)
      n.stop(t + 5)
      this.track(n)
    }
    if (vkey) this.voices.set(vkey, { src: o, gain, baseRate: 1, midi, start: t })
  }

  private release(v: Voice, t: number) {
    try {
      v.gain.gain.cancelScheduledValues(t)
      v.gain.gain.setTargetAtTime(0, t, 0.018)
      v.src.stop(t + 0.2)
    } catch {
      /* 已停止 */
    }
  }

  muteString(s: number | undefined, t: number, track = 0) {
    if (s === undefined) return
    const key = `${track}:${s}`
    const v = this.voices.get(key)
    if (v) {
      this.release(v, t)
      this.voices.delete(key)
    }
  }

  /** 止住某条轨（不传则所有轨）正在响的弦 */
  muteAll(t: number, track?: number) {
    const prefix = track === undefined ? null : `${track}:`
    for (const [key, v] of this.voices) {
      if (prefix && !key.startsWith(prefix)) continue
      this.release(v, t)
      this.voices.delete(key)
    }
  }

  /** 扫弦：notes 按弦号排列，自动按方向错开 */
  strum(notes: { string: number; midi: number }[], when: number, dir: 'down' | 'up', opts: { light?: boolean; accent?: boolean; track?: number } = {}) {
    const ordered = [...notes].sort((a, b) => (dir === 'down' ? b.string - a.string : a.string - b.string))
    const spread = (dir === 'down' ? 0.028 : 0.02) * (opts.light ? 0.7 : 1)
    const step = ordered.length > 1 ? spread / (ordered.length - 1) : 0
    const base = (dir === 'down' ? 0.72 : 0.5) * (opts.light ? 0.7 : 1) * (opts.accent ? 1.3 : 1)
    ordered.forEach((n, i) => {
      const vel = base * (0.85 + Math.random() * 0.2) * (dir === 'down' ? 1 - i * 0.03 : 1 - i * 0.05)
      this.pluck(n.midi, when + i * step, { string: n.string, vel, bright: dir === 'up' ? 0.7 : 0.55, track: opts.track })
    })
  }

  /** 切音：止住所有弦 + 一声"嚓" */
  chop(when: number, track = 0) {
    const ctx = this.ensure()
    const t = Math.max(when, ctx.currentTime)
    this.muteAll(t, track)
    this.noiseHit(t, 0.5, 2200, 0.045, this.bus(track))
    this.noiseHit(t, 0.35, 180, 0.06, this.bus(track))
  }

  private noiseHit(t: number, vol: number, freq: number, len: number, dest: AudioNode = this.guitarBus, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = type
    bp.frequency.value = freq
    bp.Q.value = type === 'bandpass' ? 1.2 : 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    src.connect(bp).connect(g).connect(dest)
    src.start(t, Math.random() * 0.3)
    src.stop(t + len + 0.02)
    this.track(src)
  }

  /** 鼓：K 底鼓、S 军鼓、H 闭镲、O 开镲、C 吊镲、T 通鼓、X 拍弦（都是合成的） */
  drum(inst: DrumInst, when: number, vel = 0.8, track = 0) {
    const ctx = this.ensure()
    const t = Math.max(when, ctx.currentTime)
    const dest = this.bus(track, 'drums')
    const thump = (f0: number, f1: number, len: number, vol: number) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.4)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.002)
      g.gain.exponentialRampToValueAtTime(0.001, t + len)
      o.connect(g).connect(dest)
      o.start(t)
      o.stop(t + len + 0.02)
      this.track(o)
    }
    switch (inst) {
      case 'K':
        thump(150, 48, 0.32, 1.1 * vel)
        this.noiseHit(t, 0.12 * vel, 3000, 0.012, dest)
        break
      case 'S':
        thump(220, 160, 0.1, 0.45 * vel)
        this.noiseHit(t, 0.75 * vel, 1900, 0.17, dest)
        break
      case 'H':
        this.noiseHit(t, 0.32 * vel, 7500, 0.045, dest, 'highpass')
        break
      case 'O':
        this.noiseHit(t, 0.28 * vel, 6500, 0.32, dest, 'highpass')
        break
      case 'C':
        this.noiseHit(t, 0.32 * vel, 4800, 1.3, dest, 'highpass')
        this.noiseHit(t, 0.2 * vel, 3200, 0.6, dest)
        break
      case 'T':
        thump(190, 105, 0.35, 0.8 * vel)
        break
      case 'X':
        this.noiseHit(t, 0.55 * vel, 1300, 0.06, dest)
        thump(110, 70, 0.07, 0.4 * vel)
        break
    }
  }

  /** 旋律引导音：柔和的类陶笛音色 */
  melody(midi: number, when: number, dur: number) {
    const ctx = this.ensure()
    const t = Math.max(when, ctx.currentTime)
    const f = midiToFreq(midi)
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = f * 2
    const g2 = ctx.createGain()
    g2.gain.value = 0.12
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.2
    const lfoG = ctx.createGain()
    lfoG.gain.setValueAtTime(0, t)
    lfoG.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur * 0.6))
    lfo.connect(lfoG)
    lfoG.connect(o1.frequency)
    lfoG.connect(o2.frequency)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2400
    const env = ctx.createGain()
    const end = t + Math.max(0.08, dur * 0.96)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.32, t + 0.025)
    env.gain.setTargetAtTime(0.22, t + 0.03, 0.15)
    env.gain.setTargetAtTime(0, end, 0.05)
    o1.connect(lp)
    o2.connect(g2).connect(lp)
    lp.connect(env).connect(this.melodyBus)
    for (const o of [o1, o2, lfo]) {
      o.start(t)
      o.stop(end + 0.4)
      this.track(o)
    }
  }

  /** 节拍器：level 2 = 强拍，1 = 次强拍，0 = 弱拍 */
  click(when: number, level: 0 | 1 | 2) {
    const ctx = this.ensure()
    const t = Math.max(when, ctx.currentTime)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = level === 2 ? 1760 : level === 1 ? 1320 : 1046
    const g = ctx.createGain()
    const vol = level === 2 ? 0.9 : level === 1 ? 0.65 : 0.5
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.001)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    o.connect(g).connect(this.clickBus)
    o.start(t)
    o.stop(t + 0.08)
    this.track(o)
  }

  /** 停掉所有已安排/正在发声的声音 */
  stopAll() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.muteAll(t)
    for (const n of this.scheduled) {
      try {
        n.stop(t + 0.03)
      } catch {
        /* ignore */
      }
    }
    this.scheduled.clear()
  }

  /** 预览：立即扫一个和弦 */
  previewChord(midis: { string: number; midi: number }[]) {
    const ctx = this.ensure()
    this.strum(midis, ctx.currentTime + 0.02, 'down', {})
  }

  previewNote(midi: number, string?: number) {
    const ctx = this.ensure()
    this.pluck(midi, ctx.currentTime + 0.01, { string, vel: 0.85 })
  }
}

function peaking(ctx: AudioContext, freq: number, gain: number, q: number) {
  const f = ctx.createBiquadFilter()
  f.type = 'peaking'
  f.frequency.value = freq
  f.gain.value = gain
  f.Q.value = q
  return f
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay)
      lp += 0.35 * (Math.random() * 2 - 1 - lp)
      d[i] = lp * env * (i < sr * 0.012 ? i / (sr * 0.012) : 1)
    }
  }
  return buf
}

export const audio = new AudioEngine()
