import { useMemo, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { ChordDiagram } from './ChordDiagram'
import { Modal, cn } from './ui'
import { describeChord, fretsToString, getChordShape, getChordVoicings, type ChordShape } from '@/lib/music/chords'
import { STANDARD_TUNING } from '@/lib/music/theory'
import { audio } from '@/lib/audio/engine'

export function strumShape(shape: ChordShape | null, tuning: number[] = STANDARD_TUNING, capo = 0) {
  if (!shape) return
  const notes = shape.frets
    .map((f, i) => (f >= 0 ? { string: 6 - i, midi: tuning[i] + f + capo } : null))
    .filter((x): x is { string: number; midi: number } => !!x)
  audio.previewChord(notes)
}

export function ChordModal({
  name,
  onClose,
  tuning = STANDARD_TUNING,
  capo = 0,
  shape: givenShape,
}: {
  name: string | null
  onClose: () => void
  tuning?: number[]
  capo?: number
  shape?: ChordShape | null
}) {
  const [pick, setPick] = useState(0)
  const voicings = useMemo(() => {
    if (!name) return []
    const list = getChordVoicings(name, tuning, 8)
    if (givenShape && !list.some((v) => v.frets.join() === givenShape.frets.join())) list.unshift(givenShape)
    return list
  }, [name, tuning, givenShape])
  const main = voicings[pick] ?? getChordShape(name ?? '', { tuning })
  return (
    <Modal open={!!name} onClose={() => (onClose(), setPick(0))} width={520} bare>
      {name && (
        <div className="p-6">
          <div className="flex items-start gap-6">
            <div className="rounded-3xl p-3" data-score="paper" style={{ background: 'var(--score-paper)' }}>
              <ChordDiagram shape={main} size={150} />
            </div>
            <div className="min-w-0 flex-1 pt-2">
              <div className="text-4xl font-bold tracking-tight">{name}</div>
              <div className="mt-2 text-sm text-fg-2">{describeChord(name)}</div>
              {main && <div className="mt-1 font-mono text-xs text-fg-3">{fretsToString(main.frets)}</div>}
              <button
                onClick={() => strumShape(main, tuning, capo)}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-accent-gradient px-4 text-sm font-semibold text-accent-fg transition active:scale-95"
              >
                <Volume2 className="size-4" /> 试听
              </button>
            </div>
          </div>
          {voicings.length > 1 && (
            <>
              <div className="mb-2 mt-6 text-xs font-semibold text-fg-3">其它按法</div>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {voicings.map((v, i) => (
                  <button
                    key={v.frets.join()}
                    onClick={() => {
                      setPick(i)
                      strumShape(v, tuning, capo)
                    }}
                    data-score="paper"
                    className={cn('shrink-0 rounded-2xl p-1.5 ring-2 transition', i === pick ? 'ring-accent' : 'ring-transparent hover:ring-line-3')}
                    style={{ background: 'var(--score-paper)' }}
                  >
                    <ChordDiagram shape={v} size={64} fingers={false} frets={4} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
