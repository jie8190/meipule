import { describe, expect, it } from 'vitest'
import { compileSong } from './compile'
import { parseSteps, parseMelody, splitLyrics, parseLyricLine } from './parse'
import { buildTimeline } from './timeline'
import { SAMPLES, SAMPLE_TWINKLE, SAMPLE_STRUM, SAMPLE_AMAZING_GRACE } from '../../samples'
import { getChordShape, generateVoicings, parseChord, transposeChord, fretsToString } from '../music/chords'

describe('parse', () => {
  it('parses tab tokens', () => {
    const { steps, errors } = parseSteps('6:3/8 3:0 (2:1 1:0) T T2 D U X - r d(4-1)/16 3:2h ↓')
    expect(errors).toEqual([])
    expect(steps.map((s) => s.kind)).toEqual([
      'notes', 'notes', 'notes', 'notes', 'notes', 'strum', 'strum', 'strum', 'hold', 'rest', 'strum', 'notes', 'strum',
    ])
    expect(steps[2].notes.length).toBe(2)
    expect(steps[10].strum?.range).toEqual([4, 1])
    expect(steps[11].notes[0].tech).toBe('h')
  })
  it('reports bad tokens', () => {
    const { errors } = parseSteps('3:2 9:1 Q')
    expect(errors.length).toBe(2)
  })
  it('parses melody', () => {
    const { notes, errors } = parseMelody("5, 1' #4/8 0 - 3.")
    expect(errors).toEqual([])
    expect(notes[0].octave).toBe(-1)
    expect(notes[1].octave).toBe(1)
    expect(notes[2].acc).toBe(1)
    expect(notes[3].kind).toBe('rest')
    expect(notes[4].kind).toBe('hold')
    expect(notes[5].dotted).toBe(true)
  })
  it('splits lyrics', () => {
    expect(splitLyrics('一闪一闪，亮晶晶')).toEqual(['一', '闪', '一', '闪，', '亮', '晶', '晶'])
    expect(splitLyrics('A-ma-zing grace _ how')).toEqual(['A-', 'ma-', 'zing', 'grace', '_', 'how'])
  })
  it('parses chord lines', () => {
    const l = parseLyricLine('[C]好一朵[Am]茉莉花')
    expect(l.segments).toEqual([
      { chord: 'C', text: '好一朵' },
      { chord: 'Am', text: '茉莉花' },
    ])
    expect(parseLyricLine('| C | G | Am F |').kind).toBe('chords')
  })
})

describe('chords', () => {
  it('parses chord names', () => {
    expect(parseChord('F#m7')?.quality).toBe('m7')
    expect(parseChord('D/F#')?.bassName).toBe('F#')
    expect(parseChord('Cadd9')?.quality).toBe('add9')
    expect(parseChord('H7')).toBeNull()
  })
  it('transposes', () => {
    expect(transposeChord('G/B', 2)).toBe('A/C#')
    expect(transposeChord('Bb', 2)).toBe('C')
    expect(transposeChord('Em7', -2, true)).toBe('Dm7')
  })
  it('library shapes', () => {
    expect(fretsToString(getChordShape('C')!.frets)).toBe('x32010')
    expect(getChordShape('F')!.barre?.fret).toBe(1)
    expect(fretsToString(getChordShape('A#')!.frets)).toBe('x13331')
  })
  it('generates voicings for uncommon chords', () => {
    for (const name of ['C#m7b5', 'Ebmaj9', 'F#7sus4', 'Abdim7', 'B13', 'Gb/Bb', 'E6']) {
      const v = generateVoicings(parseChord(name)!)
      expect(v.length, name).toBeGreaterThan(0)
    }
  })
})

describe('compile', () => {
  it('compiles all samples without errors', () => {
    for (const s of SAMPLES) {
      const score = compileSong(s)
      const errs = score.diagnostics.filter((d) => d.level !== 'info')
      expect(errs, s.title + JSON.stringify(errs)).toEqual([])
    }
  })
  it('expands patterns with chord changes', () => {
    const score = compileSong(SAMPLE_TWINKLE)
    const m = score.measures[1] // 前奏第 2 小节：F C
    expect(m.guitar.length).toBe(8)
    expect(m.guitar[0].notes[0]).toMatchObject({ string: 6, fret: 1 }) // F 的低音在 6 弦
    expect(m.guitar[4].notes[0]).toMatchObject({ string: 5, fret: 3 }) // C 的低音在 5 弦
  })
  it('merges holds in strum patterns', () => {
    const score = compileSong(SAMPLE_STRUM)
    const m = score.measures[0]
    expect(m.guitar.map((g) => g.dur)).toEqual([480, 240, 480, 240, 240, 240])
  })
  it('transposes with shift', () => {
    const score = compileSong(SAMPLE_TWINKLE, { shift: 7, capo: 5 }) // C → G 指法，夹 5
    expect(score.shapeKey).toBe('G')
    expect(score.soundingKey).toBe('C')
    expect(score.measures[0].chords[0].name).toBe('G')
  })
  it('handles pickup and verses', () => {
    const score = compileSong(SAMPLE_AMAZING_GRACE)
    expect(score.measures[0].ticks).toBe(480)
    expect(score.measures[1].melody[0].lyric).toEqual(['ma-', 'grace'])
    const tl = buildTimeline(score)
    expect(tl.order.length).toBe(17 * 2)
  })
  it('warns when capo is missing for the chord shapes', () => {
    // 谱头「G调 夹2品 原唱调 1=A」，却写成了 capo 0
    const doc = { title: 't', key: 'A', capo: 0, sections: [{ lines: ['[G]a [C]b [Em]c [D]d', '[G]e [C]f [Am]g [D]h [G]i'] }] }
    const msgs = compileSong(doc).diagnostics.map((d) => d.message).join('\n')
    expect(msgs).toContain('capo 应为 2')
    expect(compileSong({ ...doc, capo: 2 }).diagnostics).toEqual([])
  })
  it('warns when tab notes mostly miss the chord (strings miscounted)', () => {
    const wrong = compileSong({ title: 't', sections: [{ measures: [{ chord: 'C', tab: '2:3/8 3:3 1:0 2:3 1:2 2:3 1:0 2:3' }] }] })
    expect(wrong.diagnostics.map((d) => d.message).join()).toContain('弦号可能数错了')
    const right = compileSong({ title: 't', sections: [{ measures: [{ chord: 'C', tab: '5:3/8 5:3 3:0 5:3 3:2 5:3 3:0 5:3' }] }] })
    expect(right.diagnostics).toEqual([])
  })
  it('renders marker-only sections without warnings', () => {
    const s = compileSong({ title: 't', sections: [{ name: '重复：桥段 → 副歌' }] })
    expect(s.diagnostics).toEqual([])
    expect(s.sections[0]).toMatchObject({ kind: 'lines', lines: [] })
  })
  it('gives friendly diagnostics', () => {
    const score = compileSong({ title: 'x', sections: [{ measures: [{ chord: 'Hm', tab: '3:2/4 3:3' }] }] })
    const msgs = score.diagnostics.map((d) => d.message).join('\n')
    expect(msgs).toContain('无法识别的和弦')
    expect(msgs).toContain('六线谱时值合计')
  })
})
