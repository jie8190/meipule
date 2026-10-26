import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileUp, ClipboardPaste, PenLine, Save, ArchiveRestore } from 'lucide-react'
import { useUi } from '@/store/ui'
import { analyzeImport, stashDraft } from '@/lib/importer'
import { createSong, importBackup } from '@/lib/db'
import { Button, Modal, Textarea, toast } from './ui'
import { DiagnosticsList, ScoreSummary } from './Diagnostics'

export function ImportDialog() {
  const { importOpen, importSeed, closeImport } = useUi()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (importOpen) {
      setText(importSeed)
      setDebounced(importSeed)
    }
  }, [importOpen, importSeed])
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250)
    return () => clearTimeout(t)
  }, [text])

  const result = useMemo(() => analyzeImport(debounced), [debounced])

  const readFile = async (f: File) => setText(await f.text())

  const pasteClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText())
    } catch {
      toast.err('无法读取剪贴板，请手动粘贴')
    }
  }

  const save = async () => {
    if (result.kind === 'song') {
      const id = await createSong(result.doc, 'import')
      toast.ok(`已导入「${result.score.title}」`)
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
    if (result.kind !== 'song') return
    stashDraft(result.doc)
    closeImport()
    navigate('/edit/new?draft=1')
  }

  const hasErrors = result.kind === 'song' && result.score.diagnostics.some((d) => d.level === 'error')

  return (
    <Modal open={importOpen} onClose={closeImport} title="导入曲谱" description="粘贴 AI 生成的 JSON，或选择 .json 文件。支持单首曲谱、多首曲谱数组和完整备份。" width={680}>
      <div className="space-y-4">
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'{\n  "title": "曲名",\n  "key": "C",\n  "sections": [ ... ]\n}'}
            spellCheck={false}
            className="h-56 font-mono text-[12.5px] leading-relaxed"
          />
          <div className="absolute bottom-3 right-3 flex gap-2">
            <Button size="sm" variant="secondary" icon={<ClipboardPaste className="size-3.5" />} onClick={pasteClipboard}>
              粘贴
            </Button>
            <Button size="sm" variant="secondary" icon={<FileUp className="size-3.5" />} onClick={() => fileRef.current?.click()}>
              选择文件
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
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
            <ScoreSummary score={result.score} />
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
