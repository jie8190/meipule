import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
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
import Library from './pages/Library'
import SongPage from './pages/SongPage'

const Editor = lazy(() => import('./pages/Editor'))
const AiPage = lazy(() => import('./pages/AiPage'))
const Setlists = lazy(() => import('./pages/Setlists'))
const SetlistDetail = lazy(() => import('./pages/SetlistDetail'))
const Tuner = lazy(() => import('./pages/Tuner'))
const Metronome = lazy(() => import('./pages/Metronome'))
const ChordLibrary = lazy(() => import('./pages/ChordLibrary'))
const ToolsHub = lazy(() => import('./pages/ToolsHub'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Docs = lazy(() => import('./pages/Docs'))

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
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
    </AnimatePresence>
  )
}

export default function App() {
  useEffect(() => {
    void seedSamples()
    initNative()
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
