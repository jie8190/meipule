import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
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
  Loader2,
  CircleCheck,
  CircleAlert,
} from 'lucide-react'
import { db } from '@/lib/db'
import { MARK_VIEWBOX, markSvg } from '@/lib/brand'
import { useUi } from '@/store/ui'
import { useKeepAwake, useKeyboardOpen } from '@/lib/native'
import { useAiJob } from '@/store/aiJob'
import { resolvedTheme, useSettings } from '@/store/settings'
import { cn, Kbd } from './ui'

export function Logo({ className, size = 34 }: { className?: string; size?: number }) {
  // 渐变跟随当前主题色；id 去掉 useId 里的特殊字符，才能用在 url(#...) 里
  const id = 'logo' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const html = useMemo(() => markSvg(id, ['var(--accent)', 'var(--accent-2)']), [id])
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={(size * 326) / 384}
      height={size}
      className={cn('shrink-0 drop-shadow-[0_6px_14px_var(--accent-glow)]', className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
          <FileUp className="size-4" /> 导入曲谱
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
                className={({ isActive }) =>
                  cn('flex w-16 flex-col items-center gap-0.5 text-[10.5px] font-medium transition active:scale-90', isActive ? 'text-accent' : 'text-fg-3')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative flex h-7 w-12 items-center justify-center">
                      {isActive && (
                        <motion.span layoutId="tab-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />
                      )}
                      <it.icon className="relative size-[21px]" strokeWidth={isActive ? 2.2 : 1.9} />
                    </span>
                    {it.label}
                  </>
                )}
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
                { icon: FileUp, title: '导入曲谱', desc: 'Guitar Pro 文件、复制的文字谱、JSON', cls: 'bg-surface-3 text-fg', go: () => openImport() },
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

/** 不在「AI 扒谱」页时，显示后台扒谱的进度；扒完提示回去查看 */
function AiJobPill({ immersive }: { immersive: boolean }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const running = useAiJob((s) => s.running)
  const unseen = useAiJob((s) => s.unseen)
  const pages = useAiJob((s) => s.pages)
  const failed = useAiJob((s) => !!s.error)
  // 长谱要扒十几分钟：熄屏后系统可能把网页里的请求挂起，扒谱期间保持屏幕常亮
  useKeepAwake(running)
  const show = !pathname.startsWith('/ai') && (running || unseen)
  const label = running
    ? pages
      ? `AI 正在扒谱 · 已完成 ${pages.done}/${pages.total} 页`
      : 'AI 正在扒谱…'
    : failed
      ? 'AI 扒谱没有成功，点击查看'
      : 'AI 扒谱完成，点击查看'
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: -12, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -12, x: '-50%' }}
          onClick={() => navigate('/ai')}
          className={cn(
            'glass fixed left-1/2 z-50 flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-full border border-line-2 px-4 py-2 text-[13px] font-medium shadow-[var(--shadow-lg)]',
            // 谱面页、编辑页的顶栏下面；其它页面贴着屏幕顶部
            immersive ? 'top-[calc(68px+var(--sat))]' : 'top-[calc(12px+var(--sat))]',
          )}
        >
          {running ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-ai-1" />
          ) : failed ? (
            <CircleAlert className="size-4 shrink-0 text-err" />
          ) : (
            <CircleCheck className="size-4 shrink-0 text-ok" />
          )}
          <span className="truncate">{label}</span>
        </motion.button>
      )}
    </AnimatePresence>
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
      <AiJobPill immersive={immersive} />
    </div>
  )
}
