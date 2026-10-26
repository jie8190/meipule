import { describe, expect, it } from 'vitest'
import { compileSong, harmonicOffset } from './compile'
import { parseHits } from './parse'
import { buildTimeline } from './timeline'
import { SAMPLE_LOOP } from '../../samples'
import type { SongDoc } from './types'

describe('多轨 meipule/2', () => {
  it('示例曲谱没有任何提示', () => {
    const score = compileSong(SAMPLE_LOOP)
    expect(score.diagnostics).toEqual([])
    expect(score.tracks.map((t) => [t.id, t.type, t.capo, t.tuningName])).toEqual([
      ['G1', 'guitar', 0, 'DADGAD'],
      ['kick', 'drums', 0, '标准'],
      ['snare', 'drums', 0, '标准'],
      ['G2', 'guitar', 5, '标准'],
    ])
    expect(score.mainTrack).toBe(0)
    expect(score.tracks.every((t) => t.hasContent)).toBe(true)
  })

  it('泛音按泛音的音高发声', () => {
    expect(harmonicOffset(12)).toBe(12)
    expect(harmonicOffset(7)).toBe(19)
    expect(harmonicOffset(5)).toBe(24)
    const score = compileSong(SAMPLE_LOOP)
    // DADGAD 的 5 弦是 A2（45），7 品泛音比空弦高 19 个半音
    const note = score.measures[1].parts[0].guitar[0].notes[0]
    expect(note).toMatchObject({ string: 5, fret: 7, harmonic: true, midi: 45 + 19 })
  })

  it('"%4" 复制 4 小节之前的内容（Loop）', () => {
    const score = compileSong(SAMPLE_LOOP)
    const notes = (mi: number) => score.measures[mi].parts[0].guitar.map((g) => g.notes.map((n) => `${n.string}:${n.fret}`).join('+'))
    expect(notes(4)).toEqual(notes(0))
    expect(notes(15)).toEqual(notes(3))
    // 鼓轨也能复制
    expect(score.measures[12].parts[1].drums.map((h) => h.tick)).toEqual(score.measures[8].parts[1].drums.map((h) => h.tick))
  })

  it('鼓轨记号', () => {
    const { hits, errors } = parseHits('K/4 (K H) s> - r/8 Q')
    expect(errors.map((e) => e.token)).toEqual(['Q'])
    expect(hits.map((h) => h.kind)).toEqual(['hit', 'hit', 'hit', 'hold', 'rest'])
    expect(hits[1].notes.map((n) => n.inst)).toEqual(['K', 'H'])
    expect(hits[2].notes[0]).toEqual({ inst: 'S', accent: true, light: true })
    const score = compileSong(SAMPLE_LOOP)
    expect(score.measures[7].parts[1].drums.map((h) => h.tick)).toEqual([0, 480, 960, 1200, 1440])
  })

  it('时间线：每轨用自己的变调夹，鼓轨产生击打事件', () => {
    const score = compileSong(SAMPLE_LOOP)
    const tl = buildTimeline(score)
    const g2 = tl.events.find((e) => e.kind === 'pluck' && e.track === 3)
    // 标准调弦 1 弦 E4（64）5 品，夹 5 品 → 74
    expect(g2 && g2.kind === 'pluck' && g2.notes[0].midi).toBe(64 + 5 + 5)
    const drums = tl.events.filter((e) => e.kind === 'drum')
    expect(drums.length).toBeGreaterThan(0)
    expect(new Set(drums.map((e) => e.kind === 'drum' && e.track))).toEqual(new Set([1, 2]))
  })

  it('移调时各轨发声变化一致：变调夹一起挪，挪不动的部分移到六线谱上', () => {
    const doc: SongDoc = {
      title: 't',
      key: 'A',
      capo: 2,
      tracks: [{ id: 'a' }, { id: 'b', capo: 0 }],
      sections: [{ measures: [{ chord: 'G', tab: '3:0/1', tracks: { b: '3:2/1' } }] }],
    }
    const sounding = (opts: { shift?: number; capo?: number }) => {
      const sc = compileSong(doc, opts)
      return sc.measures[0].parts.map((p, i) => p.guitar[0].notes[0].midi + sc.tracks[i].capo)
    }
    const base = sounding({})
    // 选调 A（去掉变调夹）：主轨指法 +2，b 轨夹子已经是 0，六线谱不动
    expect(sounding({ shift: 2, capo: 0 })).toEqual(base)
    // 选调 F（夹 4）：b 轨夹子 +2，六线谱 -2
    expect(sounding({ shift: -2, capo: 4 })).toEqual(base)
  })

  it('找不到的音轨、鼓轨写错记号会提示', () => {
    const score = compileSong({
      title: 't',
      tracks: [{ id: 'g' }, { id: 'd', type: 'drums' }],
      sections: [{ measures: [{ tab: '1:0/1', tracks: { x: '1:0', d: 'K Z' } }] }],
    })
    const msgs = score.diagnostics.map((d) => d.message).join('\n')
    expect(msgs).toContain('找不到音轨 "x"')
    expect(msgs).toContain('无法识别 "Z"')
  })

  it('单轨曲谱照旧：一条主轨，parts[0] 就是 guitar', () => {
    const score = compileSong({ title: 't', sections: [{ measures: [{ chord: 'C', tab: '5:3/1' }] }] })
    expect(score.tracks).toHaveLength(1)
    expect(score.measures[0].parts[0].guitar).toBe(score.measures[0].guitar)
  })
})
