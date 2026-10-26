import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Moon, Sun, Monitor, Download, Upload, Sparkles, Trash2, KeyRound, Check, Smartphone } from 'lucide-react'
import { useSettings, type Accent } from '@/store/settings'
import { useUi } from '@/store/ui'
import { db, exportBackup, seedSamples } from '@/lib/db'
import { downloadText } from '@/lib/importer'
import { AiSettingsModal } from '@/components/AiSettingsModal'
import { Button, cn, confirmDialog, Segmented, Slider, Switch, toast } from '@/components/ui'

const ACCENTS: { id: Accent; name: string; a: string; b: string }[] = [
  { id: 'amber', name: '琥珀', a: '#f5b041', b: '#ff7849' },
  { id: 'coral', name: '珊瑚', a: '#ff7a6b', b: '#ff4f8b' },
  { id: 'mint', name: '薄荷', a: '#3fe0b0', b: '#3fb7ff' },
  { id: 'violet', name: '紫罗兰', a: '#a48bff', b: '#ff7ad9' },
  { id: 'sky', name: '天空', a: '#5cc8ff', b: '#7b8cff' },
]

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
}

function Row({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="mt-0.5 text-xs text-fg-3">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">{title}</h2>
      <div className="card divide-y divide-line px-5">{children}</div>
    </section>
  )
}

export default function Settings() {
  const s = useSettings()
  const openImport = useUi((x) => x.openImport)
  const [keyOpen, setKeyOpen] = useState(false)
  const counts = useLiveQuery(async () => ({ songs: await db.songs.count(), lists: await db.setlists.count() }))
  const [install, setInstall] = useState<InstallPrompt | null>(null)
  const [usage, setUsage] = useState<string>('')

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setInstall(e as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', h)
    navigator.storage?.estimate?.().then((est) => {
      if (est.usage !== undefined) setUsage(`${(est.usage / 1024 / 1024).toFixed(1)} MB`)
    })
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-6 sm:px-8 lg:pt-10">
      <h1 className="text-[32px] font-bold tracking-tight">设置</h1>

      <Group title="外观">
        <Row title="主题">
          <Segmented
            size="sm"
            value={s.theme}
            onChange={(v) => s.set({ theme: v })}
            options={[
              { value: 'dark', label: <span className="flex items-center gap-1"><Moon className="size-3.5" />深色</span> },
              { value: 'light', label: <span className="flex items-center gap-1"><Sun className="size-3.5" />浅色</span> },
              { value: 'system', label: <span className="flex items-center gap-1"><Monitor className="size-3.5" />跟随</span> },
            ]}
          />
        </Row>
        <Row title="主题色">
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                aria-label={a.name}
                title={a.name}
                onClick={() => s.set({ accent: a.id })}
                className={cn('flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface)] transition', s.accent === a.id ? 'ring-fg' : 'ring-transparent hover:ring-line-3')}
                style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
              >
                {s.accent === a.id && <Check className="size-4 text-black/70" />}
              </button>
            ))}
          </div>
        </Row>
        <Row title="纸张谱面" desc="深色界面下也用浅色背景显示曲谱">
          <Switch checked={s.scorePaper} onChange={(v) => s.set({ scorePaper: v })} />
        </Row>
        <Row title="谱面缩放" desc={`${Math.round(s.scale * 100)}%`}>
          <div className="w-44">
            <Slider value={s.scale} min={0.7} max={1.8} step={0.05} onChange={(v) => s.set({ scale: v })} label="谱面缩放" />
          </div>
        </Row>
      </Group>

      <Group title="谱面显示">
        {(
          [
            ['showTab', '六线谱', '吉他伴奏的 TAB 谱'],
            ['showChordNames', '和弦名', '小节上方的和弦名称'],
            ['showDiagrams', '和弦图', '在和弦名下方显示小和弦图'],
            ['showMelody', '简谱', '旋律简谱'],
            ['showLyrics', '歌词', ''],
          ] as const
        ).map(([k, t, d]) => (
          <Row key={k} title={t} desc={d || undefined}>
            <Switch checked={s[k]} onChange={(v) => s.set({ [k]: v })} />
          </Row>
        ))}
      </Group>

      <Group title="播放">
        {(
          [
            ['guitar', '吉他音量'],
            ['melody', '旋律引导音量'],
            ['click', '节拍器音量'],
            ['master', '总音量'],
          ] as const
        ).map(([k, t]) => (
          <Row key={k} title={t}>
            <div className="w-44">
              <Slider value={s.volumes[k]} min={0} max={1} step={0.01} onChange={(v) => s.set({ volumes: { ...s.volumes, [k]: v } })} label={t} />
            </div>
          </Row>
        ))}
        <Row title="预备拍" desc="播放前先打一小节节拍">
          <Switch checked={s.countIn} onChange={(v) => s.set({ countIn: v })} />
        </Row>
      </Group>

      <Group title="AI 扒谱">
        <Row title="API 设置" desc={s.ai.apiKey ? `${s.ai.provider === 'anthropic' ? 'Claude' : 'OpenAI 兼容'} · ${s.ai.model}` : '未配置（也可以复制提示词到任意 AI 使用）'}>
          <Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setKeyOpen(true)}>
            配置
          </Button>
        </Row>
      </Group>

      <Group title="数据">
        <Row title="本地存储" desc={`${counts?.songs ?? 0} 首曲谱 · ${counts?.lists ?? 0} 个歌单${usage ? ` · 占用 ${usage}` : ''}`}>
          <span className="text-xs text-fg-3">IndexedDB</span>
        </Row>
        <Row title="导出完整备份" desc="所有曲谱和歌单导出为一个 JSON 文件">
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={async () => {
              const b = await exportBackup()
              const d = new Date()
              downloadText(`没谱了备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`, JSON.stringify(b, null, 1))
              toast.ok(`已导出 ${b.songs.length} 首曲谱`)
            }}
          >
            导出
          </Button>
        </Row>
        <Row title="导入备份 / 曲谱" desc="合并到当前曲库，不会删除已有内容">
          <Button size="sm" variant="secondary" icon={<Upload className="size-4" />} onClick={() => openImport()}>
            导入
          </Button>
        </Row>
        <Row title="重新加载示例曲谱">
          <Button
            size="sm"
            variant="secondary"
            icon={<Sparkles className="size-4" />}
            onClick={async () => {
              await seedSamples(true)
              toast.ok('示例曲谱已添加')
            }}
          >
            加载
          </Button>
        </Row>
        <Row title={<span className="text-err">清空所有数据</span>} desc="删除全部曲谱与歌单，无法恢复">
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (await confirmDialog({ title: '清空所有数据？', body: '所有曲谱和歌单都会被删除且无法恢复。建议先导出备份。', ok: '全部删除', danger: true })) {
                await db.songs.clear()
                await db.setlists.clear()
                toast.ok('已清空')
              }
            }}
          >
            清空
          </Button>
        </Row>
      </Group>

      <Group title="关于">
        <Row title="安装到桌面 / 主屏幕" desc="像原生 App 一样离线使用">
          {install ? (
            <Button size="sm" variant="primary" icon={<Smartphone className="size-4" />} onClick={() => install.prompt().then(() => setInstall(null))}>
              安装
            </Button>
          ) : (
            <span className="max-w-48 text-right text-xs text-fg-3">用浏览器菜单「安装应用 / 添加到主屏幕」</span>
          )}
        </Row>
        <Row title="没谱了" desc="本地优先的吉他谱 App · 所有数据只保存在你的设备上">
          <span className="text-xs text-fg-3">v1.0.0</span>
        </Row>
      </Group>
      <AiSettingsModal open={keyOpen} onClose={() => setKeyOpen(false)} />
    </div>
  )
}
