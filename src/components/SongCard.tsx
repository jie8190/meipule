import { memo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Heart, Ellipsis, PenLine, Copy, Download, ListPlus, Trash2, Play } from 'lucide-react'
import type { SongRecord } from '@/lib/db'
import { deleteSong, duplicateSong, setFavorite } from '@/lib/db'
import { formatSongJson } from '@/lib/notation/spec'
import { downloadText, safeFileName } from '@/lib/importer'
import { timeAgo } from '@/lib/format'
import { Cover } from './Cover'
import { AddToSetlistDialog } from './AddToSetlist'
import { cn, confirmDialog, MenuItem, MenuSep, Popover, toast } from './ui'

export function SongMenu({ song, trigger }: { song: SongRecord; trigger?: (p: { open: boolean; toggle: () => void }) => React.ReactNode }) {
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  return (
    <>
      <Popover
        trigger={
          trigger ??
          (({ toggle }) => (
            <button
              aria-label="更多"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggle()
              }}
              className="flex size-8 items-center justify-center rounded-full text-fg-2 transition hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:text-fg"
            >
              <Ellipsis className="size-4" />
            </button>
          ))
        }
      >
        {(close) => (
          <div onClick={(e) => e.stopPropagation()}>
            <MenuItem icon={<PenLine className="size-4" />} onClick={() => (close(), navigate(`/edit/${song.id}`))}>
              编辑
            </MenuItem>
            <MenuItem icon={<ListPlus className="size-4" />} onClick={() => (close(), setAddOpen(true))}>
              添加到歌单
            </MenuItem>
            <MenuItem
              icon={<Copy className="size-4" />}
              onClick={async () => {
                close()
                await duplicateSong(song.id)
                toast.ok('已创建副本')
              }}
            >
              创建副本
            </MenuItem>
            <MenuItem
              icon={<Download className="size-4" />}
              onClick={() => {
                close()
                downloadText(`${safeFileName(song.title)}.json`, formatSongJson(song.doc))
              }}
            >
              导出 JSON
            </MenuItem>
            <MenuSep />
            <MenuItem
              danger
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                close()
                if (await confirmDialog({ title: `删除「${song.title}」？`, body: '删除后无法恢复，建议先导出 JSON 备份。', ok: '删除', danger: true })) {
                  await deleteSong(song.id)
                  toast.ok('已删除')
                }
              }}
            >
              删除
            </MenuItem>
          </div>
        )}
      </Popover>
      <AddToSetlistDialog open={addOpen} onClose={() => setAddOpen(false)} songId={song.id} />
    </>
  )
}

export const SongCard = memo(function SongCard({ song, index = 0 }: { song: SongRecord; index?: number }) {
  const navigate = useNavigate()
  const d = song.doc
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <button onClick={() => navigate(`/song/${song.id}`)} className="block w-full text-left">
        <div className="relative aspect-square overflow-hidden rounded-[16px] shadow-[0_14px_30px_-20px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/8 transition duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_24px_44px_-22px_rgba(0,0,0,0.85)]">
          <Cover title={song.title} artist={song.artist} className="absolute inset-0 transition duration-700 ease-out group-hover:scale-[1.04]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="absolute left-2.5 top-2.5 flex gap-1">
            {d.key && <span className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide text-white/90 backdrop-blur-md">{d.key}</span>}
            {!!d.capo && <span className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide text-white/90 backdrop-blur-md">CAPO {d.capo}</span>}
          </div>
          <span className="absolute bottom-3 right-3 flex size-10 translate-y-2 items-center justify-center rounded-full bg-white/95 text-black opacity-0 shadow-xl backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </div>
        <div className="mt-3 flex items-start gap-2 pr-16">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium tracking-tight">{song.title}</div>
            <div className="mt-0.5 truncate text-[12px] text-fg-3">{song.artist || '未知'}</div>
          </div>
        </div>
      </button>
      <div className="absolute bottom-0 right-0 flex items-center">
        <button
          aria-label={song.favorite ? '取消收藏' : '收藏'}
          onClick={() => setFavorite(song.id, !song.favorite)}
          className={cn('flex size-8 items-center justify-center rounded-full transition hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]', song.favorite ? 'text-[#ff5d7a]' : 'text-fg-3 hover:text-fg')}
        >
          <Heart className={cn('size-4', song.favorite && 'fill-current')} />
        </button>
        <SongMenu song={song} />
      </div>
    </motion.div>
  )
})

export const SongRow = memo(function SongRow({ song }: { song: SongRecord }) {
  const navigate = useNavigate()
  const d = song.doc
  return (
    <div
      onClick={() => navigate(`/song/${song.id}`)}
      className="group flex cursor-pointer items-center gap-4 rounded-2xl px-3 py-2.5 transition hover:bg-[color-mix(in_oklab,var(--fg)_4%,transparent)]"
    >
      <Cover title={song.title} artist={song.artist} className="size-11 shrink-0 rounded-[10px] ring-1 ring-inset ring-white/8" showText={false} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{song.title}</div>
        <div className="truncate text-xs text-fg-3">{song.artist || '未知'}</div>
      </div>
      <div className="hidden w-40 gap-1.5 md:flex">
        {song.tags.slice(0, 2).map((t) => (
          <span key={t} className="truncate rounded-full bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] px-2 py-0.5 text-[11px] text-fg-2">
            {t}
          </span>
        ))}
      </div>
      <div className="hidden w-20 text-xs text-fg-2 sm:block">{[d.key, d.capo ? `夹${d.capo}` : ''].filter(Boolean).join(' · ')}</div>
      <div className="hidden w-24 text-right text-xs text-fg-3 lg:block">{timeAgo(song.lastOpenedAt ?? song.updatedAt)}</div>
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label="收藏"
          onClick={() => setFavorite(song.id, !song.favorite)}
          className={cn('flex size-8 items-center justify-center rounded-full', song.favorite ? 'text-[#ff5d7a]' : 'text-fg-3 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100')}
        >
          <Heart className={cn('size-4', song.favorite && 'fill-current')} />
        </button>
        <SongMenu song={song} />
      </div>
    </div>
  )
})
