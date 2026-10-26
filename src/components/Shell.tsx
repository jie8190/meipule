import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import {
  LibraryBig,
  Heart,
  ListMusic,
  AudioWaveform,
  Metronome,
  Grid3x3,
  BookOpen,
  Settings2,
  Plus,
  WandSparkles,
  FileUp,
  PenLine,
  Search,
  Moon,
  Sun,
  Wrench,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useUi } from '@/store/ui'
import { useKeyboardOpen } from '@/lib/native'
import { resolvedTheme, useSettings } from '@/store/settings'
import { cn, Kbd } from './ui'

export function Logo({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <clipPath id="logo-c">
          <path d="M32 60C24 52 6 34 6 20 6 10.5 17 4 32 4s26 6.5 26 16c0 14-18 32-26 40Z" />
        </clipPath>
      </defs>
      <path d="M32 60C24 52 6 34 6 20 6 10.5 17 4 32 4s26 6.5 26 16c0 14-18 32-26 40Z" fill="url(#logo-g)" />
      <g clipPath="url(#logo-c)" stroke="#fff" strokeOpacity="0.55" strokeLinecap="round">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={i} x1={17 + i * 6} y1={-2} x2={17 + i * 6} y2={66} strokeWidth={0.8 + (5 - i) * 0.22} />
        ))}
      </g>
      <circle cx="32" cy="23" r="7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeOpacity="0.95" />
    </svg>
  )
}

const NAV = [
  { to: '/', label: '曲库', icon: LibraryBig, end: true },
  { to: '/favorites', label: '收藏', icon: Heart },
  { to: '/setlists', label: '歌单', icon: ListMusic },
]
const TOOLS = [
  { to: '/tools/tuner', label: '调音器', icon: AudioWaveform },
  { to: '/tools/metronome', label: '节拍器', icon: Metronome },
  { to: '/tools/chords', label: '和弦库', icon: Grid3x3 },
]
const MORE = [
  { to: '/docs', label: '格式文档', icon: BookOpen },
  { to: '/settings', label: '设置', icon: Settings2 },
]

function NavItem({ to, label, icon: Icon, end, count }: { to: string; label: string; icon: typeof LibraryBig; end?: boolean; count?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors',
          isActive ? 'text-fg' : 'text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-xl bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] ring-1 ring-line"
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            />
          )}
          <Icon className={cn('relative size-[18px] transition-colors', isActive ? 'text-accent' : '')} strokeWidth={isActive ? 2.2 : 1.8} />
          <span className="relative flex-1">{label}</span>
          {count !== undefined && count > 0 && <span className="relative text-xs tabular-nums text-fg-3">{count}</span>}
        </>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const navigate = useNavigate()
  const openImport = useUi((s) => s.openImport)
  const setPalette = useUi((s) => s.setPalette)
  const counts = useLiveQuery(async () => ({
    songs: await db.songs.count(),
    fav: await db.songs.where('favorite').equals(1).count(),
    lists: await db.setlists.count(),
  }))
  const theme = useSettings((s) => s.theme)
  const set = useSettings((s) => s.set)
  const dark = resolvedTheme(theme) === 'dark'
  return (
    <aside className="glass relative z-20 hidden w-[252px] shrink-0 flex-col border-r border-line pt-[var(--sat)] lg:flex">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <Logo />
        <div className="leading-tight">
          <div className="text-[17px] font-bold tracking-tight">没谱了</div>
          <div className="text-[11px] text-fg-3">本地吉他谱 · Meipule</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => setPalette(true)}
          className="flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] px-3 text-[13px] text-fg-3 transition hover:border-line-2 hover:text-fg-2"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">搜索曲谱、和弦…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 px-3">
        <button
          onClick={() => navigate('/edit/new')}
          className="group flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:border-line-2"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent-gradient text-accent-fg">
            <PenLine className="size-4" />
          </span>
          <span className="text-[13px] font-semibold">制谱</span>
        </button>
        <button
          onClick={() => navigate('/ai')}
          className="ai-border group flex flex-col items-start gap-2 rounded-2xl bg-surface p-3 text-left transition hover:-translate-y-0.5"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-ai-gradient text-white">
            <WandSparkles className="size-4" />
          </span>
          <span className="text-[13px] font-semibold">AI 扒谱</span>
        </button>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {NAV.map((n) => (
          <NavItem key={n.to} {...n} count={n.to === '/' ? counts?.songs : n.to === '/favorites' ? counts?.fav : counts?.lists} />
        ))}
        <div className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">工具</div>
        {TOOLS.map((n) => (
          <NavItem key={n.to} {...n} />
        ))}
        <div className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">更多</div>
        {MORE.map((n) => (
          <NavItem key={n.to} {...n} />
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <button onClick={() => openImport()} className="flex h-9 flex-1 items-center gap-2 rounded-xl px-2 text-[13px] text-fg-2 transition hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] hover:text-fg">
          <FileUp className="size-4" /> 导入 JSON
        </button>
        <button
          aria-label="切换主题"
          title="切换主题"
          onClick={() => set({ theme: dark ? 'light' : 'dark' })}
          className="flex size-9 items-center justify-center rounded-xl text-fg-2 transition hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] hover:text-fg"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={dark ? 'm' : 's'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </aside>
  )
}

function BottomNav() {
  const [sheet, setSheet] = useState(false)
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])
  const navigate = useNavigate()
  const openImport = useUi((s) => s.openImport)
  const keyboard = useKeyboardOpen()
  const items = [
    { to: '/', label: '曲库', icon: LibraryBig, end: true },
    { to: '/setlists', label: '歌单', icon: ListMusic },
    null,
    { to: '/tools', label: '工具', icon: Wrench },
    { to: '/settings', label: '设置', icon: Settings2 },
  ]
  return (
    <>
      {/* 键盘弹出时收起底栏，不然它会被顶到键盘上方挡住输入区 */}
      <nav className={cn('glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[var(--sab)] lg:hidden', keyboard && 'hidden')}>
        <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
          {items.map((it, i) =>
            it ? (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) => cn('flex w-16 flex-col items-center gap-1 text-[10.5px] font-medium transition-colors', isActive ? 'text-accent' : 'text-fg-3')}
              >
                <it.icon className="size-[21px]" strokeWidth={1.9} />
                {it.label}
              </NavLink>
            ) : (
              <button
                key={i}
                aria-label="新建"
                onClick={() => setSheet(true)}
                className="-mt-6 flex size-14 items-center justify-center rounded-[20px] bg-accent-gradient text-accent-fg shadow-[0_10px_30px_-8px_var(--accent-glow)] transition active:scale-90"
              >
                <Plus className="size-6" strokeWidth={2.5} />
              </button>
            ),
          )}
        </div>
      </nav>
      <AnimatePresence>
        {sheet && (
          <div role="dialog" className="fixed inset-0 z-[70] flex items-end lg:hidden">
            <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            <motion.div
              className="relative w-full rounded-t-[28px] border-t border-line-2 bg-surface p-4 pb-[calc(20px+var(--sab))]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-3" />
              {[
                { icon: WandSparkles, title: 'AI 扒谱', desc: '拍照/截图，让 AI 转成曲谱 JSON', cls: 'bg-ai-gradient text-white', go: () => navigate('/ai') },
                { icon: FileUp, title: '导入 JSON', desc: '粘贴或选择 .json 曲谱文件', cls: 'bg-surface-3 text-fg', go: () => openImport() },
                { icon: PenLine, title: '从零制谱', desc: '和弦 + 节奏型，参数化生成六线谱', cls: 'bg-accent-gradient text-accent-fg', go: () => navigate('/edit/new') },
              ].map((a) => (
                <button
                  key={a.title}
                  onClick={() => {
                    setSheet(false)
                    a.go()
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl p-3 text-left transition active:bg-[color-mix(in_oklab,var(--fg)_6%,transparent)]"
                >
                  <span className={cn('flex size-11 items-center justify-center rounded-2xl', a.cls)}>
                    <a.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold">{a.title}</span>
                    <span className="block text-xs text-fg-3">{a.desc}</span>
                  </span>
                </button>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const immersive = pathname.startsWith('/song/') || pathname.startsWith('/edit/')
  return (
    <div className="relative z-10 flex h-dvh pl-[var(--sal)] pr-[var(--sar)]">
      {!immersive && <Sidebar />}
      <main id="main-scroll" className={cn('relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden', !immersive && 'pb-[calc(112px+var(--sab))] pt-[var(--sat)] lg:pb-0')}>
        {children}
      </main>
      {!immersive && <BottomNav />}
    </div>
  )
}
