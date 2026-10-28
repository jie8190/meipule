import { describe, expect, it } from 'vitest'
import { asciiTabToMeasures, chordSheetToSong, looksLikeChordSheet, mergeChordLyric } from './fromText'
import { compileSong } from './compile'

describe('和弦对到歌词上', () => {
  it('中文按两格对齐', () => {
    // 好0 一2 朵4 美6 丽8 的10：第 6 格是「美」，第 10 格是「的」
    expect(mergeChordLyric('C     Am', '好一朵美丽的茉莉花')).toBe('[C]好一朵[Am]美丽的茉莉花')
    expect(mergeChordLyric('C         Am', '好一朵美丽的茉莉花')).toBe('[C]好一朵美丽[Am]的茉莉花')
    // 落在中文字的后半格：算这个字
    expect(mergeChordLyric('G    C', '又香又白人人夸')).toBe('[G]又香[C]又白人人夸')
  })
  it('英文按字母列对齐；和弦落在空格上就挪到下一个词', () => {
    expect(mergeChordLyric('G       C          G', 'Amazing grace, how sweet the sound')).toBe('[G]Amazing [C]grace, how [G]sweet the sound')
    expect(mergeChordLyric('G      C', 'Amazing grace')).toBe('[G]Amazing [C]grace')
  })
  it('和弦超出歌词末尾时放在行尾', () => {
    expect(mergeChordLyric('C       G       D', '一二三四')).toBe('[C]一二三四[G][D]')
  })
})

describe('文字谱转换', () => {
  it('和弦在上、歌词在下 + 段落标题 + 变调夹', () => {
    const text = `茉莉花 - 江苏民歌
Capo 2

[Intro]
| C | Em | F | C |

[Verse]
C     Am
好一朵美丽的茉莉花
F         C
芬芳美丽满枝桠

Chorus:
G    C
又香又白人人夸`
    const r = chordSheetToSong(text)!
    expect(r.doc).toMatchObject({ title: '茉莉花', artist: '江苏民歌', capo: 2 })
    expect(r.doc.sections.map((s) => [s.name, s.lines])).toEqual([
      ['Intro', ['| C | Em | F | C |']],
      ['Verse', ['[C]好一朵[Am]美丽的茉莉花', '[F]芬芳美丽满[C]枝桠']],
      ['Chorus', ['[G]又香[C]又白人人夸']],
    ])
    const score = compileSong(r.doc)
    expect(score.diagnostics.filter((d) => d.level !== 'info')).toEqual([])
    expect(score.chordsUsed.map((c) => c.name)).toEqual(['C', 'Em', 'F', 'Am', 'G'])
  })

  it('[C] 内嵌和弦和 ChordPro 指令', () => {
    const text = `{title: Amazing Grace}
{artist: John Newton}
{capo: 3}
{start_of_verse: 主歌}
A[G]mazing [G7]grace, how [C]sweet the [G]sound
{end_of_verse}
{start_of_chorus}
That [G]saved a [Em]wretch like [D]me
{end_of_chorus}`
    const r = chordSheetToSong(text)!
    expect(r.doc).toMatchObject({ title: 'Amazing Grace', artist: 'John Newton', capo: 3 })
    expect(r.doc.sections.map((s) => s.name)).toEqual(['主歌', '副歌'])
    expect(r.doc.sections[0].lines).toEqual(['A[G]mazing [G7]grace, how [C]sweet the [G]sound'])
  })

  it('标题后面直接是歌词时，不把第一句歌词当标题', () => {
    const r = chordSheetToSong(`C     Am\n好一朵美丽的茉莉花\nF         C\n芬芳美丽满枝桠`)!
    expect(r.doc.title).toBe('未命名曲谱')
    expect(r.doc.sections[0].lines).toHaveLength(2)
  })

  it('文字六线谱按字符间距估算时值，每小节补满 4 拍', () => {
    const tab = ['e|-------0-------|', 'B|-----1---1-----|', 'G|---0-------0---|', 'D|-2-------------|', 'A|---------------|', 'E|---------------|']
    const ms = asciiTabToMeasures(tab)
    expect(ms).toHaveLength(1)
    // 开头的 - 是排版间隔，不算休止；最后一个音占到小节末尾
    expect(ms[0].tab).toBe('4:2/8 3:0/8 2:1/8 1:0/8 2:1/8 3:0/4.')
    const r = chordSheetToSong(`Riff\n${tab.join('\n')}\n${tab.join('\n')}`)!
    expect(r.doc.sections[0].measures).toHaveLength(2)
    expect(compileSong(r.doc).diagnostics.filter((d) => d.level !== 'info')).toEqual([])
  })

  it('普通文字不当成文字谱', () => {
    expect(looksLikeChordSheet('今天天气很好\n我们去公园\nA new day has come')).toBe(false)
    expect(chordSheetToSong('只是一段话')).toBeNull()
  })
})
