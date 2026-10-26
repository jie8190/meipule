import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { AudioWaveform, Metronome, Grid3x3, BookOpen, WandSparkles, Heart, ArrowRight } from 'lucide-react'

const TOOLS = [
  { to: '/tools/tuner', icon: AudioWaveform, title: '调音器', desc: '麦克风实时测音，支持多种调弦', grad: 'linear-gradient(135deg,#46deb0,#3fb7ff)' },
  { to: '/tools/metronome', icon: Metronome, title: '节拍器', desc: '重音、细分、打拍子测速', grad: 'linear-gradient(135deg,#f5b041,#ff7849)' },
  { to: '/tools/chords', icon: Grid3x3, title: '和弦库', desc: '任意和弦的多种按法与试听', grad: 'linear-gradient(135deg,#a48bff,#ff7ad9)' },
  { to: '/ai', icon: WandSparkles, title: 'AI 扒谱', desc: '截图变成可播放的动态谱', grad: 'linear-gradient(135deg,#8b7bff,#e879f9)' },
  { to: '/favorites', icon: Heart, title: '我的收藏', desc: '常练的歌都在这里', grad: 'linear-gradient(135deg,#ff5d7a,#ff9a5a)' },
  { to: '/docs', icon: BookOpen, title: '格式文档', desc: '曲谱 JSON 写法说明', grad: 'linear-gradient(135deg,#5c6b8a,#2b3346)' },
]

export default function ToolsHub() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <h1 className="text-[32px] font-bold tracking-tight">工具</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t, i) => (
          <motion.button
            key={t.to}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => navigate(t.to)}
            className="group flex items-center gap-4 rounded-[22px] border border-line bg-surface p-4 text-left transition hover:border-line-2"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: t.grad }}>
              <t.icon className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{t.title}</span>
              <span className="block text-xs text-fg-3">{t.desc}</span>
            </span>
            <ArrowRight className="size-4 text-fg-3 transition group-hover:translate-x-1" />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
