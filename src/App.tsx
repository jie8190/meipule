import { lazy, Suspense, useEffect, useLayoutEffect, type ComponentType } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { Shell } from './components/Shell'
import { ConfirmHost, Toaster, Spinner } from './components/ui'
import { ImportDialog } from './components/ImportDialog'
import { CommandPalette } from './components/CommandPalette'
import { GlobalDrop } from './components/GlobalDrop'
import { ErrorBoundary } from './components/ErrorBoundary'
import { resolvedTheme, useSettings } from './store/settings'
import { seedSamples } from './lib/db'
import { audio } from './lib/audio/engine'
import { initNative, setSystemBarsTheme } from './lib/native'
import { finishBoot } from './lib/boot'
import Library from './pages/Library'
import SongPage from './pages/SongPage'

/**
 * 按需加载的页面。启动时会全部预加载；加载好以后直接渲染组件本身，
 * 不再经过 React.lazy（它即使代码已就绪，第一次渲染也会先挂起一下，闪出加载圈）。
 */
const preloaders: (() => Promise<unknown>)[] = []
function page(load: () => Promise<{ default: ComponentType }>) {
  let Loaded: ComponentType | null = null
  const loadOnce = () => load().then((m) => ((Loaded = m.default), m))
  const Lazy = lazy(loadOnce)
  preloaders.push(loadOnce)
  return function Page() {
    return Loaded ? <Loaded /> : <Lazy />
  }
}

const Editor = page(() => import('./pages/Editor'))
const AiPage = page(() => import('./pages/AiPage'))
const Setlists = page(() => import('./pages/Setlists'))
const SetlistDetail = page(() => import('./pages/SetlistDetail'))
const Tuner = page(() => import('./pages/Tuner'))
const Metronome = page(() => import('./pages/Metronome'))
const ChordLibrary = page(() => import('./pages/ChordLibrary'))
const ToolsHub = page(() => import('./pages/ToolsHub'))
const SettingsPage = page(() => import('./pages/Settings'))
const Docs = page(() => import('./pages/Docs'))

function preloadPages(onProgress: (p: number) => void) {
  let n = 0
  return Promise.all(preloaders.map((f) => f().catch(() => null).finally(() => onProgress(++n / preloaders.length))))
}

function ThemeSync() {
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const volumes = useSettings((s) => s.volumes)
  useEffect(() => {
    const apply = () => {
      const t = resolvedTheme(theme)
      document.documentElement.dataset.theme = t
      setSystemBarsTheme(t)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f1ea' : '#08080c')
    }
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])
  useEffect(() => {
    audio.setVolumes(volumes)
  }, [volumes])
  return null
}

function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-fg-3">
      <Spinner className="size-5" />
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  const key = location.pathname.split('/').slice(0, 2).join('/')
  // 换页时回到顶部（各页面共用同一个滚动容器）
  useLayoutEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 })
  }, [key])
  // 新页面直接出现、轻轻淡入；不等旧页面淡出，切换更跟手
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-full"
    >
      <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes location={location}>
          <Route path="/" element={<Library />} />
          <Route path="/favorites" element={<Library favorites />} />
          <Route path="/song/:id" element={<SongPage />} />
          <Route path="/edit/:id" element={<Editor />} />
          <Route path="/ai" element={<AiPage />} />
          <Route path="/setlists" element={<Setlists />} />
          <Route path="/setlists/:id" element={<SetlistDetail />} />
          <Route path="/tools" element={<ToolsHub />} />
          <Route path="/tools/tuner" element={<Tuner />} />
          <Route path="/tools/metronome" element={<Metronome />} />
          <Route path="/tools/chords" element={<ChordLibrary />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="*" element={<Library />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </motion.div>
  )
}

export default function App() {
  useEffect(() => {
    void seedSamples()
    initNative()
    finishBoot(preloadPages)
  }, [])
  return (
    <HashRouter>
      <ThemeSync />
      <div className="app-atmosphere" />
      <div className="app-grain" />
      <Shell>
        <AnimatedRoutes />
      </Shell>
      <ImportDialog />
      <CommandPalette />
      <GlobalDrop />
      <Toaster />
      <ConfirmHost />
    </HashRouter>
  )
}
