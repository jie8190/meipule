import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Undo2, Redo2, Save, Play, Pause, Eye, PenLine, Download, Braces, Layers, Info, Check, CircleAlert, WandSparkles } from 'lucide-react'
import { createSong, db, updateSongDoc } from '@/lib/db'
import { compileSong } from '@/lib/notation/compile'
import { formatSongJson, parseLenient } from '@/lib/notation/spec'
import { newSongTemplate } from '@/lib/notation/presets'
import { takeDraft, downloadText, safeFileName } from '@/lib/importer'
import type { SongDoc } from '@/lib/notation/types'
import { player } from '@/lib/audio/player'
import { useSettings } from '@/store/settings'
import { ScoreView } from '@/components/score/ScoreView'
import { CodeEditor } from '@/components/CodeEditor'
import { DiagnosticsList } from '@/components/Diagnostics'
import { usePlayerStatus } from '@/components/PlayerDock'
import { ChordModal } from '@/components/ChordModal'
import { Button, cn, IconButton, Segmented, toast } from '@/components/ui'
import { useKeyboardOpen } from '@/lib/native'
import { useDocHistory } from './editor/useDocHistory'
import { MetaForm } from './editor/MetaForm'
import { PatternsEditor } from './editor/PatternsEditor'
import { SectionsEditor, type Sel } from './editor/SectionsEditor'

type Tab = 'struct' | 'json' | 'meta'

export default function Editor() {
  const { id = 'new' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const rec = useLiveQuery(() => (isNew ? undefined : db.songs.get(id)), [id])
  const h = useDocHistory(newSongTemplate())
  const { doc, set, undo, redo, reset } = h
  const [ready, setReady] = useState(false)
  const [savedJson, setSavedJson] = useState('')
  const [tab, setTab] = useState<Tab>('struct')
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const keyboard = useKeyboardOpen()
  const [sel, setSel] = useState<Sel | null>(null)
  const [chord, setChord] = useState<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const s = useSettings()
  const status = usePlayerStatus()

  // 初始化文档
  useEffect(() => {
    if (isNew) {
      if (loadedId.current === 'new') return
      loadedId.current = 'new'
      const draft = params.get('draft') ? takeDraft() : null
      const d = draft ?? newSongTemplate()
      reset(d)
      setSavedJson(draft ? '' : JSON.stringify(d))
      setReady(true)
      return
    }
    if (rec && loadedId.current !== rec.id) {
      loadedId.current = rec.id
      reset(rec.doc)
      setSavedJson(JSON.stringify(rec.doc))
      setReady(true)
    }
  }, [isNew, rec, params, reset])

  const score = useMemo(() => compileSong(doc), [doc])
  const dirty = ready && JSON.stringify(doc) !== savedJson
  const errors = score.diagnostics.filter((d) => d.level === 'error').length
  const warnings = score.diagnostics.filter((d) => d.level === 'warning').length

  useEffect(() => {
    player.load(score, null)
  }, [score])
  useEffect(() => () => player.stop(), [])
  useEffect(() => {
    player.setOptions({ guitar: s.playGuitar, melody: s.playMelody, metronome: s.metronome, countIn: false, speed: 1 })
  }, [s.playGuitar, s.playMelody, s.metronome])

  const save = useCallback(async () => {
    if (isNew) {
      const newId = await createSong(doc, 'manual')
      setSavedJson(JSON.stringify(doc))
      loadedId.current = newId
      toast.ok('已保存到曲库', { label: '查看', onClick: () => navigate(`/song/${newId}`) })
      navigate(`/edit/${newId}`, { replace: true })
    } else {
      await updateSongDoc(id, doc)
      setSavedJson(JSON.stringify(doc))
      toast.ok('已保存')
    }
  }, [doc, id, isNew, navigate])

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
        return
      }
      const inField = (e.target as HTMLElement).closest('input, textarea, .cm-editor, select')
      if (inField) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.code === 'Space') {
        e.preventDefault()
        player.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, undo, redo])

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // 预览中点小节 → 选中编辑
  const onPreviewSelect = (range: [number, number] | null) => {
    if (!range) return setSel(null)
    const m = score.measures[range[0]]
    if (!m) return
    setSel({ s: m.section, m: m.indexInSection })
    setTab('struct')
    setPane('edit')
  }
  const previewSel: [number, number] | null = useMemo(() => {
    if (!sel) return null
    const sec = score.sections.find((x) => x.index === sel.s)
    if (!sec || sec.kind !== 'tab') return null
    const gi = sec.measures[sel.m]
    return gi === undefined ? null : [gi, gi]
  }, [sel, score])

  const opts = useMemo(
    () => ({ scale: Math.min(s.scale, 1.1), showTab: s.showTab, showDiagrams: s.showDiagrams, showChordNames: true, showMelody: s.showMelody, showLyrics: s.showLyrics }),
    [s.scale, s.showTab, s.showDiagrams, s.showMelody, s.showLyrics],
  )
  const previewScroll = useRef<HTMLDivElement>(null)

  if (!ready) return null

  return (
    <div className="flex h-dvh flex-col">
      <header className="glass relative z-20 flex h-[calc(60px+var(--sat))] shrink-0 items-center gap-2 border-b border-line px-2 pt-[var(--sat)] sm:px-4">
        <IconButton label="返回" onClick={() => (isNew ? navigate('/') : navigate(`/song/${id}`))}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{doc.title || '未命名曲谱'}</div>
          <div className="flex items-center gap-1.5 text-xs text-fg-3">
            {dirty ? (
              <>
                <span className="size-1.5 rounded-full bg-warn" /> 未保存
              </>
            ) : (
              <>
                <Check className="size-3 text-ok" /> 已保存
              </>
            )}
            {(errors > 0 || warnings > 0) && (
              <span className={cn('ml-2 flex items-center gap-1', errors ? 'text-err' : 'text-warn')}>
                <CircleAlert className="size-3" />
                {errors ? `${errors} 个错误` : `${warnings} 个提示`}
              </span>
            )}
          </div>
        </div>
        <IconButton label="撤销 (Ctrl+Z)" disabled={!h.canUndo} onClick={undo}>
          <Undo2 className="size-[18px]" />
        </IconButton>
        <IconButton label="重做 (Ctrl+Shift+Z)" disabled={!h.canRedo} onClick={redo}>
          <Redo2 className="size-[18px]" />
        </IconButton>
        <IconButton label="导出 JSON" className="hidden sm:inline-flex" onClick={() => downloadText(`${safeFileName(doc.title || 'song')}.json`, formatSongJson(doc))}>
          <Download className="size-[18px]" />
        </IconButton>
        <Button variant="primary" size="sm" icon={<Save className="size-4" />} onClick={save} disabled={!dirty && !isNew}>
          保存
        </Button>
      </header>

      {/* 手机上打字时键盘占掉半屏，先收起编辑/预览切换，把高度留给输入框 */}
      <div className={cn('flex shrink-0 justify-center border-b border-line py-2 lg:hidden', keyboard && 'hidden')}>
        <Segmented
          size="sm"
          value={pane}
          onChange={setPane}
          options={[
            { value: 'edit', label: <span className="flex items-center gap-1.5"><PenLine className="size-3.5" />编辑</span> },
            { value: 'preview', label: <span className="flex items-center gap-1.5"><Eye className="size-3.5" />预览</span> },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 编辑区 */}
        <div className={cn('flex min-w-0 flex-col border-r border-line lg:flex lg:w-[min(560px,45vw)] lg:shrink-0', pane === 'edit' ? 'flex w-full' : 'hidden')}>
          <div className="flex items-center gap-2 px-4 pt-3">
            <Segmented
              value={tab}
              onChange={setTab}
              className="w-full"
              options={[
                { value: 'struct', label: <span className="flex items-center justify-center gap-1.5"><Layers className="size-3.5" />结构</span> },
                { value: 'meta', label: <span className="flex items-center justify-center gap-1.5"><Info className="size-3.5" />信息</span> },
                { value: 'json', label: <span className="flex items-center justify-center gap-1.5"><Braces className="size-3.5" />JSON</span> },
              ]}
            />
          </div>
          {tab === 'json' ? (
            <JsonPane doc={doc} onDoc={(d) => set(d, 'json')} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
              {tab === 'meta' ? (
                <MetaForm doc={doc} set={set} />
              ) : (
                <div className="space-y-6">
                  <section>
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold">节奏型</h3>
                      <span className="text-[11px] text-fg-3">T=低音 · 数字=弦 · D/U 扫弦 · X 切音 · - 延音</span>
                    </div>
                    <PatternsEditor doc={doc} set={set} />
                  </section>
                  <section>
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold">段落与小节</h3>
                      <span className="text-[11px] text-fg-3">点击小节进行编辑 · 预览里点小节也能定位</span>
                    </div>
                    <SectionsEditor doc={doc} set={set} score={score} sel={sel} setSel={setSel} />
                  </section>
                  <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                    <WandSparkles className="size-5 shrink-0 text-ai-1" />
                    <div className="flex-1 text-[13px] text-fg-2">懒得手写？把谱子截图交给 AI，几十秒得到完整 JSON。</div>
                    <Button size="sm" variant="ai" onClick={() => navigate('/ai')}>
                      AI 扒谱
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 预览区 */}
        <div className={cn('relative min-w-0 flex-1 flex-col lg:flex', pane === 'preview' ? 'flex' : 'hidden')}>
          <div ref={previewScroll} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1100px] px-3 pb-32 pt-5 sm:px-6">
              {score.diagnostics.length > 0 && (
                <details className="mb-4 rounded-2xl border border-line bg-surface p-3">
                  <summary className="cursor-pointer select-none text-[13px] font-medium text-fg-2">
                    格式检查：{errors} 个错误，{warnings} 个提示
                  </summary>
                  <DiagnosticsList diags={score.diagnostics} className="mt-3" max={20} />
                </details>
              )}
              <div className="mb-4 px-1">
                <div className="text-2xl font-bold tracking-tight">{score.title}</div>
                <div className="mt-0.5 text-sm text-fg-3">
                  {[score.artist, score.originalKey && `原调 ${score.originalKey}`, score.originalCapo ? `Capo ${score.originalCapo}` : '', `${score.tempo} BPM`, `${score.timeNum}/${score.timeDen}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div data-score={s.scorePaper ? 'paper' : undefined} className="score-paper rounded-[24px] pb-8 pt-6 ring-1 ring-line">
                <ScoreView score={score} opts={opts} scrollRef={previewScroll} selection={previewSel} onSelect={onPreviewSelect} onSeek={(m) => player.seekMeasure(m)} onChordClick={setChord} pad={22} />
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
            <button
              onClick={() => player.toggle()}
              disabled={!score.measures.length}
              className="glass pointer-events-auto flex h-12 items-center gap-2.5 rounded-full border border-line-2 pl-2 pr-5 text-sm font-semibold shadow-[var(--shadow-lg)] transition active:scale-95 disabled:opacity-40"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-accent-gradient text-accent-fg">
                {status === 'playing' ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
              </span>
              {status === 'playing' ? '暂停试听' : '试听'}
            </button>
          </div>
        </div>
      </div>
      <ChordModal name={chord} onClose={() => setChord(null)} tuning={score.tuning} capo={score.capo} />
    </div>
  )
}

function JsonPane({ doc, onDoc }: { doc: SongDoc; onDoc: (d: SongDoc) => void }) {
  const [text, setText] = useState(() => formatSongJson(doc))
  const [err, setErr] = useState<string | null>(null)
  const lastApplied = useRef(JSON.stringify(doc))

  // 文档从外部变化（撤销等）时刷新文本
  useEffect(() => {
    const j = JSON.stringify(doc)
    if (j !== lastApplied.current) {
      lastApplied.current = j
      setText(formatSongJson(doc))
      setErr(null)
    }
  }, [doc])

  useEffect(() => {
    const t = setTimeout(() => {
      const { value, error } = parseLenient(text)
      if (error) return setErr(error)
      if (!value || typeof value !== 'object' || Array.isArray(value)) return setErr('顶层必须是对象')
      setErr(null)
      const j = JSON.stringify(value)
      if (j !== lastApplied.current) {
        lastApplied.current = j
        onDoc(value as SongDoc)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [text, onDoc])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-[color-mix(in_oklab,var(--fg)_2%,transparent)]">
        <CodeEditor value={text} onChange={setText} className="min-h-0 flex-1 overflow-hidden" />
      </div>
      <div className="mx-4 mb-4 mt-2 flex items-center justify-between gap-3 text-xs">
        {err ? <span className="text-err">{err}</span> : <span className="text-fg-3">编辑后自动应用到预览 · 格式说明见「格式文档」</span>}
        <button className="shrink-0 text-fg-2 hover:text-fg" onClick={() => setText(formatSongJson(doc))}>
          重新格式化
        </button>
      </div>
    </div>
  )
}
