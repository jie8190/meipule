// AI 扒谱任务：放在页面之外，离开「AI 扒谱」页任务照常进行，回来时图片、进度和结果都还在
import { create } from 'zustand'
// ai.ts 带着 Anthropic SDK，体积大：只在真正扒谱、读图时才加载，不进启动包
import type { AiPhase, AiSource } from '@/lib/ai'
const ai = () => import('@/lib/ai')
import { buildPrompt, formatSongJson, pageInstructions, parseLenient, type TranscribeMode } from '@/lib/notation/spec'
import { mergePages, songHeader } from '@/lib/notation/merge'
import { analyzeImport } from '@/lib/importer'
import type { SongDoc } from '@/lib/notation/types'
import type { AiSettings } from './settings'
import { toast } from '@/components/ui'

/** 结果、文字谱和选项存在本地，App 被系统杀掉也不丢（图片太大，只放在内存里） */
const DRAFT_KEY = 'meipule:ai-draft'

interface Draft {
  result: string
  text: string
  mode: TranscribeMode
  extra: string
}

function loadDraft(): Draft {
  const empty: Draft = { result: '', text: '', mode: 'auto', extra: '' }
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>) }
  } catch {
    return empty
  }
}

export interface AiJobState extends Draft {
  sources: AiSource[]
  loadingImages: boolean
  running: boolean
  phase: AiPhase
  thinking: string
  timing: { start: number; firstText?: number; end?: number } | null
  error: string | null
  /** 分页扒谱的进度 */
  pages: { done: number; total: number } | null
  /** 扒完时用户不在 AI 扒谱页：在别的页面提示一下 */
  unseen: boolean
  set: (patch: Partial<AiJobState>) => void
}

export const useAiJob = create<AiJobState>()((set) => ({
  ...loadDraft(),
  sources: [],
  loadingImages: false,
  running: false,
  phase: 'connecting',
  thinking: '',
  timing: null,
  error: null,
  pages: null,
  unseen: false,
  set: (patch) => set(patch),
}))

useAiJob.subscribe((s, prev) => {
  if (s.result === prev.result && s.text === prev.text && s.mode === prev.mode && s.extra === prev.extra) return
  const draft: Draft = { result: s.result, text: s.text, mode: s.mode, extra: s.extra }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* 存不下就算了，至少内存里还有 */
  }
})

const get = () => useAiJob.getState()
const patch = (p: Partial<AiJobState>) => useAiJob.setState(p)
const onAiPage = () => location.hash.startsWith('#/ai')

let controller: AbortController | null = null

export function stopAiJob() {
  controller?.abort()
}

/** 保存到曲库之后清空，准备扒下一首 */
export function resetAiJob() {
  patch({ sources: [], text: '', extra: '', result: '', error: null, timing: null, pages: null, thinking: '', unseen: false })
}

export async function addAiFiles(files: File[]) {
  const imgs = files.filter((f) => f.type.startsWith('image/'))
  if (!imgs.length) return
  patch({ loadingImages: true })
  try {
    const loaded: AiSource[] = []
    const { loadSource } = await ai()
    for (const f of imgs) loaded.push(await loadSource(f))
    // 接口一般限制单次 100 张以内：一张图切出来的段数留些余量；多张图会分页扒，总数可以多一些
    if (loaded.some((s) => s.parts.length > 60)) toast.warn('有截图太长了（切出来超过 60 段），请分成几张截图再上传')
    let total = 0
    const next = [...get().sources, ...loaded.filter((s) => s.parts.length <= 60)]
    const kept = next.filter((s) => (total += s.parts.length) <= 200)
    if (kept.length < next.length) toast.warn('图片太多了，多出的已忽略，可以分几次扒')
    patch({ sources: kept })
    const sliced = loaded.filter((s) => s.parts.length > 1)
    if (sliced.length) toast.info(`长截图已自动切成 ${sliced.reduce((a, s) => a + s.parts.length, 0)} 段，保证小字清晰`)
  } catch (e) {
    toast.err((e as Error).message)
  } finally {
    patch({ loadingImages: false })
  }
}

/** 页数多时一次发给模型，它往往只读个大概就放弃了：改成一页一页扒，再拼起来 */
export function isPageMode(sources: AiSource[]) {
  const parts = sources.reduce((a, s) => a + s.parts.length, 0)
  return sources.length >= 3 || (sources.length === 2 && parts > 12)
}


/**
 * 开始扒谱。customPrompt 用于「让 AI 修正问题」「修复 JSON」：withImages 时连同原图一起发。
 */
export async function runAiJob(settings: AiSettings, customPrompt?: string, withImages = false) {
  if (get().running) return
  const { sources } = get()
  const parts = sources.flatMap((s) => s.parts)
  patch({ error: null, running: true, result: '', thinking: '', phase: 'connecting', pages: null, timing: { start: Date.now() }, unseen: false })
  const ctrl = new AbortController()
  controller = ctrl
  let title = ''
  let ok = false
  let pageCount = 0
  try {
    const { transcribe, describeSources } = await ai()
    if (!customPrompt && isPageMode(sources)) {
      pageCount = sources.length
      ;({ title, ok } = await runPages(settings, ctrl, transcribe, describeSources))
      return
    }
    let gotText = false
    const full = await transcribe({
      settings,
      prompt:
        customPrompt ??
        buildPrompt({ mode: get().mode, extra: get().extra, hasImages: sources.length > 0, text: get().text, imageGuide: describeSources(sources) }),
      images: customPrompt && !withImages ? [] : parts,
      signal: ctrl.signal,
      onPhase: (phase) => patch({ phase }),
      onThinking: (thinking) => patch({ thinking }),
      onText: (t) => {
        if (!gotText && t) {
          gotText = true
          const timing = get().timing
          if (timing) patch({ timing: { ...timing, firstText: Date.now() } })
        }
        patch({ result: t })
      },
    })
    const a = analyzeImport(full)
    // 解析成功就整理成干净的 JSON（去掉 ```json 围栏和多余的说明文字）
    patch({ result: a.kind === 'song' ? formatSongJson(a.doc) : full })
    if (a.kind === 'song') {
      title = a.score.title
      ok = true
    } else if (a.kind === 'error') patch({ error: 'AI 的输出不是有效的 JSON：' + a.message })
  } catch (e) {
    const msg = (e as Error).message
    if (msg !== '已取消') patch({ error: msg })
  } finally {
    const timing = get().timing
    patch({ running: false, timing: timing ? { ...timing, end: Date.now() } : null })
    controller = null
    // 用户在别的页面：提示一声，并在底部显示「扒好了」
    if (!ctrl.signal.aborted) {
      if (!onAiPage()) patch({ unseen: true })
      const what = pageCount ? `${pageCount} 页都扒好了：「${title}」` : `扒好了：「${title}」`
      if (ok) toast.ok(onAiPage() ? what : `AI ${what}，回到 AI 扒谱页查看`)
      else if (get().error && !onAiPage()) toast.err('AI 扒谱没有成功，回到 AI 扒谱页查看原因')
    }
  }
}

/** 分页扒谱：先扒第 1 页拿到全曲信息，其余页同时扒 3 页，扒完一页合并一页 */
type AiModule = Awaited<ReturnType<typeof ai>>

async function runPages(
  settings: AiSettings,
  ctrl: AbortController,
  transcribe: AiModule['transcribe'],
  describeSources: AiModule['describeSources'],
): Promise<{ title: string; ok: boolean }> {
  const { sources, mode, extra } = get()
  const total = sources.length
  const docs: (Partial<SongDoc> | null)[] = Array(total).fill(null)
  const failed: { page: number; msg: string }[] = []
  let done = 0
  patch({ pages: { done, total } })
  const promptOf = (k: number, header?: unknown) =>
    `${buildPrompt({ mode, extra, hasImages: true, imageGuide: describeSources([sources[k - 1]]) })}\n\n${pageInstructions(k, total, header)}`
  const one = async (k: number, header?: unknown): Promise<Partial<SongDoc> | null> => {
    let msg = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const full = await transcribe({
          settings,
          prompt: promptOf(k, header),
          images: sources[k - 1].parts,
          signal: ctrl.signal,
          onPhase: k === 1 ? (phase) => patch({ phase }) : undefined,
          onThinking: k === 1 ? (thinking) => patch({ thinking }) : undefined,
          onText: () => {},
        })
        const parsed = parseLenient(full)
        if (parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) return parsed.value as Partial<SongDoc>
        msg = parsed.error ?? 'AI 的输出不是 JSON'
      } catch (e) {
        if (ctrl.signal.aborted) throw new Error('已取消')
        msg = (e as Error).message
      }
    }
    failed.push({ page: k, msg })
    return null
  }
  const finishPage = () => {
    done++
    const okDocs = docs.filter((d): d is Partial<SongDoc> => !!d)
    patch({ pages: { done, total }, ...(okDocs.length ? { result: formatSongJson(mergePages(okDocs)) } : {}) })
  }
  docs[0] = await one(1)
  if (!docs[0]) throw new Error(`第 1 页没有扒成功：${failed[0]?.msg}`)
  const timing = get().timing
  if (timing) patch({ timing: { ...timing, firstText: Date.now() } })
  finishPage()
  const header = songHeader(docs[0])
  let next = 2
  const worker = async () => {
    while (next <= total) {
      const k = next++
      docs[k - 1] = await one(k, header)
      finishPage()
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const merged = mergePages(docs.filter((d): d is Partial<SongDoc> => !!d))
  patch({ result: formatSongJson(merged) })
  if (failed.length) {
    const list = failed.map((f) => f.page).sort((a, b) => a - b)
    patch({
      error: `第 ${list.join('、')} 页没有扒成功（${failed[0].msg}），其余 ${total - list.length} 页已经合并好了。可以把这几页单独再扒一次，在编辑器里补进去`,
    })
    return { title: merged.title, ok: false }
  }
  return { title: merged.title, ok: true }
}
