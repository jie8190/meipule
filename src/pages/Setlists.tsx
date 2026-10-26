import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Plus, ListMusic } from 'lucide-react'
import { createSetlist, db } from '@/lib/db'
import { Cover } from '@/components/Cover'
import { Button, Input, Modal } from '@/components/ui'

export default function Setlists() {
  const navigate = useNavigate()
  const lists = useLiveQuery(() => db.setlists.orderBy('updatedAt').reverse().toArray(), [])
  const songs = useLiveQuery(() => db.songs.toArray(), [])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const byId = new Map((songs ?? []).map((s) => [s.id, s]))

  const create = async () => {
    if (!name.trim()) return
    const id = await createSetlist(name.trim())
    setOpen(false)
    setName('')
    navigate(`/setlists/${id}`)
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-20 pt-6 sm:px-8 lg:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">歌单</h1>
          <p className="mt-1 text-sm text-fg-2">把要演出、要练习的歌排成一组，演奏时一键切换下一首</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          新建歌单
        </Button>
      </div>

      {lists && lists.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-[28px] border border-dashed border-line-2 py-20 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <ListMusic className="size-7" />
          </span>
          <div>
            <div className="font-semibold">还没有歌单</div>
            <div className="mt-1 text-sm text-fg-3">比如「周末弹唱」「吉他社演出」「指弹练习」</div>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            新建第一个歌单
          </Button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {lists?.map((l, i) => {
          const covers = l.songIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 4)
          return (
            <motion.button
              key={l.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/setlists/${l.id}`)}
              className="group text-left"
            >
              <div
                className="relative aspect-square overflow-hidden rounded-[24px] ring-1 ring-line transition duration-500 group-hover:-translate-y-1"
                style={{ background: `linear-gradient(135deg, hsl(${l.hue ?? 30} 70% 55%), hsl(${((l.hue ?? 30) + 60) % 360} 70% 35%))` }}
              >
                {covers.length >= 4 ? (
                  <div className="grid size-full grid-cols-2">
                    {covers.map((s) => (
                      <Cover key={s!.id} title={s!.title} artist={s!.artist} className="size-full" showText={false} />
                    ))}
                  </div>
                ) : covers[0] ? (
                  <Cover title={covers[0].title} artist={covers[0].artist} className="size-full" showText={false} />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <ListMusic className="size-12 text-white/70" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-4 bottom-4 text-white">
                  <div className="truncate text-lg font-bold">{l.name}</div>
                  <div className="text-xs text-white/70">{l.songIds.length} 首</div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="新建歌单" width={420}>
        <div className="flex gap-2">
          <Input autoFocus className="flex-1" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="歌单名称" />
          <Button variant="primary" onClick={create} disabled={!name.trim()}>
            创建
          </Button>
        </div>
      </Modal>
    </div>
  )
}
