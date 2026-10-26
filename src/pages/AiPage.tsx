import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { WandSparkles, ImagePlus, X, Copy, Check, KeyRound, Square, Save, PenLine, Eye, EyeOff, Bot, ExternalLink, RefreshCw, ClipboardPaste, Loader2 } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { buildPrompt, formatSongJson, type TranscribeMode } from '@/lib/notation/spec'
import { analyzeImport, stashDraft } from '@/lib/importer'
import { createSong } from '@/lib/db'
import { describeSources, loadSource, transcribe, type AiPhase, type AiSource } from '@/lib/ai'
import { AiSettingsModal } from '@/components/AiSettingsModal'
import { isTouch } from '@/lib/native'
import { CodeEditor } from '@/components/CodeEditor'
import { DiagnosticsList, ScoreSummary } from '@/components/Diagnostics'
import { ScoreView } from '@/components/score/ScoreView'
import { Button, cn, Field, Input, Segmented, Textarea, toast } from '@/components/ui'

const DRAFT_KEY = 'meipule:ai-result'

const AI_SITES = [
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Kimi', url: 'https://kimi.com/' },
  { name: '豆包', url: 'https://www.doubao.com/chat/' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { name: '通义', url: 'https://tongyi.aliyun.com/' },
]

export default function AiPage() {
  const navigate = useNavigate()
  const ai = useSettings((s) => s.ai)
  const pending = useUi((s) => s.pendingImages)
  const setPending = useUi((s) => s.setPendingImages)
  const [sources, setSources] = useState<AiSource[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const parts = useMemo(() => sources.flatMap((s) => s.parts), [sources])
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TranscribeMode>('auto')
  const [extra, setExtra] = useState('')
  const [copied, setCopied] = useState(false)
  const [result, setResult] = useState(() => sessionStorage.getItem(DRAFT_KEY) ?? '')
  const [debounced, setDebounced] = useState(result)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<AiPhase>('connecting')
  const [thinking, setThinking] = useState('')
  const [timing, setTiming] = useState<{ start: number; firstText?: number; end?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setLoadingImages(true)
    try {
      const loaded: AiSource[] = []
      for (const f of imgs) loaded.push(await loadSource(f))
      setSources((cur) => {
        const next = [...cur, ...loaded]
        // 接口一般限制单次 100 张以内，留些余量
        let total = 0
        const kept = next.filter((s) => (total += s.parts.length) <= 60)
        if (kept.length < next.length) toast.warn('图片太多了，一次最多约 60 段，多出的已忽略')
        return kept
      })
      const sliced = loaded.filter((s) => s.parts.length > 1)
      if (sliced.length) toast.info(`长截图已自动切成 ${sliced.reduce((a, s) => a + s.parts.length, 0)} 段，保证小字清晰`)
    } catch (e) {
      toast.err((e as Error).message)
    } finally {
      setLoadingImages(false)
    }
  }

  useEffect(() => {
    if (pending.length) {
      void addFiles(pending)
      setPending([])
    }
  }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  // 支持直接粘贴截图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, result)
    const t = setTimeout(() => setDebounced(result), running ? 900 : 250)
    return () => clearTimeout(t)
  }, [result, running])

  const analysis = useMemo(() => analyzeImport(debounced), [debounced])
  // 复制给聊天 AI 时用户上传的是原图，所以不带切片说明；直连时发的是切片
  const prompt = useMemo(() => buildPrompt({ mode, extra, hasImages: sources.length > 0, text }), [mode, extra, sources.length, text])
  const directPrompt = useMemo(() => buildPrompt({ mode, extra, hasImages: sources.length > 0, text, imageGuide: describeSources(sources) }), [mode, extra, sources, text])
  const hasKey = !!ai.apiKey.trim()
  const ready = (sources.length > 0 || text.trim().length > 0) && !loadingImages

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.ok(sources.length ? '提示词已复制，记得把图片一起发给 AI' : '提示词已复制')
    } catch {
      toast.err('复制失败，请手动选择复制')
    }
  }

  const run = async (customPrompt?: string, withImages = false) => {
    if (!hasKey) return setKeyOpen(true)
    setError(null)
    setRunning(true)
    setResult('')
    setThinking('')
    setPhase('connecting')
    setTiming({ start: Date.now() })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let gotText = false
    try {
      const full = await transcribe({
        settings: ai,
        prompt: customPrompt ?? directPrompt,
        images: customPrompt && !withImages ? [] : parts,
        signal: ctrl.signal,
        onPhase: setPhase,
        onThinking: setThinking,
        onText: (t) => {
          if (!gotText && t) {
            gotText = true
            setTiming((x) => (x ? { ...x, firstText: Date.now() } : x))
          }
          setResult(t)
        },
      })
      const a = analyzeImport(full)
      // 解析成功就整理成干净的 JSON（去掉 ```json 围栏和多余的说明文字）
      setResult(a.kind === 'song' ? formatSongJson(a.doc) : full)
      if (a.kind === 'song') toast.ok(`扒好了：「${a.score.title}」`)
      else if (a.kind === 'error') setError('AI 的输出不是有效的 JSON：' + a.message)
    } catch (e) {
      const msg = (e as Error).message
      if (msg !== '已取消') setError(msg)
    } finally {
      setRunning(false)
      setTiming((x) => (x ? { ...x, end: Date.now() } : x))
      abortRef.current = null
    }
  }

  const fixWithAi = () => {
    if (analysis.kind !== 'song') return
    const issues = analysis.score.diagnostics.map((d) => `- ${d.where}：${d.message}`).join('\n')
    // 带上原图，让模型对照原谱重新核对，而不是凭空猜
    const p = `${buildPrompt({ mode, hasImages: parts.length > 0, extra, imageGuide: describeSources(sources) })}

## 需要修正的 JSON
下面是上一次转写的结果，程序校验发现了这些问题：
${issues}

请对照${parts.length ? '图片中的原谱' : '原谱'}逐一核对并修正这些问题，然后输出完整 JSON（不要省略任何段落）：
\`\`\`json
${formatSongJson(analysis.doc)}
\`\`\``
    void run(p, true)
  }

  /** 输出不是合法 JSON 时：把原文和报错发回去，只修语法、不改内容 */
  const repairJson = () => {
    if (analysis.kind !== 'error') return
    const p = `下面这段内容本应是一个「没谱了」曲谱 JSON，但解析失败：${analysis.message}

请只修正 JSON 语法（引号、逗号、括号、转义等），不要改动其中的曲谱内容，输出修正后的完整 JSON，放在 \`\`\`json 代码块中：

${result}`
    void run(p)
  }

  const save = async () => {
    if (analysis.kind === 'song') {
      const id = await createSong(analysis.doc, 'ai')
      toast.ok(`已保存「${analysis.score.title}」`)
      sessionStorage.removeItem(DRAFT_KEY)
      navigate(`/song/${id}`)
    } else if (analysis.kind === 'songs') {
      for (const d of analysis.docs) await createSong(d, 'ai')
      toast.ok(`已保存 ${analysis.docs.length} 首`)
      navigate('/')
    }
  }

  const previewOpts = useMemo(() => ({ scale: 0.85, showTab: true, showDiagrams: true, showChordNames: true, showMelody: true, showLyrics: true }), [])

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <header className="relative">
        <div className="pointer-events-none absolute -left-32 -top-40 -z-10 size-[30rem] bg-[radial-gradient(closest-side,var(--ai-1),transparent)] opacity-25" />
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--ai-1)_14%,transparent)] px-3 py-1 text-xs font-semibold text-ai-1">
          <WandSparkles className="size-3.5" /> AI 扒谱工作台
        </div>
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[42px]">
          把任何吉他谱，变成<span className="text-gradient-ai">会动的谱</span>
        </h1>
        <p className="mt-2 hidden max-w-2xl text-sm leading-relaxed text-fg-2 sm:block">
          上传曲谱截图或粘贴文字谱，AI 会按「没谱了」的参数化格式转写成 JSON：识别和弦、节奏型、简谱旋律和歌词。可以复制提示词到任意 AI 使用，也可以填上 API Key 一键直连。
        </p>
        <div className="mt-5 hidden flex-wrap items-center gap-2 text-[13px] sm:flex">
          {['准备素材', '交给 AI', '校对并保存'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={cn('flex size-6 items-center justify-center rounded-full text-xs font-bold', i === 0 && ready ? 'bg-ok text-black' : i === 2 && analysis.kind === 'song' ? 'bg-ok text-black' : 'bg-[color-mix(in_oklab,var(--fg)_10%,transparent)] text-fg-2')}>
                {(i === 0 && ready) || (i === 2 && analysis.kind === 'song') ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="text-fg-2">{s}</span>
              {i < 2 && <span className="mx-1 h-px w-8 bg-line-2" />}
            </div>
          ))}
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* 左：输入 */}
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">1 · 曲谱素材</h2>
            <div
              data-dropzone
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                void addFiles([...e.dataTransfer.files])
              }}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition',
                dragOver ? 'border-ai-1 bg-[color-mix(in_oklab,var(--ai-1)_8%,transparent)]' : 'border-line-2 hover:border-line-3 hover:bg-[color-mix(in_oklab,var(--fg)_2%,transparent)]',
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--ai-1)_14%,transparent)] text-ai-1">
                <ImagePlus className="size-5" />
              </span>
              <div className="text-sm font-medium">{isTouch ? '点这里选择曲谱截图或拍照' : '拖入、粘贴（Ctrl+V）或点击选择曲谱图片'}</div>
              <div className="text-xs text-fg-3">支持多张（多页按顺序上传）；长截图会自动切段</div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </div>
            <AnimatePresence>
              {(sources.length > 0 || loadingImages) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {sources.map((src, i) => (
                    <motion.div key={src.preview.slice(-40) + i} layout initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="group relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-line">
                      <img src={src.preview} alt={src.name} className="size-full object-cover object-top" />
                      <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                      {src.parts.length > 1 && (
                        <span className="absolute inset-x-1 bottom-1 truncate rounded-md bg-black/65 px-1.5 py-0.5 text-center text-[10px] font-medium text-white" title={`${src.width}×${src.height}`}>
                          长图 · 切成 {src.parts.length} 段
                        </span>
                      )}
                      <button
                        aria-label="移除"
                        onClick={() => setSources(sources.filter((_, j) => j !== i))}
                        className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </motion.div>
                  ))}
                  {loadingImages && (
                    <div className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] text-fg-3 ring-1 ring-line">
                      <Loader2 className="size-4 animate-spin" />
                      处理中
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <Textarea
              className="mt-3 font-mono text-[12.5px]"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'也可以粘贴文字谱，例如：\n[C]好一朵美丽的[Am]茉莉花\ne|---0---1---|\nB|-1---1---1-|'}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
              <Field label="曲谱类型" group>
                <Segmented
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'auto', label: '自动' },
                    { value: 'strum', label: '弹唱' },
                    { value: 'finger', label: '指弹' },
                    { value: 'chords', label: '和弦谱' },
                  ]}
                />
              </Field>
              <Field label="补充说明（可选）">
                <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="如：原调 A 夹 2；只扒 G1 这一轨" />
              </Field>
            </div>
          </section>

          <section className="card relative overflow-hidden p-5">
            <h2 className="text-[15px] font-semibold">2 · 交给 AI</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface-2 p-4">
                <div className="text-sm font-semibold">方式一：复制提示词</div>
                <p className="mt-1 text-xs leading-relaxed text-fg-3">粘贴到任意 AI 对话框{sources.length ? '，并附上图片' : ''}，把它返回的 JSON 贴到「3 · AI 返回的 JSON」里。</p>
                <Button className="mt-3 w-full" variant="secondary" icon={copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />} onClick={copyPrompt}>
                  {copied ? '已复制' : '复制提示词'}
                </Button>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {AI_SITES.map((s) => (
                    <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg">
                      {s.name}
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
              <div className="ai-border rounded-2xl bg-surface-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">方式二：一键直连</div>
                  <button onClick={() => setKeyOpen(true)} className="flex items-center gap-1 text-[11px] text-fg-3 hover:text-fg">
                    <KeyRound className="size-3" />
                    {hasKey ? '设置' : '未配置'}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-fg-3">
                  {hasKey ? `${ai.provider === 'anthropic' ? 'Claude' : 'OpenAI 兼容'} · ${ai.model}` : '填写 API Key 后，在这里直接扒谱，结果实时流式输出。'}
                </p>
                {running ? (
                  <Button className="mt-3 w-full" variant="danger" icon={<Square className="size-3.5 fill-current" />} onClick={() => abortRef.current?.abort()}>
                    停止
                  </Button>
                ) : (
                  <Button className="mt-3 w-full" variant="ai" icon={<WandSparkles className="size-4" />} disabled={hasKey && !ready} onClick={() => run()}>
                    {hasKey ? '开始扒谱' : '配置 API Key'}
                  </Button>
                )}
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer select-none text-xs text-fg-3 hover:text-fg-2">查看完整提示词（{prompt.length} 字）</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] p-3 font-mono text-[11px] leading-relaxed text-fg-2">{prompt}</pre>
            </details>
          </section>
        </div>

        {/* 右：结果 */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className={cn('card relative overflow-hidden p-5', running && 'ai-border')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">3 · AI 返回的 JSON</h2>
              <div className="flex items-center gap-2">
                {!running && timing?.end && result && (
                  <span className="text-xs text-fg-3">
                    用时 {fmtDuration(timing.end - timing.start)} · {result.length.toLocaleString()} 字
                  </span>
                )}
                {!running && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ClipboardPaste className="size-3.5" />}
                    onClick={async () => {
                      try {
                        setResult(await navigator.clipboard.readText())
                      } catch {
                        toast.err('无法读取剪贴板，请直接粘贴到编辑框')
                      }
                    }}
                  >
                    粘贴
                  </Button>
                )}
              </div>
            </div>
            {running && timing && (
              <AiProgress
                phase={phase}
                startedAt={timing.start}
                firstTextAt={timing.firstText}
                thinking={thinking}
                chars={result.length}
                imageCount={parts.length}
                imageBytes={parts.reduce((a, i) => a + i.data.length * 0.75, 0)}
                host={aiHost(ai.provider, ai.baseUrl)}
                directClaude={ai.provider === 'anthropic' && !ai.baseUrl.trim()}
                onStop={() => abortRef.current?.abort()}
              />
            )}
            <div className="relative mt-3 h-[340px] overflow-hidden rounded-2xl border border-line bg-[color-mix(in_oklab,var(--fg)_2%,transparent)]">
              {running && <div className="shimmer pointer-events-none absolute inset-0 z-10" />}
              <CodeEditor value={result} onChange={setResult} className="h-full" />
              {!result && !running && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-fg-3">
                  <Bot className="size-7" />
                  把 AI 的回复粘贴到这里
                  <span className="text-xs">（带 ```json 代码块也没关系）</span>
                </div>
              )}
            </div>
            {error && <div className="mt-3 rounded-xl bg-[color-mix(in_oklab,var(--err)_10%,transparent)] px-3 py-2.5 text-[13px] text-err">{error}</div>}
            {analysis.kind === 'error' && !running && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-3 py-2.5 text-[13px] text-warn">
                <span className="min-w-0 flex-1">{analysis.message}</span>
                {hasKey && result.trim() && (
                  <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={repairJson}>
                    让 AI 修复 JSON
                  </Button>
                )}
              </div>
            )}
            {analysis.kind === 'song' && (
              <div className="mt-4 space-y-3">
                <ScoreSummary score={analysis.score} />
                <DiagnosticsList diags={analysis.score.diagnostics} max={4} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" icon={<Save className="size-4" />} onClick={save} disabled={running}>
                    保存到曲库
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<PenLine className="size-4" />}
                    disabled={running}
                    onClick={() => {
                      stashDraft(analysis.doc)
                      navigate('/edit/new?draft=1')
                    }}
                  >
                    在编辑器中校对
                  </Button>
                  {hasKey && analysis.score.diagnostics.some((d) => d.level !== 'info') && (
                    <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={fixWithAi} disabled={running}>
                      让 AI 修正问题
                    </Button>
                  )}
                  <button onClick={() => setShowPreview(!showPreview)} className="ml-auto flex items-center gap-1 text-xs text-fg-3 hover:text-fg-2">
                    {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {showPreview ? '收起预览' : '预览'}
                  </button>
                </div>
              </div>
            )}
            {analysis.kind === 'songs' && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm">识别到 {analysis.docs.length} 首曲谱</span>
                <Button variant="primary" onClick={save}>
                  全部保存
                </Button>
              </div>
            )}
          </section>
          {analysis.kind === 'song' && showPreview && analysis.score.sections.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="score-paper overflow-hidden rounded-[24px] pb-6 pt-5 ring-1 ring-line">
              <ScoreView score={analysis.score} opts={previewOpts} pad={18} />
            </motion.section>
          )}
        </div>
      </div>

      <AiSettingsModal open={keyOpen} onClose={() => setKeyOpen(false)} />
    </div>
  )
}

function fmtDuration(ms: number) {
  const sec = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

function aiHost(provider: string, baseUrl: string) {
  try {
    return new URL(baseUrl.trim() || (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com')).host
  } catch {
    return baseUrl
  }
}

const PHASES: { key: AiPhase; label: string }[] = [
  { key: 'connecting', label: '上传连接' },
  { key: 'waiting', label: '读图' },
  { key: 'thinking', label: '思考' },
  { key: 'writing', label: '输出 JSON' },
]

/** 扒谱进度：阶段、计时、思考摘要、输出速度；连不上时给出网络提示 */
function AiProgress({
  phase,
  startedAt,
  firstTextAt,
  thinking,
  chars,
  imageCount,
  imageBytes,
  host,
  directClaude,
  onStop,
}: {
  phase: AiPhase
  startedAt: number
  firstTextAt?: number
  thinking: string
  chars: number
  imageCount: number
  imageBytes: number
  host: string
  directClaude: boolean
  onStop: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const thinkRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    thinkRef.current?.scrollTo({ top: thinkRef.current.scrollHeight })
  }, [thinking])
  const elapsed = now - startedAt
  const idx = PHASES.findIndex((p) => p.key === phase)
  const speed = firstTextAt && chars > 0 ? Math.round(chars / Math.max(1, (now - firstTextAt) / 1000)) : 0
  const slowConnect = phase === 'connecting' && elapsed > 20_000

  let line: string
  if (phase === 'connecting') line = imageCount ? `正在上传 ${imageCount} 张图片（${(imageBytes / 1024 / 1024).toFixed(1)} MB）并连接 ${host}…` : `正在连接 ${host}…`
  else if (phase === 'waiting') line = '已连接，模型正在读图（图片多时需要一两分钟）…'
  else if (phase === 'thinking') line = '模型正在分析曲谱结构…'
  else line = `正在输出 JSON：${chars.toLocaleString()} 字${speed ? ` · 约 ${speed} 字/秒` : ''}`

  return (
    <div className="mt-3 rounded-2xl border border-[color-mix(in_oklab,var(--ai-1)_35%,transparent)] bg-[color-mix(in_oklab,var(--ai-1)_6%,transparent)] p-3">
      <div className="flex items-center gap-2">
        <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
          {PHASES.map((p, i) => (
            <div key={p.key} className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  'flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition',
                  i < idx && 'text-ok',
                  i === idx && 'bg-ai-gradient text-white',
                  i > idx && 'text-fg-3',
                )}
              >
                {i < idx ? <Check className="size-3" /> : i === idx ? <Loader2 className="size-3 animate-spin" /> : null}
                {p.label}
              </span>
              {i < PHASES.length - 1 && <span className="h-px w-2.5 bg-line-2" />}
            </div>
          ))}
        </div>
        <span className="font-mono text-xs tabular-nums text-fg-2">{fmtDuration(elapsed)}</span>
      </div>
      <div className="mt-2 text-[13px] text-fg">{line}</div>
      {slowConnect && (
        <div className="mt-2 rounded-xl bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-3 py-2 text-xs leading-relaxed text-warn">
          超过 20 秒还没连上。
          {directClaude ? '在国内直连 api.anthropic.com 通常不通，需要开代理或在 AI 设置里填中转地址。' : '请检查接口地址和网络。'}
          可以先在「AI 设置」里点「测试连接」确认。
        </div>
      )}
      {thinking && (
        <div ref={thinkRef} className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] px-3 py-2 text-xs leading-relaxed text-fg-2">
          {thinking}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <button onClick={onStop} className="flex items-center gap-1 text-xs text-fg-3 hover:text-err">
          <Square className="size-3 fill-current" /> 停止
        </button>
      </div>
    </div>
  )
}
