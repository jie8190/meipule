import { describe, expect, it } from 'vitest'
import { parseLenient } from './spec'

describe('parseLenient', () => {
  it('keeps Chinese quotes inside valid JSON strings', () => {
    const r = parseLenient('```json\n{"title":"t","notes":"鼓律动记号为“| xx X |”"}\n```')
    expect(r.error).toBeUndefined()
    expect((r.value as { notes: string }).notes).toContain('“| xx X |”')
  })
  it('accepts trailing commas and prose around the JSON', () => {
    const r = parseLenient('好的：\n{"title": "t", "sections": [],}\n希望有帮助')
    expect(r.error).toBeUndefined()
  })
  it('falls back to curly quotes used as delimiters', () => {
    const r = parseLenient('{“title”: “t”}')
    expect((r.value as { title: string }).title).toBe('t')
  })
  it('reports line and column on real syntax errors', () => {
    expect(parseLenient('{\n "a": 1\n "b": 2\n}').error).toMatch(/第 3 行/)
  })
})
