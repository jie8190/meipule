import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { AudioWaveform, Metronome, Grid3x3, BookOpen, WandSparkles, Heart, ArrowUpRight } from 'lucide-react'
import { cn, Dim, PageHeader } from '@/components/ui'

// 中性面板 + 单色小图标，颜色只用来区分工具，不铺满底色
const TOOLS = [
  { to: '/tools/tuner', icon: AudioWaveform, title: '调音器', tag: 'Tuner', desc: '麦克风实时测音，支持多种调弦', tone: 'text-ok' },
  { to: '/tools/metronome', icon: Metronome, title: '节拍器', tag: 'Tempo', desc: '重音、细分、打拍子测速', tone: 'text-accent' },
  { to: '/tools/chords', icon: Grid3x3, title: '和弦库', tag: 'Chords', desc: '任意和弦的多种按法与试听', tone: 'text-[#8fb0ff]' },
  { to: '/ai', icon: WandSparkles, title: 'AI 扒谱', tag: 'Vision', desc: '截图变成可播放的动态谱', tone: 'text-ai-1' },
  { to: '/favorites', icon: Heart, title: '我的收藏', tag: 'Saved', desc: '常练的歌都在这里', tone: 'text-err' },
  { to: '/docs', icon: BookOpen, title: '格式文档', tag: 'Docs', desc: '曲谱 JSON 写法说明', tone: 'text-fg-2' },
]

export default function ToolsHub() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <PageHeader
        eyebrow="Toolkit · 06"
        title={
          <>
            工具<Dim>，练琴的随身装备</Dim>
          </>
        }
      />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOOLS.map((t, i) => (
          <motion.button
            key={t.to}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => navigate(t.to)}
            className="group relative flex aspect-[1/1.02] flex-col justify-between overflow-hidden rounded-[18px] border border-line bg-surface p-4 text-left shadow-[var(--shadow)] transition duration-300 hover:-translate-y-0.5 hover:border-line-2 active:scale-[0.98]"
          >
            <span className="flex items-start justify-between">
              <span className="eyebrow text-[10px]">
                {String(i + 1).padStart(2, '0')} · {t.tag}
              </span>
              <ArrowUpRight className="size-4 text-fg-3 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
            </span>
            <t.icon className={cn('size-8', t.tone)} strokeWidth={1.5} />
            <span>
              <span className="block text-[16px] font-semibold tracking-tight">{t.title}</span>
              <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-fg-3">{t.desc}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
