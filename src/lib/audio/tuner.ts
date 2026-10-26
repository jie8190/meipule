// 调音器：麦克风采集 + McLeod 音高检测（NSDF）

export interface PitchReading {
  freq: number
  clarity: number
  rms: number
}

export class PitchDetector {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null
  private nsdf: Float32Array | null = null

  get running() {
    return !!this.stream
  }

  async start(): Promise<void> {
    if (this.stream) return
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持麦克风（需要 HTTPS 或 localhost）')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaStreamSource(this.stream)
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 50
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 4096
    src.connect(hp).connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
    this.nsdf = new Float32Array(this.analyser.fftSize)
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close()
    this.ctx = null
    this.analyser = null
  }

  read(): PitchReading | null {
    if (!this.analyser || !this.buf || !this.ctx || !this.nsdf) return null
    this.analyser.getFloatTimeDomainData(this.buf)
    const x = this.buf
    const n = x.length
    let rms = 0
    for (let i = 0; i < n; i++) rms += x[i] * x[i]
    rms = Math.sqrt(rms / n)
    if (rms < 0.006) return { freq: 0, clarity: 0, rms }
    const r = detectPitch(x, this.ctx.sampleRate, this.nsdf)
    return { ...r, rms }
  }
}

/** McLeod 音高检测（NSDF + 峰值挑选 + 抛物线插值），返回频率与清晰度 */
export function detectPitch(x: Float32Array, sr: number, scratch?: Float32Array): { freq: number; clarity: number } {
  const n = x.length
  const maxTau = Math.min(n >> 1, Math.floor(sr / 55))
  const minTau = Math.floor(sr / 1400)
  const nsdf = scratch && scratch.length >= maxTau + 1 ? scratch : new Float32Array(maxTau + 1)
  const w = n >> 1
  for (let tau = 0; tau < maxTau; tau++) {
    let acf = 0
    let m = 0
    for (let i = 0; i < w; i++) {
      const a = x[i]
      const b = x[i + tau]
      acf += a * b
      m += a * a + b * b
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0
  }
  const peaks: number[] = []
  let pos = false
  let best = -1
  for (let tau = 1; tau < maxTau; tau++) {
    if (nsdf[tau - 1] <= 0 && nsdf[tau] > 0) {
      pos = true
      best = tau
    } else if (nsdf[tau - 1] > 0 && nsdf[tau] <= 0) {
      if (pos && best >= minTau) peaks.push(best)
      pos = false
    }
    if (pos && nsdf[tau] > nsdf[best]) best = tau
  }
  if (!peaks.length) return { freq: 0, clarity: 0 }
  let maxV = 0
  for (const p of peaks) maxV = Math.max(maxV, nsdf[p])
  const tau = peaks.find((p) => nsdf[p] >= maxV * 0.9)!
  const y0 = nsdf[tau - 1]
  const y1 = nsdf[tau]
  const y2 = tau + 1 < maxTau ? nsdf[tau + 1] : y1
  const denom = y0 - 2 * y1 + y2
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0
  return { freq: sr / (tau + shift), clarity: y1 }
}
