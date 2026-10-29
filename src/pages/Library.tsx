import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Search, LayoutGrid, Rows3, WandSparkles, FileUp, PenLine, ArrowRight, Heart, Play, Sparkles } from 'lucide-react'
import { db, seedSamples, type SongRecord } from '@/lib/db'
import { useUi } from '@/store/ui'
import { greeting, timeAgo, todayLabel } from '@/lib/format'
import { Cover } from '@/components/Cover'
import { Logo } from '@/components/Shell'
import { SongCard, SongRow } from '@/components/SongCard'
import { Button, Chip, cn, Input, Segmented, Select, toast } from '@/components/ui'

type Sort = 'updated' | 'opened' | 'title' | 'difficulty'

export default function Library({ favorites = false }: { favorites?: boolean }) {
  const navigate = useNavigate()
  const openImport = useUi((s) => s.openImport)
  const songs = useLiveQuery(() => db.songs.toArray(), [])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('updated')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('meipule:view') as 'grid' | 'list') || 'grid')

  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of songs ?? []) for (const t of s.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  }, [songs])

  const recent = useMemo(
    () =>
      (songs ?? [])
        .filter((s) => s.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, 8),
    [songs],
  )

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    let arr = (songs ?? []).filter((s) => (!favorites || s.favorite) && (!tag || s.tags.includes(tag)))
    if (term) arr = arr.filter((s) => s.title.toLowerCase().includes(term) || s.artist.toLowerCase().includes(term) || s.tags.some((t) => t.toLowerCase().includes(term)))
    const cmp: Record<Sort, (a: SongRecord, b: SongRecord) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      opened: (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
      title: (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
      difficulty: (a, b) => (a.doc.difficulty ?? 3) - (b.doc.difficulty ?? 3),
    }
    return arr.sort(cmp[sort])
  }, [songs, q, tag, sort, favorites])

  const setViewP = (v: 'grid' | 'list') => {
    setView(v)
    localStorage.setItem('meipule:view', v)
  }

  if (songs === undefined) return null
  const empty = songs.length === 0

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-6 sm:px-8 lg:pt-10">
      {/* 头部 */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-fg-3">
            <Logo size={20} className="lg:hidden" />
            {todayLabel()}
          </div>
          <h1 className="mt-1.5 text-[34px] font-bold leading-[1.1] tracking-tight sm:text-[42px]">
            {favorites ? (
              <>
                我的<span className="text-gradient">收藏</span>
              </>
            ) : (
              <>
                {greeting()}，<span className="text-gradient">来弹一首吧</span>
              </>
            )}
          </h1>
          <p className="mt-2 text-sm text-fg-2">
            {favorites ? `${list.length} 首收藏的曲谱` : `本地曲库共 ${songs.length} 首 · 所有数据只保存在这台设备上`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input icon={<Search className="size-4" />} placeholder="搜索曲名、歌手、标签" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-72" />
          <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => openImport()} className="hidden sm:inline-flex">
            导入
          </Button>
        </div>
      </header>

      {/* 快速开始 */}
      {!favorites && !q && (
        <section className="mt-6 grid grid-cols-3 gap-2.5 sm:mt-8 sm:gap-3">
          <motion.button
            whileHover={{ y: -3 }}
            onClick={() => navigate('/ai')}
            className="ai-border group relative overflow-hidden rounded-[20px] bg-surface p-3.5 text-left sm:rounded-[24px] sm:p-5"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 bg-[radial-gradient(closest-side,var(--ai-2),transparent)] opacity-30 transition group-hover:opacity-50" />
            <span className="relative flex size-11 items-center justify-center rounded-2xl bg-ai-gradient text-white shadow-[0_8px_24px_-8px_var(--ai-1)]">
              <WandSparkles className="size-5" />
            </span>
            <div className="relative mt-3 text-[14px] font-semibold sm:mt-4 sm:text-[16px]">AI 扒谱</div>
            <div className="relative mt-1 hidden pr-6 text-[13px] leading-relaxed text-fg-2 sm:block">截图或拍照，让 AI 转成可播放的曲谱</div>
            <ArrowRight className="absolute bottom-5 right-5 hidden size-4 text-fg-3 transition group-hover:translate-x-1 group-hover:text-fg sm:block" />
          </motion.button>
          <motion.button whileHover={{ y: -3 }} onClick={() => openImport()} className="group relative overflow-hidden rounded-[20px] border border-line bg-surface p-3.5 text-left sm:rounded-[24px] sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 bg-[radial-gradient(closest-side,#3fb7ff,transparent)] opacity-15 transition group-hover:opacity-30" />
            <span className="relative flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#3fe0b0,#3fb7ff)] text-[#03140f] shadow-[0_8px_24px_-8px_rgba(63,183,255,0.6)]">
              <FileUp className="size-5" />
            </span>
            <div className="relative mt-3 text-[14px] font-semibold sm:mt-4 sm:text-[16px]">导入曲谱</div>
            <div className="relative mt-1 hidden pr-6 text-[13px] leading-relaxed text-fg-2 sm:block">Guitar Pro、复制来的文字谱或 JSON，本地转换</div>
            <ArrowRight className="absolute bottom-5 right-5 hidden size-4 text-fg-3 transition group-hover:translate-x-1 group-hover:text-fg sm:block" />
          </motion.button>
          <motion.button whileHover={{ y: -3 }} onClick={() => navigate('/edit/new')} className="group relative overflow-hidden rounded-[20px] border border-line bg-surface p-3.5 text-left sm:rounded-[24px] sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 bg-[radial-gradient(closest-side,var(--accent),transparent)] opacity-20 transition group-hover:opacity-35" />
            <span className="relative flex size-11 items-center justify-center rounded-2xl bg-accent-gradient text-accent-fg shadow-[0_8px_24px_-8px_var(--accent-glow)]">
              <PenLine className="size-5" />
            </span>
            <div className="relative mt-3 text-[14px] font-semibold sm:mt-4 sm:text-[16px]">参数化制谱</div>
            <div className="relative mt-1 hidden pr-6 text-[13px] leading-relaxed text-fg-2 sm:block">写下和弦进行 + 节奏型，六线谱自动生成</div>
            <ArrowRight className="absolute bottom-5 right-5 hidden size-4 text-fg-3 transition group-hover:translate-x-1 group-hover:text-fg sm:block" />
          </motion.button>
        </section>
      )}

      {/* 继续练习 */}
      {!favorites && !q && recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-[15px] font-semibold">继续练习</h2>
          <div className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8">
            {recent.map((s, i) => (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/song/${s.id}`)}
                className="group relative h-[220px] w-[300px] shrink-0 snap-start overflow-hidden rounded-[26px] text-left ring-1 ring-line sm:w-[340px]"
              >
                <Cover title={s.title} artist={s.artist} className="absolute inset-0 transition duration-700 group-hover:scale-105" showText={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-5 bottom-5 flex items-end gap-3">
                  <div className="min-w-0 flex-1 text-white">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-white/60">{timeAgo(s.lastOpenedAt)}</div>
                    <div className="mt-1 truncate text-xl font-bold tracking-tight">{s.title}</div>
                    <div className="truncate text-[13px] text-white/70">
                      {s.artist}
                      {s.doc.key ? ` · ${s.doc.key} 调` : ''}
                    </div>
                  </div>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-xl transition group-hover:scale-110">
                    <Play className="ml-0.5 size-5 fill-current" />
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* 曲库 */}
      {!empty && (
        <section className="mt-10">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-[15px] font-semibold sm:mr-2">{favorites ? '收藏' : q ? `搜索「${q}」` : '全部曲谱'}</h2>
            <div className="no-scrollbar order-last -mx-5 flex w-[calc(100%+40px)] gap-1.5 overflow-x-auto px-5 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0">
              <Chip active={!tag} onClick={() => setTag(null)}>
                全部
              </Chip>
              {tags.map((t) => (
                <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  {t}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select<Sort>
                value={sort}
                onChange={setSort}
                size="sm"
                options={[
                  { value: 'updated', label: '最近更新' },
                  { value: 'opened', label: '最近打开' },
                  { value: 'title', label: '按曲名' },
                  { value: 'difficulty', label: '按难度' },
                ]}
              />
              <Segmented
                size="sm"
                value={view}
                onChange={setViewP}
                options={[
                  { value: 'grid', label: <LayoutGrid className="size-3.5" />, title: '网格' },
                  { value: 'list', label: <Rows3 className="size-3.5" />, title: '列表' },
                ]}
              />
            </div>
          </div>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-line-2 py-16 text-center">
              {favorites ? <Heart className="size-8 text-fg-3" /> : <Search className="size-8 text-fg-3" />}
              <div className="text-sm text-fg-2">{favorites ? '还没有收藏，点曲谱卡片上的 ♥ 收藏常练的歌' : '没有匹配的曲谱'}</div>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {list.map((s, i) => (
                <SongCard key={s.id} song={s} index={i} />
              ))}
            </div>
          ) : (
            <div className="card divide-y divide-line p-2">
              {list.map((s) => (
                <SongRow key={s.id} song={s} />
              ))}
            </div>
          )}
        </section>
      )}

      {empty && !favorites && <EmptyLibrary />}
    </div>
  )
}

function EmptyLibrary() {
  return (
    <section className="mt-10 overflow-hidden rounded-[32px] border border-line bg-surface">
      <div className="grid items-center gap-8 p-8 md:grid-cols-[1.1fr_1fr] md:p-12">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="size-3.5" /> 曲库还是空的
          </div>
          <h3 className="mt-4 text-2xl font-bold tracking-tight">从一首歌开始</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            用 AI 把网上的吉他谱截图变成可播放、可变调的动态谱，或者加载几首示例曲谱看看效果：分解和弦、扫弦切音、指弹技巧、和弦歌词谱都有。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                await seedSamples(true)
                toast.ok('已加载示例曲谱')
              }}
            >
              加载示例曲谱
            </Button>
          </div>
        </div>
        <div className="relative mx-auto grid w-full max-w-sm grid-cols-2 gap-3">
          {['小星星', 'Amazing Grace', '晨光练习曲', '茉莉花'].map((t, i) => (
            <div key={t} className={cn('float-slow overflow-hidden rounded-3xl shadow-2xl ring-1 ring-line', i % 2 && 'translate-y-6')} style={{ animationDelay: `${i * 0.8}s` }}>
              <Cover title={t} className="aspect-square" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
