import { Fragment, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Copy, PenLine, WandSparkles } from 'lucide-react'
import { EXAMPLE_DOC, FORMAT_SPEC, buildPrompt, formatSongJson } from '@/lib/notation/spec'
import { stashDraft } from '@/lib/importer'
import { Button, toast } from '@/components/ui'

/** 极简 Markdown：标题、表格、代码块、列表、行内代码、粗体 */
function renderInline(s: string, key: string): ReactNode {
  const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`'))
      return (
        <code key={`${key}-${i}`} className="rounded-md bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] px-1.5 py-0.5 font-mono text-[0.86em] text-accent">
          {p.slice(1, -1)}
        </code>
      )
    if (p.startsWith('**')) return <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
    return <Fragment key={`${key}-${i}`}>{p}</Fragment>
  })
}

function Markdown({ src }: { src: string }) {
  const blocks = useMemo(() => {
    const lines = src.split('\n')
    const out: ReactNode[] = []
    let i = 0
    while (i < lines.length) {
      const l = lines[i]
      if (l.startsWith('```')) {
        const buf: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
        i++
        out.push(
          <pre key={i} className="my-4 overflow-x-auto rounded-2xl border border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] p-4 font-mono text-[12.5px] leading-relaxed text-fg-2">
            {buf.join('\n')}
          </pre>,
        )
        continue
      }
      if (l.startsWith('|')) {
        const rows: string[][] = []
        while (i < lines.length && lines[i].startsWith('|')) {
          const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim())
          if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells)
          i++
        }
        const [head, ...body] = rows
        out.push(
          <div key={i} className="my-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[color-mix(in_oklab,var(--fg)_4%,transparent)]">
                <tr>
                  {head.map((h, j) => (
                    <th key={j} className="px-3 py-2 font-semibold text-fg-2">
                      {renderInline(h, `h${i}${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="px-3 py-2 align-top text-fg-2 [overflow-wrap:anywhere]">
                        {renderInline(c, `c${i}${ri}${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
      if (l.startsWith('# ')) out.push(<h1 key={i} className="mb-4 text-3xl font-bold tracking-tight">{l.slice(2)}</h1>)
      else if (l.startsWith('## ')) out.push(<h2 key={i} id={l.slice(3)} className="mb-2 mt-10 scroll-mt-6 text-xl font-bold tracking-tight">{l.slice(3)}</h2>)
      else if (l.startsWith('- ')) {
        const items: string[] = []
        while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2))
        out.push(
          <ul key={i} className="my-3 space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
            {items.map((it, j) => (
              <li key={j} className="list-disc marker:text-fg-3">
                {renderInline(it, `l${i}${j}`)}
              </li>
            ))}
          </ul>,
        )
        continue
      } else if (l.trim()) out.push(<p key={i} className="my-3 text-[14px] leading-[1.8] text-fg-2">{renderInline(l, `p${i}`)}</p>)
      i++
    }
    return out
  }, [src])
  return <div>{blocks}</div>
}

export default function Docs() {
  const navigate = useNavigate()
  const toc = FORMAT_SPEC.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3))
  const copy = async (text: string, msg: string) => {
    await navigator.clipboard.writeText(text)
    toast.ok(msg)
  }
  return (
    <div className="mx-auto flex max-w-[1100px] gap-10 px-5 pb-24 pt-6 sm:px-8 lg:pt-10">
      <aside className="sticky top-10 hidden h-fit w-52 shrink-0 lg:block">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">目录</div>
        <nav className="space-y-1">
          {toc.map((t) => (
            <a key={t} href={`#${t}`} onClick={(e) => (e.preventDefault(), document.getElementById(t)?.scrollIntoView({ behavior: 'smooth' }))} className="block rounded-lg px-2 py-1.5 text-[13px] text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] hover:text-fg">
              {t}
            </a>
          ))}
          <a href="#example" onClick={(e) => (e.preventDefault(), document.getElementById('example')?.scrollIntoView({ behavior: 'smooth' }))} className="block rounded-lg px-2 py-1.5 text-[13px] text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_5%,transparent)] hover:text-fg">
            完整示例
          </a>
        </nav>
      </aside>
      <article className="min-w-0 flex-1">
        <div className="mb-8 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={() => copy(FORMAT_SPEC, '格式说明已复制')}>
            复制格式说明
          </Button>
          <Button size="sm" variant="secondary" icon={<WandSparkles className="size-4" />} onClick={() => copy(buildPrompt({ mode: 'auto', hasImages: true }), 'AI 提示词已复制')}>
            复制 AI 提示词
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<PenLine className="size-4" />}
            onClick={() => {
              stashDraft(EXAMPLE_DOC)
              navigate('/edit/new?draft=1')
            }}
          >
            在编辑器中试试示例
          </Button>
        </div>
        <Markdown src={FORMAT_SPEC} />
        <h2 id="example" className="mb-2 mt-10 scroll-mt-6 text-xl font-bold tracking-tight">完整示例</h2>
        <pre className="my-4 overflow-x-auto rounded-2xl border border-line bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] p-4 font-mono text-[12.5px] leading-relaxed text-fg-2">{formatSongJson(EXAMPLE_DOC)}</pre>
      </article>
    </div>
  )
}
