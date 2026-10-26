import { describe, expect, it } from 'vitest'
import { detectPitch } from './tuner'

/** 模拟吉他音：多个泛音 + 衰减 + 一点噪声 */
function guitarLike(freq: number, sr = 48000, n = 4096) {
  const x = new Float32Array(n)
  const amps = [1, 0.6, 0.45, 0.3, 0.2, 0.12]
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let v = 0
    amps.forEach((a, k) => (v += a * Math.sin(2 * Math.PI * freq * (k + 1) * t + k)))
    x[i] = v * Math.exp(-t * 2) * 0.3 + (Math.random() - 0.5) * 0.01
  }
  return x
}

describe('tuner pitch detection', () => {
  for (const f of [82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.26]) {
    it(`detects ${f} Hz within 3 cents`, () => {
      const r = detectPitch(guitarLike(f), 48000)
      const cents = 1200 * Math.log2(r.freq / f)
      expect(Math.abs(cents)).toBeLessThan(3)
      expect(r.clarity).toBeGreaterThan(0.9)
    })
  }
  it('detects slightly flat string', () => {
    const f = 110 * Math.pow(2, -12 / 1200)
    const r = detectPitch(guitarLike(f), 48000)
    expect(1200 * Math.log2(r.freq / 110)).toBeCloseTo(-12, 0)
  })
})
