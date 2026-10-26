import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Reorder } from 'motion/react'
import { ArrowLeft, Play, Plus, Trash2, GripVertical, X, Search, Check } from 'lucide-react'
import { db, deleteSetlist, updateSetlist } from '@/lib/db'
import { Cover } from '@/components/Cover'
import { Button, cn, confirmDialog, IconButton, Input, Modal, toast } from '@/components/ui'

export default function SetlistDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const list = useLiveQuery(() => db.setlists.get(id), [id])
  const songs = useLiveQuery(() => db.songs.toArray(), [])
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs])

  if (list === undefined) return null
  if (!list) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-fg-2">
        歌单不存在
        <Button onClick={() => navigate('/setlists')}>返回</Button>
      </div>
    )
  }
  const items = list.songIds.filter((s) => byId.has(s))
  const filtered = (songs ?? []).filter((s) => !q.trim() || s.title.includes(q.trim()) || s.artist.includes(q.trim()))

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <button onClick={() => navigate('/setlists')} className="mb-4 flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" /> 歌单
      </button>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div
          className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-line"
          style={{ background: `linear-gradient(135deg, hsl(${list.hue ?? 30} 70% 55%), hsl(${((list.hue ?? 30) + 60) % 360} 70% 35%))` }}
        >
          {items[0] && <Cover title={byId.get(items[0])!.title} artist={byId.get(items[0])!.artist} className="size-full" />}
        </div>
        <div className="min-w-0 flex-1">
          <input
            defaultValue={list.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== list.name && updateSetlist(list.id, { name: e.target.value.trim() })}
            className="w-full bg-transparent text-[32px] font-bold tracking-tight outline-none focus:underline focus:decoration-line-3 focus:underline-offset-8"
          />
          <input
            defaultValue={list.description ?? ''}
            placeholder="添加描述…"
            onBlur={(e) => e.target.value !== (list.description ?? '') && updateSetlist(list.id, { description: e.target.value })}
            className="mt-1 w-full bg-transparent text-sm text-fg-2 outline-none placeholder:text-fg-3"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={<Play className="size-4 fill-current" />} disabled={!items.length} onClick={() => navigate(`/song/${items[0]}?list=${list.id}`)}>
              开始演奏
            </Button>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              添加曲谱
            </Button>
            <IconButton
              label="删除歌单"
              onClick={async () => {
                if (await confirmDialog({ title: `删除歌单「${list.name}」？`, body: '只删除歌单，不会删除里面的曲谱。', ok: '删除', danger: true })) {
                  await deleteSetlist(list.id)
                  navigate('/setlists')
                }
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="card mt-8 p-2">
        {items.length === 0 ? (
          <div className="py-14 text-center text-sm text-fg-3">歌单是空的，点「添加曲谱」挑几首吧</div>
        ) : (
          <Reorder.Group axis="y" values={items} onReorder={(ids) => updateSetlist(list.id, { songIds: ids })} className="space-y-0.5">
            {items.map((sid, i) => {
              const s = byId.get(sid)!
              return (
                <Reorder.Item key={sid} value={sid} className="group flex cursor-grab items-center gap-3 rounded-2xl bg-surface px-2 py-2 active:cursor-grabbing">
                  <GripVertical className="size-4 text-fg-3" />
                  <span className="w-6 text-center text-sm tabular-nums text-fg-3">{i + 1}</span>
                  <Cover title={s.title} artist={s.artist} className="size-11 shrink-0 rounded-xl" showText={false} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/song/${sid}?list=${list.id}`)}>
                    <div className="truncate text-sm font-semibold">{s.title}</div>
                    <div className="truncate text-xs text-fg-3">
                      {[s.artist, s.doc.key && `${s.doc.key} 调`, s.doc.capo ? `夹${s.doc.capo}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                  <IconButton size="sm" label="移出歌单" className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100" onClick={() => updateSetlist(list.id, { songIds: list.songIds.filter((x) => x !== sid) })}>
                    <X className="size-4" />
                  </IconButton>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        )}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="添加曲谱" width={520}>
        <Input icon={<Search className="size-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索" />
        <div className="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto">
          {filtered.map((s) => {
            const has = list.songIds.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={async () => {
                  await updateSetlist(list.id, { songIds: has ? list.songIds.filter((x) => x !== s.id) : [...list.songIds, s.id] })
                  if (!has) toast.ok(`已添加「${s.title}」`)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)]"
              >
                <Cover title={s.title} artist={s.artist} className="size-10 shrink-0 rounded-lg" showText={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.title}</span>
                  <span className="block truncate text-xs text-fg-3">{s.artist}</span>
                </span>
                <span className={cn('flex size-6 items-center justify-center rounded-full border', has ? 'border-accent bg-accent text-accent-fg' : 'border-line-3')}>{has && <Check className="size-3.5" />}</span>
              </button>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
