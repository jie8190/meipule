import { describe, expect, it } from 'vitest'
import { CONTINUED, mergePages, songHeader } from './merge'
import { compileSong } from './compile'

describe('分页合并', () => {
  const page1 = {
    title: 'Loop',
    tempo: 122,
    tracks: [{ id: 'G1', tuning: 'DADGAD' }, { id: 'kick', type: 'drums' as const }],
    patterns: { a: 'T 3 2 3' },
    notes: '第 1 页清楚',
    sections: [{ name: 'Intro', measures: [{ tab: '1:12*/1' }, { tab: '%' }] }],
  }

  it('接上页的段落接起来，新段落追加', () => {
    const doc = mergePages([
      page1,
      {
        sections: [
          { name: CONTINUED, measures: [{ tracks: { kick: 'K/4 K K K' } }] },
          { name: 'Verse', measures: [{ tab: '2:0/1' }] },
        ],
        notes: '有两小节看不清',
      },
    ])
    expect(doc.sections.map((s) => [s.name, s.measures?.length])).toEqual([
      ['Intro', 3],
      ['Verse', 1],
    ])
    expect(doc.notes).toBe('第 1 页清楚\n第 2 页：有两小节看不清')
    expect(compileSong(doc).diagnostics.filter((d) => d.level === 'error')).toEqual([])
  })

  it('和上一段同名的也接起来；和弦歌词谱的行接起来', () => {
    const doc = mergePages([
      { title: 't', sections: [{ name: '主歌', lines: ['[C]一'] }] },
      { sections: [{ name: '主歌', lines: ['[G]二'] }, { name: '副歌', lines: ['[F]三'] }] },
    ])
    expect(doc.sections.map((s) => [s.name, s.lines])).toEqual([
      ['主歌', ['[C]一', '[G]二']],
      ['副歌', ['[F]三']],
    ])
  })

  it('全曲信息以第 1 页为准，后面页新出现的节奏型、音轨补进来', () => {
    const doc = mergePages([
      page1,
      { tempo: 90, key: 'D', patterns: { a: 'X', b: 'D - D U' }, tracks: [{ id: 'G1' }, { id: 'G2', capo: 5 }], sections: [] },
    ])
    expect(doc.tempo).toBe(122)
    expect(doc.key).toBe('D')
    expect(doc.patterns).toEqual({ a: 'T 3 2 3', b: 'D - D U' })
    expect(doc.tracks?.map((t) => t.id)).toEqual(['G1', 'kick', 'G2'])
  })

  it('反复合并结果不变，也不改动各页的原始数据', () => {
    const pages = [
      page1,
      { sections: [{ name: CONTINUED, measures: [{ tab: '1:0/1' }] }, { name: 'Chorus', measures: [{ tab: '2:0/1' }] }] },
      { sections: [{ name: CONTINUED, measures: [{ tab: '3:0/1' }, { tab: '3:2/1' }] }] },
      { sections: [{ name: CONTINUED, measures: [{ tab: '4:0/1' }] }] },
    ]
    const before = JSON.stringify(pages)
    const count = (d: ReturnType<typeof mergePages>) => d.sections.map((s) => [s.name, s.measures?.length])
    const first = count(mergePages(pages))
    // 扒谱时每完成一页都会把已完成的页重新合并一次
    for (let n = 1; n <= pages.length; n++) mergePages(pages.slice(0, n))
    expect(count(mergePages(pages))).toEqual(first)
    expect(first).toEqual([
      ['Intro', 3],
      ['Chorus', 4],
    ])
    expect(JSON.stringify(pages)).toBe(before)
  })

  it('songHeader 只取全曲信息', () => {
    const h = songHeader(page1)
    expect(Object.keys(h).sort()).toEqual(['patterns', 'tempo', 'title', 'tracks'])
  })
})
