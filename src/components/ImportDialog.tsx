import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileUp, ClipboardPaste, PenLine, Save, ArchiveRestore, Info } from 'lucide-react'
import { useUi } from '@/store/ui'
import { analyzeImport, stashDraft } from '@/lib/importer'
import { createSong, importBackup } from '@/lib/db'
import { formatSongJson } from '@/lib/notation/spec'
import { importScoreFile, SCORE_FILE_RE } from '@/lib/notation/fromScoreFile'
import { Button, Input, Modal, Spinner, Textarea, toast } from './ui'
import { DiagnosticsList, ScoreSummary } from './Diagnostics'

/**
 * 读一个导入文件：Guitar Pro / MusicXML 转成曲谱 JSON（alphaTab 在 importScoreFile 里用到时才加载），其它按文字读。
 * 返回要放进输入框的文字，以及转换时略过的内容。
 */
export async function readImportFile(f: File): Promise<{ text: string; notes: string[] }> {
  if (SCORE_FILE_RE.test(f.name)) {
    const { doc, notes } = await importScoreFile(f.name, new Uint8Array(await f.arrayBuffer()))
    return { text: formatSongJson(doc), notes }
  }
  return { text: await f.text(), notes: [] }
}

export function ImportDialog() {
  const { importOpen, importSeed, closeImport } = useUi()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  /** 从乐谱文件转换来的：转换时略过的内容；null 表示是用户粘贴、输入的 */
  const [fileNotes, setFileNotes] = useState<string[] | null>(null)
  const [reading, setReading] = useState(false)
  const [title, setTitle] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (importOpen) {
      setText(importSeed)
      setDebounced(importSeed)
      setFileNotes(useUi.getState().importNotes)
      setTitle(null)
    }
  }, [importOpen, importSeed])
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250)
    return () => clearTimeout(t)
  }, [text])

  const result = useMemo(() => analyzeImport(debounced), [debounced])
  // 文字谱、Guitar Pro 转换来的曲谱：曲名可能没认出来，允许直接改
  const converted = result.kind === 'song' && (result.from === 'text' || fileNotes !== null)
  const notes = [...(result.kind === 'song' ? (result.notes ?? []) : []), ...(fileNotes ?? [])]
  const docOf = () => (result.kind === 'song' ? { ...result.doc, title: title?.trim() || result.doc.title } : null)

  const readFile = async (f: File) => {
    setReading(true)
    try {
      const r = await readImportFile(f)
      setText(r.text)
      setFileNotes(SCORE_FILE_RE.test(f.name) ? r.notes : null)
      setTitle(null)
    } catch (e) {
      toast.err((e as Error).message)
    } finally {
      setReading(false)
    }
  }

  const pasteClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText())
      setFileNotes(null)
      setTitle(null)
    } catch {
      toast.err('无法读取剪贴板，请手动粘贴')
    }
  }

  const save = async () => {
    const doc = docOf()
    if (doc) {
      const id = await createSong(doc, 'import')
      toast.ok(`已导入「${doc.title}」`)
      closeImport()
      navigate(`/song/${id}`)
    } else if (result.kind === 'songs') {
      for (const d of result.docs) await createSong(d, 'import')
      toast.ok(`已导入 ${result.docs.length} 首曲谱`)
      closeImport()
      navigate('/')
    } else if (result.kind === 'backup') {
      const r = await importBackup(result.backup, 'merge')
      toast.ok(`已恢复 ${r.songs} 首曲谱、${r.setlists} 个歌单`)
      closeImport()
      navigate('/')
    }
  }

  const openInEditor = () => {
    const doc = docOf()
    if (!doc) return
    stashDraft(doc)
    closeImport()
    navigate('/edit/new?draft=1')
  }

  const hasErrors = result.kind === 'song' && result.score.diagnostics.some((d) => d.level === 'error')

  return (
    <Modal
      open={importOpen}
      onClose={closeImport}
      title="导入曲谱"
      description="粘贴网页、App 里复制的文字谱（和弦在歌词上方、[C] 内嵌和弦、ChordPro、文字六线谱）或曲谱 JSON；也可以选择 Guitar Pro、MusicXML 文件。都在本地转换，不需要 AI。"
      width={680}
    >
      <div className="space-y-4">
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'[主歌]\nC     Am\n好一朵美丽的茉莉花\nF         C\n芬芳美丽满枝桠\n\n也可以粘贴曲谱 JSON'}
            spellCheck={false}
            className="h-56 font-mono text-[12.5px] leading-relaxed"
          />
          {reading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-[color-mix(in_oklab,var(--surface)_80%,transparent)] text-sm text-fg-2">
              <Spinner className="size-4" /> 正在读取乐谱文件…
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <Button size="sm" variant="secondary" icon={<ClipboardPaste className="size-3.5" />} onClick={pasteClipboard}>
              粘贴
            </Button>
            <Button size="sm" variant="secondary" icon={<FileUp className="size-3.5" />} onClick={() => fileRef.current?.click()} disabled={reading}>
              选择文件
            </Button>
          </div>
          {/* 不限制文件类型：安卓的文件选择器不认识 .gp5 这类扩展名，会把它们变成灰色选不了 */}
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readFile(f)
              e.target.value = ''
            }}
          />
        </div>

        {result.kind === 'error' && (
          <div className="rounded-xl bg-[color-mix(in_oklab,var(--err)_10%,transparent)] px-3 py-2.5 text-[13px] text-err">{result.message}</div>
        )}
        {result.kind === 'song' && (
          <>
            {converted && (
              <label className="flex items-center gap-3">
                <span className="shrink-0 text-[13px] font-medium text-fg-2">曲名</span>
                <Input className="flex-1" value={title ?? result.doc.title} onChange={(e) => setTitle(e.target.value)} />
              </label>
            )}
            <ScoreSummary score={{ ...result.score, title: title?.trim() || result.score.title }} />
            {notes.length > 0 && (
              <div className="space-y-1 rounded-xl bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] px-3 py-2.5 text-xs leading-relaxed text-fg-2">
                {notes.map((n) => (
                  <div key={n} className="flex gap-2">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
                    {n}
                  </div>
                ))}
              </div>
            )}
            <DiagnosticsList diags={result.score.diagnostics} />
          </>
        )}
        {result.kind === 'songs' && (
          <div className="rounded-2xl border border-line bg-surface-2 p-4 text-sm">
            识别到 <b>{result.docs.length}</b> 首曲谱：{result.scores.map((s) => s.title).join('、')}
          </div>
        )}
        {result.kind === 'backup' && (
          <div className="rounded-2xl border border-line bg-surface-2 p-4 text-sm">
            这是一个完整备份（{result.backup.songs.length} 首曲谱、{result.backup.setlists?.length ?? 0} 个歌单，导出于{' '}
            {new Date(result.backup.exportedAt).toLocaleString()}）。将与现有数据合并。
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {result.kind === 'song' && (
            <Button variant="ghost" icon={<PenLine className="size-4" />} onClick={openInEditor}>
              在编辑器中打开
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!(result.kind === 'song' || result.kind === 'songs' || result.kind === 'backup')}
            icon={result.kind === 'backup' ? <ArchiveRestore className="size-4" /> : <Save className="size-4" />}
            onClick={save}
            title={hasErrors ? '有错误也可以先保存，之后在编辑器里修改' : undefined}
          >
            {result.kind === 'backup' ? '恢复备份' : hasErrors ? '仍然保存' : '保存到曲库'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
