// AI 扒谱：Claude（官方 SDK）或任意 OpenAI 兼容接口，流式返回；附带连接测试、模型列表与试跑
import Anthropic from '@anthropic-ai/sdk'
import type { AiSettings } from '@/store/settings'
import { isNative, nativeGetJson, nativePost, nativePostJson } from './native'
import { applyLevels, findContent, inkMask, levelsOf, planStrips, verticalCrossings } from './image'

export interface AiImage {
  name: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  data: string // base64，不含 data: 前缀
  preview: string // dataURL，用于界面预览
}

/** 扒谱进度阶段：连接中 → 已连接等待模型 → 思考中 → 输出中 */
export type AiPhase = 'connecting' | 'waiting' | 'thinking' | 'writing'

export interface TranscribeOptions {
  settings: AiSettings
  prompt: string
  images: AiImage[]
  signal: AbortSignal
  onText: (full: string) => void
  onPhase?: (phase: AiPhase) => void
  /** 模型的思考摘要（Claude）或推理内容（部分 OpenAI 兼容模型），用来显示进度 */
  onThinking?: (full: string) => void
}

/** 支持服务端拒答兜底（fallbacks: "default"）的模型 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'])

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（推荐）' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1（最强）' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（更快）' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（最便宜）' },
]

export async function transcribe(opts: TranscribeOptions): Promise<string> {
  const { settings } = opts
  if (!settings.apiKey.trim()) throw new Error('请先在「AI 设置」里填写 API Key')
  if (settings.provider === 'anthropic') return viaClaude(opts)
  try {
    return await viaOpenAICompatible(opts)
  } catch (e) {
    if (e instanceof StreamBroken && e.fresh && !opts.signal?.aborted) return viaOpenAICompatible(opts)
    throw e
  }
}

function claudeClient(settings: AiSettings, timeout: number, maxRetries: number) {
  return new Anthropic({
    apiKey: settings.apiKey.trim(),
    baseURL: settings.baseUrl.trim() || undefined,
    dangerouslyAllowBrowser: true,
    // timeout 限制的是拿到响应头之前的等待；流开始后不受影响
    timeout,
    maxRetries,
  })
}

async function viaClaude({ settings, prompt, images, signal, onText, onPhase, onThinking }: TranscribeOptions): Promise<string> {
  // 网络不通时 2 分钟内报错，而不是默认的 10 分钟 × 3 次
  const client = claudeClient(settings, 120_000, 1)
  const model = settings.model.trim() || 'claude-opus-5-5'
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.Beta.BetaImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      }),
    ),
    { type: 'text', text: prompt },
  ]
  // 直连官方 API 时开启拒答兜底；走代理时不发，避免代理不认识该字段
  const useFallback = FALLBACK_MODELS.has(model) && !settings.baseUrl.trim()
  let full = ''
  let thinking = ''
  // compat = 老模型不支持 adaptive thinking / effort / fallbacks 时的兼容模式
  const run = (compat: boolean) => {
    onPhase?.('connecting')
    full = ''
    thinking = ''
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: compat ? 32000 : 64000,
        messages: [{ role: 'user', content }],
        ...(compat
          ? {}
          : {
              // 显示思考摘要：读图和推理可能要好几分钟，有摘要才看得出模型在干活
              thinking: { type: 'adaptive' as const, display: 'summarized' as const },
              output_config: { effort: settings.effort ?? 'high' },
              ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
            }),
      },
      { signal },
    )
    stream.on('connect', () => onPhase?.('waiting'))
    stream.on('streamEvent', (ev) => {
      if (ev.type !== 'content_block_start') return
      if (ev.content_block.type === 'thinking') onPhase?.('thinking')
      else if (ev.content_block.type === 'text') onPhase?.('writing')
    })
    stream.on('thinking', (delta) => {
      thinking += delta
      onThinking?.(thinking)
    })
    stream.on('text', (delta) => {
      full += delta
      onText(full)
    })
    return stream.finalMessage()
  }
  try {
    let msg: Anthropic.Beta.BetaMessage
    try {
      msg = await run(false)
    } catch (e) {
      if (!isCompatError(e)) throw e
      msg = await run(true)
    }
    if (msg.stop_reason === 'refusal') {
      throw new Error('模型拒绝了这次请求，请换一张图片或调整说明后重试')
    }
    if (msg.stop_reason === 'max_tokens') {
      throw new Error('输出太长被截断了，可以把曲谱分成几段分别扒')
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    return text || full
  } catch (e) {
    throw friendlyClaudeError(e, settings)
  }
}

/** 老模型或中转不认识新参数时返回的 400 */
function isCompatError(e: unknown) {
  return e instanceof Anthropic.BadRequestError && /effort|thinking|adaptive|display|fallback|output_config/i.test(e.message)
}

function friendlyClaudeError(e: unknown, settings: AiSettings): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('API Key 无效或已过期（401）')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('没有权限使用该模型（403）')
  if (e instanceof Anthropic.NotFoundError) return new Error('模型不存在，或接口地址不对（404）')
  if (e instanceof Anthropic.RateLimitError) return new Error('请求太频繁或额度不足，请稍后再试（429）')
  if (e instanceof Anthropic.BadRequestError) return new Error(`请求参数有误：${e.message}`)
  if (e instanceof Anthropic.APIUserAbortError) return new Error('已取消')
  if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIConnectionError) {
    return new Error(`连不上 ${claudeHost(settings)}。${settings.baseUrl.trim() ? '请检查代理/中转地址是否正确。' : '在国内直连 Anthropic 通常不通，需要开代理，或在设置里填写中转地址。'}`)
  }
  if (e instanceof Anthropic.APIError) return new Error(`API 错误 ${e.status ?? ''}：${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

function claudeHost(settings: AiSettings) {
  try {
    return new URL(settings.baseUrl.trim() || 'https://api.anthropic.com').host
  } catch {
    return settings.baseUrl.trim()
  }
}

function openaiBase(settings: AiSettings) {
  return (settings.baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

async function viaOpenAICompatible({ settings, prompt, images, signal, onText, onPhase, onThinking }: TranscribeOptions): Promise<string> {
  const url = `${openaiBase(settings)}/chat/completions`
  const content = images.length
    ? [
        // detail: high 让模型按原始清晰度看图，谱面上的小字才认得清
        ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}`, detail: 'high' } })),
        { type: 'text', text: prompt },
      ]
    : prompt
  // 始终用流式：服务端会立刻返回响应头再边想边写。不流式时要等整个结果生成完才有响应，
  // 大图、多页、高思考强度很容易超过网关（Cloudflare 等）的 100 秒限制，返回 524。
  // 思考强度：GPT-5 及以上、o 系列等推理模型支持 reasoning_effort；不支持的接口返回 400 时去掉重试
  const bodyOf = (withEffort: boolean) => ({
    model: settings.model.trim(),
    stream: true,
    messages: [{ role: 'user', content }],
    ...(withEffort && settings.effort ? { reasoning_effort: settings.effort } : {}),
  })
  const effortRejected = (status: number, text: string) => status === 400 && /reasoning|effort/i.test(text)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey.trim()}` }

  // 解析 SSE：data: {...} 行
  let full = ''
  let reasoning = ''
  let finish = ''
  const onLine = (line: string) => {
    const t = line.trim()
    if (!t.startsWith('data:')) return
    const data = t.slice(5).trim()
    if (data === '[DONE]') return
    try {
      const j = JSON.parse(data)
      if (j.error) throw new Error(`接口返回错误：${typeof j.error === 'string' ? j.error : (j.error.message ?? JSON.stringify(j.error)).slice(0, 300)}`)
      const fr = j.choices?.[0]?.finish_reason
      if (fr) finish = fr
      const d = j.choices?.[0]?.delta ?? j.choices?.[0]?.message
      // DeepSeek-R1、通义 QwQ 等推理模型会先输出 reasoning_content
      if (typeof d?.reasoning_content === 'string' && d.reasoning_content) {
        if (!reasoning) onPhase?.('thinking')
        reasoning += d.reasoning_content
        onThinking?.(reasoning)
      }
      if (typeof d?.content === 'string' && d.content) {
        if (!full) onPhase?.('writing')
        full += d.content
        onText(full)
      }
    } catch (e) {
      if ((e as Error).message.startsWith('接口返回错误')) throw e
      /* 忽略不完整的行 */
    }
  }
  const finishUp = () => {
    if (finish === 'length') throw new Error('输出太长被截断了（达到接口的输出长度上限），可以把曲谱分成几段分别扒')
    if (!full.trim()) throw new Error('接口没有返回任何内容，可能是模型不支持图片，或请求被网关拦截')
    return full
  }

  onPhase?.('connecting')
  // WebView / 浏览器里直接流式请求：能实时看到进度
  const post = (withEffort: boolean) => fetch(url, { method: 'POST', signal, headers, body: JSON.stringify(bodyOf(withEffort)) })
  let res: Response | null = null
  // 中转站偶尔会在上传大图时断开连接，失败了先原样重试一次
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    try {
      res = await post(true)
      if (res.status === 400 && settings.effort) {
        const text = await res.clone().text().catch(() => '')
        if (effortRejected(400, text)) res = await post(false)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) throw new Error('已取消')
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      // 安卓 App 里：接口不允许跨域时改走原生请求（见下）
      if (!isNative) throw new Error('无法连接到接口（可能是网络问题，或该服务不允许浏览器直接调用 / 跨域；安卓 App 里没有这个限制）')
    }
  }

  if (!res) {
    // 原生请求不受跨域限制，但拿不到流：仍然请求流式（网关立刻收到响应头，不会 524），完成后一次性解析
    onText('')
    onPhase?.('waiting')
    let r: { status: number; data: unknown }
    try {
      r = await nativePost(url, headers, bodyOf(true), signal)
      const errText = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
      if (effortRejected(r.status, errText)) r = await nativePost(url, headers, bodyOf(false), signal)
    } catch (e) {
      const msg = (e as Error).message
      throw new Error(msg === '已取消' ? msg : `无法连接到接口：${msg}`)
    }
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
    if (r.status >= 400) throw new Error(httpError(r.status, text))
    if (/^\s*data:/m.test(text)) text.split('\n').forEach(onLine)
    else {
      // 个别接口忽略 stream 参数，直接返回完整 JSON
      const data = (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as {
        choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[]
      }
      onLine(`data: ${JSON.stringify(data)}`)
    }
    return finishUp()
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(httpError(res.status, body))
  }
  onPhase?.('waiting')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      lines.forEach(onLine)
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError' || signal?.aborted) throw new Error('已取消')
    if ((e as Error).message.startsWith('接口返回错误')) throw e
    // 还什么都没收到就断了：多半是中转站偶发断线，上层会自动重试一次
    throw new StreamBroken(!full && !reasoning)
  }
  if (buf) onLine(buf)
  return finishUp()
}

/** 流式传输中途断线；fresh 表示还没收到任何内容，可以放心重试 */
class StreamBroken extends Error {
  constructor(readonly fresh: boolean) {
    super('和接口的连接中途断开了（可能是网络不稳定，或中转站限制了单次请求的时长）。可以重试；反复出现时把思考强度调低一档')
  }
}

/** 把常见的网关错误码翻译成能看懂的提示 */
function httpError(status: number, body: string): string {
  const head = `接口返回 ${status}`
  if (status === 524 || status === 504)
    return `${head}：网关等待超时（模型思考太久还没开始输出）。可以把思考强度调低，或者少传几页图片分段扒`
  if (status === 413) return `${head}：请求太大（图片太多或太大），可以少传几页分段扒`
  if (status === 401 || status === 403) return `${head}：API Key 无效或没有权限`
  if (status === 429) return `${head}：请求太频繁或额度不足，稍后再试`
  // Cloudflare 等网关的错误页是整页 HTML，只取标题
  const title = /<title>([^<]*)<\/title>/i.exec(body)?.[1]
  return `${head}：${(title ?? body).trim().slice(0, 300)}`
}

// ---------------- 连接测试 ----------------

export interface ModelEntry {
  id: string
  name?: string
  /** true 支持看图；false 不支持；null 未知 */
  vision: boolean | null
}

export interface ConnectionResult {
  ok: boolean
  latencyMs?: number
  models?: ModelEntry[]
  /** 连接正常但没能拿到模型列表时的说明 */
  note?: string
  error?: string
}

/** 测试接口能否连通、Key 是否有效，并获取模型列表 */
export async function testConnection(settings: AiSettings): Promise<ConnectionResult> {
  if (!settings.apiKey.trim()) return { ok: false, error: '还没有填写 API Key' }
  return settings.provider === 'anthropic' ? testClaude(settings) : testOpenAI(settings)
}

async function testClaude(settings: AiSettings): Promise<ConnectionResult> {
  const client = claudeClient(settings, 15_000, 0)
  const t0 = performance.now()
  try {
    const page = await client.models.list({ limit: 100 })
    const latencyMs = Math.round(performance.now() - t0)
    const models = page.data.map((m) => ({ id: m.id, name: m.display_name, vision: m.capabilities ? m.capabilities.image_input.supported : null }))
    return { ok: true, latencyMs, models }
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0)
    // 一些中转只转发 /v1/messages，不提供模型列表：此时连接本身是通的
    if (e instanceof Anthropic.NotFoundError) {
      return { ok: true, latencyMs, note: '接口能连通，但这个地址不提供模型列表。请手动填写模型名，并用「试跑」确认。' }
    }
    return { ok: false, latencyMs, error: friendlyClaudeError(e, settings).message }
  }
}

/** 根据模型名粗略判断是否支持看图 */
function guessVision(id: string): boolean | null {
  if (/vl|vision|4o|gpt-4\.1|gpt-[5-9]|o3|o4|gemini|claude|glm-4v|glm-4\.\dv|qvq|omni|doubao.*(vision|seed)|kimi.*(vision|k2)|pixtral|llava|internvl|step-1v|yi-vision/i.test(id)) return true
  if (/embed|whisper|tts|rerank|audio|dall-e|image-gen|moderation/i.test(id)) return false
  return null
}

async function testOpenAI(settings: AiSettings): Promise<ConnectionResult> {
  const url = `${openaiBase(settings)}/models`
  const headers = { Authorization: `Bearer ${settings.apiKey.trim()}` }
  const t0 = performance.now()
  try {
    let status: number
    let data: unknown
    if (isNative) {
      const r = await nativeGetJson(url, headers)
      status = r.status
      data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data
    } else {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 15_000)
      const res = await fetch(url, { headers, signal: ctrl.signal }).finally(() => clearTimeout(timer))
      status = res.status
      data = await res.json().catch(() => null)
    }
    const latencyMs = Math.round(performance.now() - t0)
    if (status === 401 || status === 403) return { ok: false, latencyMs, error: `API Key 无效或没有权限（${status}）` }
    if (status === 404) return { ok: true, latencyMs, note: '接口能连通，但这个地址不提供模型列表。请手动填写模型名，并用「试跑」确认。' }
    if (status >= 400) return { ok: false, latencyMs, error: `接口返回 ${status}：${JSON.stringify(data).slice(0, 200)}` }
    const list = (data as { data?: { id: string }[] } | null)?.data ?? []
    const models = list
      .map((m) => ({ id: m.id, vision: guessVision(m.id) }))
      .sort((a, b) => Number(b.vision === true) - Number(a.vision === true) || a.id.localeCompare(b.id))
    return { ok: true, latencyMs, models }
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0)
    const aborted = (e as Error).name === 'AbortError'
    return {
      ok: false,
      latencyMs,
      error: aborted
        ? '15 秒内没有响应，请检查接口地址和网络'
        : isNative
          ? `无法连接：${(e as Error).message}`
          : '无法连接（网络问题，或该服务不允许浏览器直接调用/跨域；安卓 App 里没有这个限制）',
    }
  }
}

// ---------------- 试跑 ----------------

export interface TrialResult {
  ok: boolean
  /** 拿到响应头的时间 */
  connectMs?: number
  /** 第一个输出字的时间 */
  firstTokenMs?: number
  totalMs?: number
  /** 模型是否正确认出了测试图片 */
  vision?: boolean | null
  reply?: string
  error?: string
}

/** 生成一张红色测试图（PNG，base64） */
function redSquare(): string {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e02020'
  ctx.fillRect(0, 0, 64, 64)
  return c.toDataURL('image/png').split(',')[1]
}

const TRIAL_PROMPT = '图片里是什么颜色？只用一个中文词回答。'
const looksRed = (s: string) => /红|red/i.test(s)

/** 用一张测试图跑一次当前模型：测首字延迟、总耗时，并确认能看图 */
export async function trialRun(settings: AiSettings): Promise<TrialResult> {
  if (!settings.apiKey.trim()) return { ok: false, error: '还没有填写 API Key' }
  if (!settings.model.trim()) return { ok: false, error: '还没有选择模型' }
  const img = redSquare()
  const t0 = performance.now()
  const ms = () => Math.round(performance.now() - t0)
  if (settings.provider === 'anthropic') {
    const client = claudeClient(settings, 60_000, 0)
    let connectMs: number | undefined
    let firstTokenMs: number | undefined
    const go = (compat: boolean) => {
      const stream = client.messages.stream({
        model: settings.model.trim(),
        max_tokens: 2048,
        ...(compat ? {} : { output_config: { effort: 'low' as const } }),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: img } },
              { type: 'text', text: TRIAL_PROMPT },
            ],
          },
        ],
      })
      stream.on('connect', () => (connectMs = ms()))
      stream.on('text', () => (firstTokenMs ??= ms()))
      return stream.finalMessage()
    }
    try {
      let msg: Anthropic.Message
      try {
        msg = await go(false)
      } catch (e) {
        if (!isCompatError(e)) throw e
        msg = await go(true)
      }
      const reply = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
      return { ok: true, connectMs, firstTokenMs, totalMs: ms(), reply, vision: looksRed(reply) }
    } catch (e) {
      const err = friendlyClaudeError(e, settings).message
      return { ok: false, connectMs, totalMs: ms(), error: err, vision: /image/i.test(String((e as Error).message)) ? false : null }
    }
  }
  // OpenAI 兼容：非流式，测总耗时
  const url = `${openaiBase(settings)}/chat/completions`
  const body = {
    model: settings.model.trim(),
    stream: false,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } },
          { type: 'text', text: TRIAL_PROMPT },
        ],
      },
    ],
  }
  const headers = { Authorization: `Bearer ${settings.apiKey.trim()}` }
  try {
    let status: number
    let data: unknown
    if (isNative) {
      const r = await nativePostJson(url, headers, body)
      status = r.status
      data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data
    } else {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 60_000)
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).finally(() =>
        clearTimeout(timer),
      )
      status = res.status
      data = await res.json().catch(() => null)
    }
    const totalMs = ms()
    if (status >= 400) {
      const text = JSON.stringify(data).slice(0, 240)
      // 不支持图片的模型通常会在错误里提到 image
      return { ok: false, totalMs, error: `接口返回 ${status}：${text}`, vision: /image|vision|multimodal|图片/i.test(text) ? false : null }
    }
    const reply = ((data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? '').trim()
    return { ok: true, totalMs, reply, vision: looksRed(reply) }
  } catch (e) {
    return { ok: false, totalMs: ms(), error: (e as Error).name === 'AbortError' ? '60 秒内没有完成' : `无法连接：${(e as Error).message}` }
  }
}

/** 一张用户上传的图片；长截图会被切成多段 parts 发给模型 */
export interface AiSource {
  name: string
  /** 缩略图（界面展示用） */
  preview: string
  width: number
  height: number
  parts: AiImage[]
  /** 有没有硬切（相邻两段有重叠） */
  overlapped?: boolean
}

/**
 * 送给模型的图统一放大/缩小到这个宽度，再切成不高于 STRIP_H 的横条：
 * OpenAI 系的高清模式会把短边缩到 768，横条的短边在 768 以内就不会再被缩小；
 * Claude 的上限是长边 1568，几乎不损失。照片里只有几个像素高的品位数字放大后模型才认得出来。
 */
const TARGET_W = 1600
const STRIP_H = 760
/** 相邻两段的重叠比例：保证被切开的那一行在下一段里是完整的 */
export const SLICE_OVERLAP = 0.15

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`无法读取图片 ${file.name}`))
    }
    i.src = url
  })
}

function renderPart(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.9)
}

const toPart = (name: string, dataUrl: string): AiImage => ({ name, mediaType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl })

/**
 * 读取图片：裁掉照片四周的背景和空白，统一缩放到 TARGET_W 宽，
 * 再从上到下在空白处切成横条（矮的图就是一张）。所有分析都在小图上做，
 * 只按横条逐段绘制，长截图在手机上也不会占用太多内存。
 */
export async function loadSource(file: File): Promise<AiSource> {
  const img = await decodeImage(file)
  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  const thumbW = 240
  const preview = renderPart(img, 0, 0, w0, Math.min(h0, w0 * 1.33), thumbW, Math.round(Math.min(h0, w0 * 1.33) * (thumbW / w0)))
  URL.revokeObjectURL(img.src)

  // 小图：找内容区域、统计色阶和每行墨迹
  const aw = Math.min(480, w0)
  const ah = Math.max(1, Math.round(h0 * (aw / w0)))
  const ac = document.createElement('canvas')
  ac.width = aw
  ac.height = ah
  const actx = ac.getContext('2d', { willReadFrequently: true })!
  actx.drawImage(img, 0, 0, aw, ah)
  const px = actx.getImageData(0, 0, aw, ah).data
  const gray = new Uint8ClampedArray(aw * ah)
  for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8
  let mask = inkMask(gray, aw, ah)
  const found = findContent(gray, aw, ah, mask)
  const box = found ?? { x: 0, y: 0, w: aw, h: ah }
  const inBox = (i: number) => {
    const x = i % aw
    const y = (i / aw) | 0
    return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h
  }
  const levels = found ? levelsOf(gray, inBox, gray.length) : null

  // 深色底的截图：改用「和底色差得多」来判断墨迹
  if (!found) {
    const bgHist = new Uint32Array(256)
    for (let i = 0; i < gray.length; i += 3) bgHist[gray[i]]++
    let bg = 0
    for (let v = 1; v < 256; v++) if (bgHist[v] > bgHist[bg]) bg = v
    mask = new Uint8Array(gray.length)
    for (let i = 0; i < gray.length; i++) if (Math.abs(gray[i] - bg) > 48) mask[i] = 1
  }
  // 每行墨迹、每行被多少根长竖线穿过
  const rowInk = new Float32Array(box.h)
  for (let y = 0; y < box.h; y++) {
    let c = 0
    const row = (box.y + y) * aw
    for (let x = box.x; x < box.x + box.w; x++) c += mask[row + x]
    rowInk[y] = c
  }
  const rowCross = verticalCrossings(mask, aw, box, Math.max(8, Math.round(aw * 0.03)))

  const f = w0 / aw
  const crop = { x: box.x * f, y: box.y * f, w: box.w * f, h: box.h * f }
  // 缩放到统一宽度（放大最多 2.5 倍）
  const s = Math.min(2.5, TARGET_W / crop.w)
  const W = Math.round(crop.w * s)
  const H = Math.round(crop.h * s)
  const ink = new Float32Array(H)
  const cross = new Uint16Array(H)
  for (let y = 0; y < H; y++) {
    const r = Math.min(box.h - 1, Math.floor(y / s / f))
    ink[y] = rowInk[r]
    cross[y] = rowCross[r]
  }

  const render = (y0: number, y1: number) => {
    const h = y1 - y0
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: !!levels })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, h)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, crop.x, crop.y + y0 / s, crop.w, h / s, 0, 0, W, h)
    if (levels) applyLevels(ctx, W, h, levels)
    return canvas.toDataURL('image/jpeg', 0.9)
  }

  if (H <= STRIP_H * 1.25) return { name: file.name, preview, width: w0, height: h0, parts: [toPart(file.name, render(0, H))] }
  const { strips, hard } = planStrips(ink, H, STRIP_H, Math.max(1, box.w * 0.004), Math.round(STRIP_H * SLICE_OVERLAP), cross)
  const parts = strips.map(([y0, y1], i) => toPart(`${file.name} #${i + 1}`, render(y0, y1)))
  return { name: file.name, preview, width: w0, height: h0, parts, overlapped: hard }
}

/** 给模型的图片说明：哪几张是同一张长图切出来的 */
export function describeSources(sources: AiSource[]): string {
  if (!sources.length) return ''
  let n = 0
  const lines = sources.map((s) => {
    const a = n + 1
    n += s.parts.length
    return s.parts.length > 1
      ? `- 第 ${a}–${n} 张：同一张图（一页曲谱或一张长截图）从上到下切成的 ${s.parts.length} 段，已经裁掉四周空白并放大，按顺序拼起来就是完整的一张。${
          s.overlapped ? `个别地方相邻两段有约 ${Math.round(SLICE_OVERLAP * 100)}% 的重叠，重叠处的内容只转写一次。` : '切口都在行与行之间的空白处，没有重叠。'
        }`
      : `- 第 ${a} 张：一页曲谱。`
  })
  return `共 ${n} 张图片，按顺序排列：\n${lines.join('\n')}`
}
