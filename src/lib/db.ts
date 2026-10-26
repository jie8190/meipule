// 本地数据库（IndexedDB）：曲谱与歌单
import Dexie, { type Table } from 'dexie'
import type { SongDoc } from './notation/types'
import { SAMPLES, SAMPLE_LOOP } from '@/samples'

export interface SongViewPrefs {
  shift?: number
  capo?: number
  speed?: number
}

export interface SongRecord {
  id: string
  doc: SongDoc
  title: string
  artist: string
  key?: string
  tags: string[]
  favorite: 0 | 1
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  openCount: number
  view?: SongViewPrefs
  source?: 'sample' | 'ai' | 'import' | 'manual'
}

export interface SetlistRecord {
  id: string
  name: string
  description?: string
  songIds: string[]
  createdAt: number
  updatedAt: number
  hue?: number
}

class MeipuleDB extends Dexie {
  songs!: Table<SongRecord, string>
  setlists!: Table<SetlistRecord, string>
  constructor() {
    super('meipule')
    this.version(1).stores({
      songs: 'id, title, artist, updatedAt, lastOpenedAt, favorite, *tags',
      setlists: 'id, updatedAt',
    })
  }
}

export const db = new MeipuleDB()

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function metaFrom(doc: SongDoc) {
  return {
    title: (doc.title || '未命名曲谱').trim(),
    artist: (doc.artist || '').trim(),
    key: doc.key,
    tags: Array.isArray(doc.tags) ? doc.tags.filter((t) => typeof t === 'string') : [],
  }
}

export async function createSong(doc: SongDoc, source: SongRecord['source'] = 'manual'): Promise<string> {
  const now = Date.now()
  const id = uid()
  await db.songs.add({
    id,
    doc,
    ...metaFrom(doc),
    favorite: 0,
    createdAt: now,
    updatedAt: now,
    openCount: 0,
    source,
  })
  return id
}

export async function updateSongDoc(id: string, doc: SongDoc) {
  await db.songs.update(id, { doc, ...metaFrom(doc), updatedAt: Date.now() })
}

export async function deleteSong(id: string) {
  await db.transaction('rw', db.songs, db.setlists, async () => {
    await db.songs.delete(id)
    const lists = await db.setlists.toArray()
    for (const l of lists) {
      if (l.songIds.includes(id)) await db.setlists.update(l.id, { songIds: l.songIds.filter((s) => s !== id) })
    }
  })
}

export async function touchSong(id: string) {
  const rec = await db.songs.get(id)
  if (!rec) return
  await db.songs.update(id, { lastOpenedAt: Date.now(), openCount: (rec.openCount ?? 0) + 1 })
}

export async function setFavorite(id: string, fav: boolean) {
  await db.songs.update(id, { favorite: fav ? 1 : 0 })
}

export async function saveViewPrefs(id: string, view: SongViewPrefs) {
  await db.songs.update(id, { view })
}

export async function duplicateSong(id: string): Promise<string | null> {
  const rec = await db.songs.get(id)
  if (!rec) return null
  const doc = structuredClone(rec.doc)
  doc.title = `${doc.title}（副本）`
  return createSong(doc, 'manual')
}

const SEED_KEY = 'meipule:seeded:v1'
/** 后来新增的示例：老用户也补上一份（每个只补一次，删掉了就不再出现） */
const LATER_SAMPLES: { key: string; doc: SongDoc }[] = [{ key: 'meipule:seeded:loop', doc: SAMPLE_LOOP }]

export async function seedSamples(force = false) {
  if (!force && localStorage.getItem(SEED_KEY)) {
    for (const { key, doc } of LATER_SAMPLES) {
      if (localStorage.getItem(key)) continue
      localStorage.setItem(key, '1')
      await createSong(structuredClone(doc), 'sample')
    }
    return
  }
  for (const { key } of LATER_SAMPLES) localStorage.setItem(key, '1')
  localStorage.setItem(SEED_KEY, '1')
  const count = await db.songs.count()
  if (count > 0 && !force) return
  const now = Date.now()
  await db.songs.bulkAdd(
    SAMPLES.map((doc, i) => ({
      id: uid(),
      doc: structuredClone(doc),
      ...metaFrom(doc),
      favorite: i === 0 ? 1 : 0,
      createdAt: now - i * 1000,
      updatedAt: now - i * 1000,
      openCount: 0,
      source: 'sample' as const,
    })),
  )
}

// ---------- 备份 ----------

export interface Backup {
  app: 'meipule'
  version: 1
  exportedAt: string
  songs: SongRecord[]
  setlists: SetlistRecord[]
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'meipule',
    version: 1,
    exportedAt: new Date().toISOString(),
    songs: await db.songs.toArray(),
    setlists: await db.setlists.toArray(),
  }
}

export async function importBackup(data: Backup, mode: 'merge' | 'replace'): Promise<{ songs: number; setlists: number }> {
  if (data.app !== 'meipule' || !Array.isArray(data.songs)) throw new Error('不是有效的「没谱了」备份文件')
  await db.transaction('rw', db.songs, db.setlists, async () => {
    if (mode === 'replace') {
      await db.songs.clear()
      await db.setlists.clear()
    }
    await db.songs.bulkPut(data.songs)
    if (Array.isArray(data.setlists)) await db.setlists.bulkPut(data.setlists)
  })
  return { songs: data.songs.length, setlists: data.setlists?.length ?? 0 }
}

// ---------- 歌单 ----------

export async function createSetlist(name: string, songIds: string[] = []): Promise<string> {
  const now = Date.now()
  const id = uid()
  await db.setlists.add({ id, name, songIds, createdAt: now, updatedAt: now, hue: Math.floor(Math.random() * 360) })
  return id
}

export async function addToSetlist(listId: string, songId: string) {
  const l = await db.setlists.get(listId)
  if (!l || l.songIds.includes(songId)) return
  await db.setlists.update(listId, { songIds: [...l.songIds, songId], updatedAt: Date.now() })
}

export async function updateSetlist(id: string, patch: Partial<SetlistRecord>) {
  await db.setlists.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteSetlist(id: string) {
  await db.setlists.delete(id)
}
