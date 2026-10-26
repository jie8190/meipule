import { describe, expect, it } from 'vitest'
import { planStrips, verticalCrossings } from './image'

/** 按段拼出每行墨迹：[行数, 墨迹量] */
const rows = (...blocks: [number, number][]) => blocks.flatMap(([n, v]) => Array<number>(n).fill(v))

describe('planStrips', () => {
  it('在空白行下刀，不切开内容', () => {
    // 三块内容，各 300 行，中间隔 40 行空白
    const ink = rows([300, 50], [40, 0], [300, 50], [40, 0], [300, 50])
    const { strips, hard } = planStrips(ink, ink.length, 760, 2, 100)
    expect(hard).toBe(false)
    // 每个切口都落在空白里
    for (const [, end] of strips.slice(0, -1)) expect(ink[end]).toBe(0)
    // 拼起来覆盖全部内容
    expect(strips[0][0]).toBe(0)
    expect(strips.at(-1)![1]).toBeGreaterThanOrEqual(ink.length - 1)
  })

  it('被长竖线穿过的空隙不下刀（多轨谱的一组谱线），宁可这一条高一些', () => {
    // 一组谱：两段谱线中间 60 行空隙，但有小节线穿过；后面 30 行真正的空白，再接下一组
    const ink = rows([350, 60], [60, 3], [350, 60], [30, 1], [400, 60])
    const cross = rows([350, 4], [60, 4], [350, 4], [30, 0], [400, 4])
    const { strips } = planStrips(ink, ink.length, 760, 2, 100, cross)
    // 第一条要包含整组（0~760），切口在 760~790 的空白里
    expect(strips[0][1]).toBeGreaterThan(760)
    expect(strips[0][1]).toBeLessThan(790)
  })

  it('每条开头不丢掉和弦名这种小字', () => {
    // 内容 | 30 行空白 | 和弦名（墨迹很少）| 2 行空白 | 和弦图 + 谱线
    const ink = rows([600, 40], [30, 0], [10, 3], [2, 0], [400, 40])
    const { strips } = planStrips(ink, ink.length, 760, 2, 100)
    expect(strips.length).toBe(2)
    // 第二条从和弦名之前开始
    expect(strips[1][0]).toBeLessThanOrEqual(630)
  })

  it('找不到空隙时硬切并留重叠', () => {
    const ink = rows([2000, 50])
    const { strips, hard } = planStrips(ink, ink.length, 760, 2, 100)
    expect(hard).toBe(true)
    expect(strips[1][0]).toBe(strips[0][1] - 100)
  })
})

describe('verticalCrossings', () => {
  it('只统计足够长、又没有贯穿整页的竖线', () => {
    const w = 20
    const h = 100
    const mask = new Uint8Array(w * h)
    for (let y = 10; y < 60; y++) mask[y * w + 5] = 1 // 小节线：50 行
    for (let y = 0; y < h; y++) mask[y * w + 15] = 1 // 装订线：贯穿整页
    for (let y = 70; y < 74; y++) mask[y * w + 10] = 1 // 字的一笔：太短
    const cross = verticalCrossings(mask, w, { x: 0, y: 0, w, h }, 8)
    expect(cross[30]).toBeGreaterThan(0)
    expect(cross[5]).toBe(0)
    expect(cross[72]).toBe(0)
  })
})
