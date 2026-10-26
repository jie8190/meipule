import { useMemo, useState, type ReactNode } from 'react'
import { Eye, EyeOff, Plug, FlaskConical, Check, X, Image as ImageIcon, Search, Loader2, TriangleAlert, ChevronDown } from 'lucide-react'
import { useSettings, type AiEffort } from '@/store/settings'
import { CLAUDE_MODELS, testConnection, trialRun, type ConnectionResult, type TrialResult } from '@/lib/ai'
import { isNative } from '@/lib/native'
import { Button, cn, Input, Modal, Segmented } from './ui'

const OPENAI_PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1' },
  { name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: '豆包', url: 'https://ark.cn-beijing.volces.com/api/v3' },
  { name: 'Kimi', url: 'https://api.moonshot.cn/v1' },
  { name: '智谱', url: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: '硅基流动', url: 'https://api.siliconflow.cn/v1' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
]

const EFFORTS: { value: AiEffort; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
]

function fmtMs(ms?: number) {
  if (ms === undefined) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} 秒`
}

function speedTone(ms?: number) {
  if (ms === undefined) return 'text-fg-3'
  return ms < 600 ? 'text-ok' : ms < 2000 ? 'text-warn' : 'text-err'
}

/** 分步卡片：1 连接、2 模型 */
function Step({ n, title, right, children }: { n: number; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--fg)_10%,transparent)] text-[11px] font-bold text-fg-2">{n}</span>
        <h3 className="flex-1 text-[13px] font-semibold">{title}</h3>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs font-medium text-fg-2">{children}</span>
      {hint && <span className="truncate text-[11px] text-fg-3">{hint}</span>}
    </div>
  )
}

/** 单行可横向滑动的快捷选项 */
function Chips({ items, value, onPick }: { items: { key: string; label: string }[]; value: string; onPick: (k: string) => void }) {
  return (
    <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onPick(it.key)}
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] transition',
            value === it.key ? 'bg-accent-soft font-semibold text-accent' : 'bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg-2 hover:text-fg',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function AiSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ai = useSettings((s) => s.ai)
  const setAi = useSettings((s) => s.setAi)
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [conn, setConn] = useState<ConnectionResult | null>(null)
  const [trying, setTrying] = useState(false)
  const [trial, setTrial] = useState<TrialResult | null>(null)
  const [listOpen, setListOpen] = useState(true)
  const [filter, setFilter] = useState('')
  const isClaude = ai.provider === 'anthropic'

  // 改了连接信息后，旧的测试结果作废
  const resetAll = () => {
    setConn(null)
    setTrial(null)
  }

  const models = useMemo(() => {
    const list = conn?.models ?? []
    const f = filter.trim().toLowerCase()
    return f ? list.filter((m) => m.id.toLowerCase().includes(f) || m.name?.toLowerCase().includes(f)) : list
  }, [conn, filter])
  const visionCount = conn?.models?.filter((m) => m.vision === true).length ?? 0
  const currentModel = conn?.models?.find((m) => m.id === ai.model)

  const runTest = async () => {
    setTesting(true)
    setConn(null)
    const r = await testConnection(ai)
    setConn(r)
    setListOpen(true)
    setTesting(false)
  }
  const runTrial = async () => {
    setTrying(true)
    setTrial(null)
    setTrial(await trialRun(ai))
    setTrying(false)
  }
  const pickModel = (id: string) => {
    setAi({ model: id })
    setTrial(null)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 设置"
      description="Key 只保存在这台设备上，请求直接发往你填写的服务商。"
      width={560}
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-3">
            {trial?.ok && trial.vision ? <span className="text-ok">✓ 已就绪：{ai.model}</span> : conn?.ok ? '连接正常，建议再「试跑」一下模型' : '填好后先点「测试连接」'}
          </span>
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented
          className="w-full"
          value={ai.provider}
          onChange={(v) => {
            setAi({ provider: v, model: v === 'anthropic' ? 'claude-opus-5-5' : ai.model.startsWith('claude') ? '' : ai.model, baseUrl: v === 'anthropic' ? '' : ai.baseUrl })
            resetAll()
          }}
          options={[
            { value: 'anthropic', label: 'Claude 官方' },
            { value: 'openai', label: 'OpenAI 兼容接口' },
          ]}
        />

        <Step
          n={1}
          title="连接"
          right={
            <Button size="sm" variant="secondary" icon={testing ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />} onClick={runTest} disabled={testing || !ai.apiKey.trim()}>
              测试连接
            </Button>
          }
        >
          <div>
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                value={ai.apiKey}
                onChange={(e) => {
                  setAi({ apiKey: e.target.value })
                  resetAll()
                }}
                placeholder={isClaude ? 'sk-ant-...' : 'sk-...'}
                className="font-mono"
                inputClassName="pr-10"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-3 hover:text-fg" aria-label={show ? '隐藏 Key' : '显示 Key'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label hint={isClaude ? '可选' : undefined}>{isClaude ? '中转 / 代理地址' : '接口地址（Base URL）'}</Label>
            <Input
              value={ai.baseUrl}
              onChange={(e) => {
                setAi({ baseUrl: e.target.value })
                resetAll()
              }}
              placeholder={isClaude ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
              className="font-mono"
              spellCheck={false}
            />
            {isClaude ? (
              !isNative && !ai.baseUrl.trim() && <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">留空直连 api.anthropic.com；在国内通常不通，需要代理或中转地址。</p>
            ) : (
              <Chips
                items={OPENAI_PRESETS.map((p) => ({ key: p.url, label: p.name }))}
                value={ai.baseUrl}
                onPick={(url) => {
                  setAi({ baseUrl: url })
                  resetAll()
                }}
              />
            )}
          </div>

          {conn && (
            <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px]', conn.ok ? 'bg-[color-mix(in_oklab,var(--ok)_10%,transparent)]' : 'bg-[color-mix(in_oklab,var(--err)_10%,transparent)]')}>
              {conn.ok ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <X className="mt-0.5 size-4 shrink-0 text-err" />}
              <div className="min-w-0 flex-1">
                {conn.ok ? (
                  <div className="flex flex-wrap gap-x-3">
                    <span>已连通</span>
                    <span className="text-fg-2">
                      延迟 <b className={speedTone(conn.latencyMs)}>{fmtMs(conn.latencyMs)}</b>
                    </span>
                    {conn.models && (
                      <span className="text-fg-2">
                        {conn.models.length} 个模型{visionCount > 0 && ` · ${visionCount} 个能看图`}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="break-all text-err">{conn.error}</span>
                )}
                {conn.note && <div className="mt-1 text-xs text-fg-2">{conn.note}</div>}
              </div>
            </div>
          )}
        </Step>

        <Step
          n={2}
          title="模型"
          right={
            <Button
              size="sm"
              variant="secondary"
              icon={trying ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
              onClick={runTrial}
              disabled={trying || !ai.apiKey.trim() || !ai.model.trim()}
              title="发一张测试图，测速度并确认能看图（耗费极少额度）"
            >
              试跑
            </Button>
          }
        >
          <div>
            <Label hint={currentModel?.vision === true ? <span className="text-ok">能看图</span> : '扒谱需要能看图的模型'}>模型名</Label>
            <div className="relative">
              <Input
                value={ai.model}
                onChange={(e) => pickModel(e.target.value)}
                placeholder={isClaude ? 'claude-opus-5-5' : '测试连接后可从列表选择'}
                className="font-mono"
                inputClassName={conn?.models?.length ? 'pr-10' : undefined}
                spellCheck={false}
              />
              {!!conn?.models?.length && (
                <button
                  type="button"
                  onClick={() => setListOpen(!listOpen)}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-fg-3 hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:text-fg"
                  aria-label="展开模型列表"
                >
                  <ChevronDown className={cn('size-4 transition', listOpen && 'rotate-180')} />
                </button>
              )}
            </div>

            {conn?.models && conn.models.length > 0 && listOpen && (
              <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface">
                {conn.models.length > 8 && (
                  <div className="border-b border-line p-2">
                    <Input icon={<Search className="size-3.5" />} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="筛选模型" inputClassName="h-8 text-xs" />
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto p-1">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickModel(m.id)}
                      className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition', ai.model === m.id ? 'bg-accent-soft' : 'hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)]')}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">{m.id}</span>
                      {m.name && m.name !== m.id && <span className="hidden max-w-36 truncate text-fg-3 sm:inline">{m.name}</span>}
                      {m.vision === true && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] px-1.5 py-0.5 text-[10px] text-ok">
                          <ImageIcon className="size-3" />
                          看图
                        </span>
                      )}
                      {m.vision === false && <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] px-1.5 py-0.5 text-[10px] text-fg-3">不支持图片</span>}
                      {ai.model === m.id && <Check className="size-3.5 shrink-0 text-accent" />}
                    </button>
                  ))}
                  {models.length === 0 && <div className="px-2 py-3 text-center text-xs text-fg-3">没有匹配的模型</div>}
                </div>
                {!isClaude && <div className="border-t border-line px-3 py-1.5 text-[10.5px] text-fg-3">「看图」按模型名推测，以试跑结果为准</div>}
              </div>
            )}

            {isClaude && !conn?.models && <Chips items={CLAUDE_MODELS.map((m) => ({ key: m.id, label: m.label }))} value={ai.model} onPick={pickModel} />}
          </div>

          {trial && (
            <div className={cn('rounded-xl px-3 py-2 text-[12.5px]', trial.ok ? 'bg-[color-mix(in_oklab,var(--ok)_10%,transparent)]' : 'bg-[color-mix(in_oklab,var(--err)_10%,transparent)]')}>
              {trial.ok ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1.5">
                      <Check className="size-4 text-ok" />
                      可用
                    </span>
                    {trial.connectMs !== undefined && (
                      <span className="text-fg-2">
                        连接 <b className={speedTone(trial.connectMs)}>{fmtMs(trial.connectMs)}</b>
                      </span>
                    )}
                    {trial.firstTokenMs !== undefined && (
                      <span className="text-fg-2">
                        首字 <b>{fmtMs(trial.firstTokenMs)}</b>
                      </span>
                    )}
                    <span className="text-fg-2">
                      总耗时 <b>{fmtMs(trial.totalMs)}</b>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs">
                    {trial.vision ? (
                      <>
                        <ImageIcon className="size-3.5 shrink-0 text-ok" />
                        <span className="shrink-0 text-ok">能看图</span>
                        <span className="truncate text-fg-3">（测试图是红色，模型答「{trial.reply?.slice(0, 12)}」）</span>
                      </>
                    ) : (
                      <>
                        <TriangleAlert className="size-3.5 shrink-0 text-warn" />
                        <span className="text-warn">没认出测试图，可能不支持图片</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-err" />
                  <div className="min-w-0">
                    <div className="break-all text-err">{trial.error}</div>
                    {trial.vision === false && <div className="mt-1 text-xs text-fg-2">看起来这个模型不支持图片，请换一个能看图的模型。</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <Label hint={isClaude ? '越高越准，也越慢越贵' : '推理模型才生效（如 GPT-5 及以上）；不支持时自动忽略'}>思考强度</Label>
              <Segmented className="w-full" value={ai.effort ?? 'high'} onChange={(v) => setAi({ effort: v })} options={EFFORTS} />
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">
              扒六线谱、拍照的谱建议选「极高」：逐音读得准很多，但每页要两三分钟。只有和弦歌词的弹唱谱用「高」就够了。
            </p>
          </div>
        </Step>
      </div>
    </Modal>
  )
}
