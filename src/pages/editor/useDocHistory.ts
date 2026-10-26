import { useCallback, useRef, useState } from 'react'
import type { SongDoc } from '@/lib/notation/types'

/** 带撤销/重做的文档状态；同一个 key 的连续修改在 800ms 内合并为一步 */
export function useDocHistory(initial: SongDoc) {
  const [doc, setDoc] = useState<SongDoc>(initial)
  const past = useRef<SongDoc[]>([])
  const future = useRef<SongDoc[]>([])
  const last = useRef<{ key?: string; at: number }>({ at: 0 })
  const [, force] = useState(0)

  const set = useCallback((next: SongDoc | ((d: SongDoc) => SongDoc), key?: string) => {
    setDoc((cur) => {
      const n = typeof next === 'function' ? next(cur) : next
      if (n === cur) return cur
      const now = Date.now()
      const merge = key && last.current.key === key && now - last.current.at < 800
      if (!merge) {
        past.current.push(cur)
        if (past.current.length > 150) past.current.shift()
      }
      last.current = { key, at: now }
      future.current = []
      return n
    })
    force((x) => x + 1)
  }, [])

  const undo = useCallback(() => {
    setDoc((cur) => {
      const prev = past.current.pop()
      if (!prev) return cur
      future.current.push(cur)
      last.current = { at: 0 }
      return prev
    })
    force((x) => x + 1)
  }, [])

  const redo = useCallback(() => {
    setDoc((cur) => {
      const nxt = future.current.pop()
      if (!nxt) return cur
      past.current.push(cur)
      last.current = { at: 0 }
      return nxt
    })
    force((x) => x + 1)
  }, [])

  const reset = useCallback((d: SongDoc) => {
    past.current = []
    future.current = []
    setDoc(d)
    force((x) => x + 1)
  }, [])

  return { doc, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}

export type DocSetter = (next: SongDoc | ((d: SongDoc) => SongDoc), key?: string) => void
