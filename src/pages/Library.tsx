import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Search, LayoutGrid, Rows3, WandSparkles, FileUp, PenLine, ArrowUpRight, Heart, Play, Sparkles } from 'lucide-react'
import { db, seedSamples, type SongRecord } from '@/lib/db'
import { useUi } from '@/store/ui'
import { greeting, timeAgo } from '@/lib/format'
import { Cover } from '@/components/Cover'
import { Logo } from '@/components/Shell'
import { SongCard, SongRow } from '@/components/SongCard'
import { Button, Chip, cn, Dim, Input, PageHeader, SectionTitle, Segmented, Select, toast } from '@/components/ui'

type Sort = 'updated' | 'opened' | 'title' | 'difficulty'

const QUICK = [
  { icon: WandSparkles, title: 'AI 扒谱', tag: 'Vision', desc: '截图或拍照，让 AI 转成可播放的曲谱', tone: 'text-ai-1', to: '/ai' },
  { icon: FileUp, title: '导入曲谱', tag: 'GP · TXT', desc: 'Guitar Pro、文字谱或 JSON，本地转换', tone: 'text-fg', to: '' },
  { icon: PenLine, title: '参数化制谱', tag: 'Compose', desc: '写下和弦进行 + 节奏型，自动生成六线谱', tone: 'text-accent', to: '/edit/new' },
]

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
      <PageHeader
        eyebrow={
          <>
            <Logo size={15} className="lg:hidden" />
            {favorites ? 'Favorites' : 'Library'} · <span className="tnum">{String(favorites ? list.length : songs.length).padStart(2, '0')}</span>
            <span className="text-line-3">/</span>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </>
        }
        title={
          favorites ? (
            <>
              我的收藏<Dim>，常练的歌</Dim>
            </>
          ) : (
            <>
              {greeting()}，<Dim>来弹一首吧</Dim>
            </>
          )
        }
        description={favorites ? `${list.length} 首收藏的曲谱` : '所有曲谱只保存在这台设备上，离线也能弹'}
        actions={
          <>
            <Input icon={<Search className="size-4" />} placeholder="搜索曲名、歌手、标签" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-72" />
            <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => openImport()} className="hidden sm:inline-flex">
              导入
            </Button>
          </>
        }
      />

      {/* 快速开始：中性面板，只用图标颜色区分 */}
      {!favorites && !q && (
        <section className="mt-7 grid grid-cols-3 gap-2.5 sm:mt-9 sm:gap-3">
          {QUICK.map((a) => (
            <button
              key={a.title}
              onClick={() => (a.to ? navigate(a.to) : openImport())}
              className="group relative flex flex-col items-start overflow-hidden rounded-[18px] border border-line bg-surface p-3.5 text-left shadow-[var(--shadow)] transition duration-300 hover:-translate-y-0.5 hover:border-line-2 active:scale-[0.98] sm:p-5"
            >
              <span className={cn('icon-tile flex size-10 items-center justify-center rounded-xl sm:size-11', a.tone)}>
                <a.icon className="size-[19px]" strokeWidth={1.9} />
              </span>
              <span className="mt-3.5 flex w-full items-center gap-2 sm:mt-5">
                <span className="text-[14px] font-semibold tracking-tight sm:text-[15px]">{a.title}</span>
                <span className="eyebrow ml-auto hidden text-[10px] sm:inline">{a.tag}</span>
              </span>
              <span className="mt-1 hidden pr-8 text-[13px] leading-relaxed text-fg-3 sm:block">{a.desc}</span>
              <ArrowUpRight className="absolute right-4 top-4 hidden size-4 text-fg-3 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg sm:block" />
            </button>
          ))}
        </section>
      )}

      {/* 继续练习 */}
      {!favorites && !q && recent.length > 0 && (
        <section className="mt-10">
          <SectionTitle count={recent.length}>继续练习</SectionTitle>
          <div className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8">
            {recent.map((s, i) => (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/song/${s.id}`)}
                className="group relative h-[200px] w-[280px] shrink-0 snap-start overflow-hidden rounded-[20px] text-left ring-1 ring-inset ring-white/8 sm:h-[220px] sm:w-[340px]"
              >
                <Cover title={s.title} artist={s.artist} className="absolute inset-0 transition duration-700 group-hover:scale-105" showText={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-5 bottom-5 flex items-end gap-3">
                  <div className="min-w-0 flex-1 text-white">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/55">{timeAgo(s.lastOpenedAt)}</div>
                    <div className="mt-1.5 truncate text-[19px] font-semibold tracking-tight">{s.title}</div>
                    <div className="truncate text-[13px] text-white/70">
                      {s.artist}
                      {s.doc.key ? ` · ${s.doc.key} 调` : ''}
                    </div>
                  </div>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/95 text-black shadow-xl transition group-hover:scale-110">
                    <Play className="ml-0.5 size-4 fill-current" />
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
            <h2 className="mr-auto flex items-baseline gap-2 text-[15px] font-semibold tracking-tight sm:mr-2">
              {favorites ? '收藏' : q ? `搜索「${q}」` : '全部曲谱'}
              <span className="font-mono text-[11px] font-medium text-fg-3 tnum">{String(list.length).padStart(2, '0')}</span>
            </h2>
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-5 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
