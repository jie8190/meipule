import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle, indentOnInput } from '@codemirror/language'
import { linter, lintGutter } from '@codemirror/lint'
import { tags as t } from '@lezer/highlight'

const highlight = HighlightStyle.define([
  { tag: t.propertyName, color: 'var(--accent)' },
  { tag: t.string, color: 'color-mix(in oklab, var(--ok) 85%, var(--fg))' },
  { tag: t.number, color: 'var(--ai-1)' },
  { tag: [t.bool, t.null], color: 'var(--ai-2)' },
  { tag: t.punctuation, color: 'var(--fg-3)' },
  { tag: t.brace, color: 'var(--fg-2)' },
  { tag: t.squareBracket, color: 'var(--fg-2)' },
])

export function CodeEditor({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          json(),
          linter((v) => (v.state.doc.length === 0 ? [] : jsonParseLinter()(v)), { delay: 300 }),
          lintGutter(),
          syntaxHighlighting(highlight),
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.theme({ '&': { color: 'var(--fg)' }, '.cm-content': { caretColor: 'var(--accent)' } }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部值变化（非本编辑器输入）时同步
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur !== value) v.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
  }, [value])

  return <div ref={host} className={className} />
}
