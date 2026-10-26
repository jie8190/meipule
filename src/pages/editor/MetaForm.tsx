import { useState } from 'react'
import { Drum, Guitar, Plus, Trash2 } from 'lucide-react'
import type { SongDoc, TrackDoc } from '@/lib/notation/types'
import { KEY_CHOICES, TUNINGS, keyName, noteToPc, mod12 } from '@/lib/music/theory'
import { getChordShape, parseFrets, isValidChord } from '@/lib/music/chords'
import { ChordDiagram } from '@/components/ChordDiagram'
import { Button, cn, Field, Input, Select, Textarea } from '@/components/ui'
import type { DocSetter } from './useDocHistory'

const KEY_OPTIONS = [
  { value: '', label: '未设置' },
  ...KEY_CHOICES.map((k) => ({ value: k, label: `${k} 大调` })),
  ...KEY_CHOICES.map((k) => {
    const m = keyName(mod12(noteToPc(k)! + 9), true)
    return { value: m, label: `${m} 小调` }
  }),
]

export function MetaForm({ doc, set }: { doc: SongDoc; set: DocSetter }) {
  const upd = (patch: Partial<SongDoc>, key: string) => set((d) => ({ ...d, ...patch }), key)
  const tuningVal = typeof doc.tuning === 'string' ? doc.tuning : doc.tuning ? 'custom' : 'standard'
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="曲名" className="col-span-2">
          <Input value={doc.title ?? ''} onChange={(e) => upd({ title: e.target.value }, 'title')} placeholder="曲名" />
        </Field>
        <Field label="歌手 / 作者">
          <Input value={doc.artist ?? ''} onChange={(e) => upd({ artist: e.target.value }, 'artist')} />
        </Field>
        <Field label="专辑">
          <Input value={doc.album ?? ''} onChange={(e) => upd({ album: e.target.value || undefined }, 'album')} />
        </Field>
        <Field label="作曲">
          <Input value={doc.composer ?? ''} onChange={(e) => upd({ composer: e.target.value || undefined }, 'composer')} />
        </Field>
        <Field label="作词">
          <Input value={doc.lyricist ?? ''} onChange={(e) => upd({ lyricist: e.target.value || undefined }, 'lyricist')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="原调（实际音高）" hint="谱上的和弦按指法写">
          <Select value={doc.key ?? ''} onChange={(v) => upd({ key: v || undefined }, 'key')} options={KEY_OPTIONS} />
        </Field>
        <Field label="变调夹">
          <Select value={doc.capo ?? 0} onChange={(v) => upd({ capo: v }, 'capo')} options={Array.from({ length: 12 }, (_, i) => ({ value: i, label: i ? `${i} 品` : '不夹' }))} />
        </Field>
        <Field label="速度 BPM">
          <Input type="number" min={20} max={320} value={doc.tempo ?? 80} onChange={(e) => upd({ tempo: Number(e.target.value) || 80 }, 'tempo')} />
        </Field>
        <Field label="拍号">
          <Select value={doc.time ?? '4/4'} onChange={(v) => upd({ time: v }, 'time')} options={['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'].map((v) => ({ value: v, label: v }))} />
        </Field>
        <Field label="调弦">
          <Select
            value={tuningVal}
            onChange={(v) => upd({ tuning: v === 'standard' ? undefined : v === 'custom' ? doc.tuning : v }, 'tuning')}
            options={[...TUNINGS.map((t) => ({ value: t.id, label: t.name })), ...(tuningVal === 'custom' ? [{ value: 'custom', label: '自定义' }] : [])]}
          />
        </Field>
        <Field label="难度" group>
          <div className="flex h-10 items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`难度 ${n}`}
                onClick={() => upd({ difficulty: doc.difficulty === n ? undefined : n }, 'difficulty')}
                className={cn('h-6 w-7 rounded-md transition', (doc.difficulty ?? 0) >= n ? 'bg-accent-gradient' : 'bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:bg-[color-mix(in_oklab,var(--fg)_14%,transparent)]')}
              />
            ))}
          </div>
        </Field>
      </div>

      <TracksEditor doc={doc} set={set} />

      <Field label="标签" hint="用逗号或空格分隔">
        <Input
          value={(doc.tags ?? []).join('，')}
          onChange={(e) =>
            upd(
              {
                tags: e.target.value
                  .split(/[,，\s]+/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              },
              'tags',
            )
          }
          placeholder="流行，弹唱，入门"
        />
      </Field>
      <Field label="演奏说明">
        <Textarea rows={3} value={doc.notes ?? ''} onChange={(e) => upd({ notes: e.target.value || undefined }, 'notes')} placeholder="比如：副歌扫弦加重，间奏注意闷音" />
      </Field>

      <CustomChords doc={doc} set={set} />
    </div>
  )
}

function CustomChords({ doc, set }: { doc: SongDoc; set: DocSetter }) {
  const [name, setName] = useState('')
  const entries = Object.entries(doc.chords ?? {})
  const setChords = (chords: SongDoc['chords']) => set((d) => ({ ...d, chords: chords && Object.keys(chords).length ? chords : undefined }), 'chords')
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-2">自定义和弦指法</span>
        <span className="text-[11px] text-fg-3">6 位，从 6 弦到 1 弦，x = 不弹</span>
      </div>
      <div className="space-y-2">
        {entries.map(([n, def]) => {
          const fretsStr = typeof def === 'string' ? def : Array.isArray(def) ? def.join(' ') : typeof def.frets === 'string' ? def.frets : def.frets.join(' ')
          const frets = parseFrets(fretsStr)
          return (
            <div key={n} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-2 pr-3">
              <div className="rounded-xl p-1" data-score="paper" style={{ background: 'var(--score-paper)' }}>
                <ChordDiagram shape={frets ? { frets } : null} size={46} fingers={false} frets={4} />
              </div>
              <div className="w-16 text-sm font-bold">{n}</div>
              <Input
                className="flex-1 font-mono"
                value={fretsStr}
                onChange={(e) => setChords({ ...(doc.chords ?? {}), [n]: e.target.value })}
                placeholder="x32010"
              />
              <button aria-label="删除" onClick={() => setChords(Object.fromEntries(entries.filter(([k]) => k !== n)))} className="text-fg-3 hover:text-err">
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="和弦名，如 G 或 Cadd9" className="flex-1" />
        <Button
          icon={<Plus className="size-4" />}
          disabled={!isValidChord(name.trim())}
          onClick={() => {
            const n = name.trim()
            const shape = getChordShape(n)
            setChords({ ...(doc.chords ?? {}), [n]: shape ? shape.frets.map((f) => (f < 0 ? 'x' : f)).join(shape.frets.some((f) => f > 9) ? ' ' : '') : 'x32010' })
            setName('')
          }}
        >
          添加
        </Button>
      </div>
    </div>
  )
}

/** 多轨：增删音轨，设置名字、调弦、变调夹。第一条吉他轨是主轨，小节顶层的伴奏属于它 */
function TracksEditor({ doc, set }: { doc: SongDoc; set: DocSetter }) {
  const tracks = doc.tracks ?? []
  const setTracks = (next: TrackDoc[], key: string) =>
    set((d) => ({ ...d, format: next.length > 1 ? 'meipule/2' : d.format, tracks: next.length ? next : undefined }), key)
  const add = (type: 'guitar' | 'drums') => {
    const base = tracks.length ? tracks : [{ id: 'G1', name: '吉他 1' }]
    const prefix = type === 'drums' ? 'D' : 'G'
    let n = 1
    while (base.some((t) => t.id === `${prefix}${n}`)) n++
    const t: TrackDoc = type === 'drums' ? { id: `${prefix}${n}`, name: `鼓 ${n}`, type } : { id: `${prefix}${n}`, name: `吉他 ${n}` }
    setTracks([...base, t], 'tracks-add')
  }
  const patch = (i: number, p: Partial<TrackDoc>) => setTracks(tracks.map((t, j) => (j === i ? { ...t, ...p } : t)), `track-${i}`)
  const remove = (i: number) => {
    const id = tracks[i].id
    // 连同各小节里这条轨的内容一起删掉
    set((d) => {
      const next = (d.tracks ?? []).filter((_, j) => j !== i)
      return {
        ...d,
        tracks: next.length > 1 ? next : undefined,
        sections: d.sections.map((sec) => {
          const { [id]: _drop, ...secTracks } = sec.tracks ?? {}
          void _drop
          return {
            ...sec,
            tracks: Object.keys(secTracks).length ? secTracks : undefined,
            measures: sec.measures?.map((m) => {
              if (typeof m === 'string' || !m.tracks || !(id in m.tracks)) return m
              const { [id]: _x, ...rest } = m.tracks
              void _x
              return { ...m, tracks: Object.keys(rest).length ? rest : undefined }
            }),
          }
        }),
      }
    }, 'tracks-remove')
  }
  const mainIdx = tracks.findIndex((t) => t.type !== 'drums')
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-2">音轨</span>
        <span className="text-[11px] text-fg-3">{tracks.length > 1 ? '第一条吉他轨是主轨' : '多把吉他、鼓可以分轨写'}</span>
      </div>
      {tracks.length > 1 && (
        <div className="space-y-2">
          {tracks.map((t, i) => {
            const drums = t.type === 'drums'
            const tuningVal = typeof t.tuning === 'string' ? t.tuning : t.tuning ? 'custom' : ''
            return (
              <div key={t.id} className="rounded-2xl border border-line bg-surface-2 p-2.5">
                <div className="flex items-center gap-2">
                  {drums ? <Drum className="size-4 shrink-0 text-fg-2" /> : <Guitar className="size-4 shrink-0 text-fg-2" />}
                  <Input className="flex-1" value={t.name ?? ''} placeholder={t.id} onChange={(e) => patch(i, { name: e.target.value || undefined })} />
                  <span className="w-10 shrink-0 truncate text-center font-mono text-[11px] text-fg-3" title="音轨 id：小节里用它引用这条轨">
                    {t.id}
                  </span>
                  <button aria-label="删除音轨" disabled={i === mainIdx} onClick={() => remove(i)} className="text-fg-3 hover:text-err disabled:opacity-30">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {!drums && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Select
                      value={tuningVal}
                      onChange={(v) => patch(i, { tuning: v === '' ? undefined : v === 'custom' ? t.tuning : v })}
                      options={[
                        { value: '', label: '调弦：同全曲' },
                        ...TUNINGS.map((x) => ({ value: x.id, label: `调弦：${x.name}` })),
                        ...(tuningVal === 'custom' ? [{ value: 'custom', label: '自定义' }] : []),
                      ]}
                    />
                    <Select
                      value={t.capo ?? -1}
                      onChange={(v) => patch(i, { capo: v < 0 ? undefined : v })}
                      options={[{ value: -1, label: '变调夹：同全曲' }, ...Array.from({ length: 13 }, (_, c) => ({ value: c, label: c ? `变调夹 ${c} 品` : '不夹' }))]}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" icon={<Guitar className="size-4" />} onClick={() => add('guitar')}>
          添加吉他轨
        </Button>
        <Button size="sm" variant="secondary" icon={<Drum className="size-4" />} onClick={() => add('drums')}>
          添加鼓轨
        </Button>
      </div>
    </div>
  )
}
