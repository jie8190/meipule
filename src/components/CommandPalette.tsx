import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { Search, WandSparkles, PenLine, FileUp, AudioWaveform, Metronome, Grid3x3, Settings2, Moon, BookOpen, ListMusic, CornerDownLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { useUi } from '@/store/ui'
import { resolvedTheme, useSettings } from '@/store/settings'
import { parseChord } from '@/lib/music/chords'
import { Cover } from './Cover'
import { cn, Kbd } from './ui'

interface Item {
  id: string
  label: string
  sub?: string
  icon?: React.ReactNode
  cover?: { title: string; artist: string }
  run: () => void
  group: string
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPalette)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const songs = useLiveQuery(() => (open ? db.songs.orderBy('updatedAt').reverse().toArray() : []), [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUi.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => {
      setOpen(false)
      navigate(path)
    }
    const term = q.trim().toLowerCase()
    const out: Item[] = []
    const list = (songs ?? []).filter(
      (s) => !term || s.title.toLowerCase().includes(term) || s.artist.toLowerCase().includes(term) || s.tags.some((t) => t.toLowerCase().includes(term)),
    )
    for (const s of list.slice(0, term ? 12 : 6)) {
      out.push({ id: 's' + s.id, group: '曲谱', label: s.title, sub: [s.artist, s.key && `原调 ${s.key}`].filter(Boolean).join(' · '), cover: { title: s.title, artist: s.artist }, run: go(`/song/${s.id}`) })
    }
    if (term && parseChord(q.trim())) {
      out.push({ id: 'chord', group: '和弦', label: `查看和弦 ${q.trim()}`, icon: <Grid3x3 className="size-4" />, run: go(`/tools/chords?c=${encodeURIComponent(q.trim())}`) })
    }
    const actions: Item[] = [
      { id: 'ai', group: '操作', label: 'AI 扒谱', sub: '图片/文字 → 曲谱 JSON', icon: <WandSparkles className="size-4" />, run: go('/ai') },
      { id: 'new', group: '操作', label: '新建曲谱', icon: <PenLine className="size-4" />, run: go('/edit/new') },
      {
        id: 'import',
        group: '操作',
        label: '导入 JSON',
        icon: <FileUp className="size-4" />,
        run: () => {
          setOpen(false)
          useUi.getState().openImport()
        },
      },
      { id: 'lists', group: '前往', label: '歌单', icon: <ListMusic className="size-4" />, run: go('/setlists') },
      { id: 'tuner', group: '前往', label: '调音器', icon: <AudioWaveform className="size-4" />, run: go('/tools/tuner') },
      { id: 'metro', group: '前往', label: '节拍器', icon: <Metronome className="size-4" />, run: go('/tools/metronome') },
      { id: 'chords', group: '前往', label: '和弦库', icon: <Grid3x3 className="size-4" />, run: go('/tools/chords') },
      { id: 'docs', group: '前往', label: '格式文档', icon: <BookOpen className="size-4" />, run: go('/docs') },
      { id: 'settings', group: '前往', label: '设置', icon: <Settings2 className="size-4" />, run: go('/settings') },
      {
        id: 'theme',
        group: '操作',
        label: '切换深色 / 浅色',
        icon: <Moon className="size-4" />,
        run: () => {
          const s = useSettings.getState()
          s.set({ theme: resolvedTheme(s.theme) === 'dark' ? 'light' : 'dark' })
          setOpen(false)
        },
      },
    ]
    out.push(...actions.filter((a) => !term || a.label.toLowerCase().includes(term) || a.sub?.toLowerCase().includes(term)))
    return out
  }, [q, songs, navigate, setOpen])

  useEffect(() => setSel(0), [q])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      items[sel]?.run()
    } else if (e.key === 'Escape') setOpen(false)
  }

  let lastGroup = ''
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[6px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-[var(--shadow-lg)]"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          >
            <div className="flex items-center gap-3 border-b border-line px-5">
              <Search className="size-5 text-fg-3" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="搜索曲名、歌手、标签，或输入和弦名…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[56vh] overflow-y-auto p-2">
              {items.length === 0 && <div className="px-4 py-10 text-center text-sm text-fg-3">没有找到结果</div>}
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? it.group : null
                lastGroup = it.group
                return (
                  <div key={it.id}>
                    {header && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fg-3">{header}</div>}
                    <button
                      onMouseEnter={() => setSel(i)}
                      onClick={it.run}
                      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors', sel === i ? 'bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]' : '')}
                    >
                      {it.cover ? (
                        <Cover title={it.cover.title} artist={it.cover.artist} className="size-9 shrink-0 rounded-lg" showText={false} />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-2">{it.icon}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{it.label}</span>
                        {it.sub && <span className="block truncate text-xs text-fg-3">{it.sub}</span>}
                      </span>
                      {sel === i && <CornerDownLeft className="size-4 text-fg-3" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
