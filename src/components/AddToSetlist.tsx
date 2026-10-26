import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Check, ListMusic } from 'lucide-react'
import { addToSetlist, createSetlist, db, updateSetlist } from '@/lib/db'
import { Button, Input, Modal, toast } from './ui'

export function AddToSetlistDialog({ open, onClose, songId }: { open: boolean; onClose: () => void; songId: string }) {
  const lists = useLiveQuery(() => db.setlists.orderBy('updatedAt').reverse().toArray(), [])
  const [name, setName] = useState('')
  const create = async () => {
    if (!name.trim()) return
    await createSetlist(name.trim(), [songId])
    toast.ok(`已创建歌单「${name.trim()}」并添加`)
    setName('')
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="添加到歌单" width={440}>
      <div className="space-y-1">
        {lists?.length === 0 && <div className="py-4 text-center text-sm text-fg-3">还没有歌单，在下面新建一个吧</div>}
        {lists?.map((l) => {
          const has = l.songIds.includes(songId)
          return (
            <button
              key={l.id}
              onClick={async () => {
                if (has) await updateSetlist(l.id, { songIds: l.songIds.filter((s) => s !== songId) })
                else {
                  await addToSetlist(l.id, songId)
                  toast.ok(`已添加到「${l.name}」`)
                }
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[color-mix(in_oklab,var(--fg)_6%,transparent)]"
            >
              <span className="flex size-9 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, hsl(${l.hue ?? 30} 80% 60%), hsl(${((l.hue ?? 30) + 50) % 360} 80% 50%))` }}>
                <ListMusic className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{l.name}</span>
                <span className="block text-xs text-fg-3">{l.songIds.length} 首</span>
              </span>
              {has && <Check className="size-4 text-accent" />}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex gap-2 border-t border-line pt-4">
        <Input className="flex-1" placeholder="新歌单名称" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={create} disabled={!name.trim()}>
          新建
        </Button>
      </div>
    </Modal>
  )
}
