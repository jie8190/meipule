import { describe, expect, it } from 'vitest'
import * as at from '@coderline/alphatab'
import { importScoreFile } from './fromScoreFile'
import { splitDuration } from './parse'
import { compileSong } from './compile'
import { buildTimeline } from './timeline'
import type { MeasureDoc } from './types'

const bars = (ms: (MeasureDoc | string)[] | undefined) => (ms ?? []) as MeasureDoc[]

/** 用 alphaTab 的文本格式现写一段谱，导出成真正的 Guitar Pro 文件 */
function makeGp(tex: string): Uint8Array {
  const settings = new at.Settings()
  settings.core.logLevel = at.LogLevel.None
  const score = at.importer.ScoreLoader.loadAlphaTex(tex, settings)
  return new at.exporter.Gp7Exporter().export(score, settings)
}

const ETUDE = String.raw`\title "Etude" \artist "Test" \tempo 100
\track "Guitar" \staff {tabs} \tuning (E4 B3 G3 D3 A2 E2) \capo 3
\chord ("C" 0 1 0 2 3 -1)
\section "Intro" \ro 3.5.8 {ch "C"} 2.4.8 0.3.8 1.2.8 0.1.2 | \rc 2 3.5.4 -.5.4 r.2 |
\section "Verse" \ro 0.6.4 5.1{h}.4 7.1.4 12.2{nh}.4 | \ae (1) \rc 2 0.1.1 | \ae (2) 3.6.1 |`

describe('导入 Guitar Pro', () => {
  it('单轨：调弦、变调夹、和弦按法、弦号方向、技巧', async () => {
    const { doc, notes } = await importScoreFile('etude.gp', makeGp(ETUDE))
    expect(notes).toEqual([])
    expect(doc).toMatchObject({ title: 'Etude', artist: 'Test', tempo: 100, capo: 3, time: '4/4' })
    expect(doc.tuning).toBeUndefined() // 标准调弦不写
    expect(doc.chords).toEqual({ C: 'x32010' })
    const intro = doc.sections[0]
    expect(intro).toMatchObject({ name: 'Intro', repeat: 2 })
    // alphaTab 的 1 弦是低音弦：3.5（5 弦 3 品）要变回 5:3
    expect(intro.measures![0]).toMatchObject({ chord: 'C', tab: '5:3/8 4:2/8 3:0/8 2:1/8 1:0/2' })
    // 延音线：第二拍是延音
    expect(intro.measures![1]).toMatchObject({ tab: '5:3/4 -/4 r/2' })
    const score = compileSong(doc)
    expect(score.diagnostics.filter((d) => d.level !== 'info')).toEqual([])
    expect(score.measures[0].guitar[0].notes[0]).toMatchObject({ string: 5, fret: 3, midi: 48 })
  })

  it('跳房子的反复按演奏顺序展开', async () => {
    const { doc } = await importScoreFile('etude.gp', makeGp(ETUDE))
    const verse = doc.sections[1]
    expect(verse.name).toBe('Verse')
    // 第一遍：3 4（1. 房子），第二遍：3 5（2. 房子）
    expect(bars(verse.measures).map((m) => m.tab)).toEqual([
      '6:0/4 1:5/4 1:7h/4 2:12*/4',
      '1:0/1',
      '6:0/4 1:5/4 1:7h/4 2:12*/4',
      '6:3/1',
    ])
    expect(verse.repeat).toBeUndefined()
  })

  it('多轨：吉他 + 鼓，鼓按 GM 编号转成鼓轨记号', async () => {
    const tex = String.raw`\title "Band" \tempo 90
\track "Lead" \staff {tabs} \tuning (D4 A3 F#3 D3 A2 D2)
0.1.4 2.1.4 4.1.4 5.1.4 |
\track "Rhythm" \staff {tabs}
(0.3 1.2 0.1).2 (2.3 3.2 2.1).2 |
\track "Drums" \instrument percussion \articulation defaults
(kickhit hihatclosed).8 hihatclosed.8 snarehit.4 kickhit.4 snarehit.4 |`
    const { doc } = await importScoreFile('band.gp', makeGp(tex))
    expect(doc.format).toBe('meipule/2')
    expect(doc.tracks).toEqual([
      { id: 'G1', name: 'Lead', tuning: 'openD' },
      { id: 'G2', name: 'Rhythm' },
      { id: 'drums', name: 'Drums', type: 'drums' },
    ])
    const m = bars(doc.sections[0].measures)[0]
    expect(m.tab).toBe('1:0/4 1:2/4 1:4/4 1:5/4')
    expect(m.tracks).toEqual({ G2: '1:0+2:1+3:0/2 1:2+2:3+3:2/2', drums: 'K+H/8 H/8 S/4 K/4 S/4' })
    const score = compileSong(doc)
    expect(score.diagnostics.filter((d) => d.level !== 'info')).toEqual([])
    expect(score.tracks.map((t) => t.tuningName)).toEqual(['Open D', '标准', '标准'])
    expect(buildTimeline(score).events.some((e) => e.kind === 'drum')).toBe(true)
  })

  it('两个声部合成一串（指弹的低音 + 旋律）', async () => {
    const tex = String.raw`\title "Two voices"
\track "G" \staff {tabs}
\voice 0.1.8 1.1.8 3.1.8 1.1.8 0.1.2 |
\voice 0.6.2 3.5.2 |`
    const { doc } = await importScoreFile('v.gp', makeGp(tex))
    expect(bars(doc.sections[0].measures)[0].tab).toBe('1:0+6:0/8 1:1/8 1:3/8 1:1/8 1:0+5:3/2')
  })

  it('时值拆分', () => {
    expect(splitDuration(480)).toEqual(['4'])
    expect(splitDuration(720)).toEqual(['4.'])
    expect(splitDuration(160)).toEqual(['8t'])
    // 四分 + 十六分：拆成两段，第二段用延音
    expect(splitDuration(600)).toEqual(['4', '16'])
  })

  it('不是乐谱文件时给出能看懂的错误', async () => {
    await expect(importScoreFile('x.gp', new Uint8Array([1, 2, 3, 4]))).rejects.toThrow('读不了这个文件')
  })
})
