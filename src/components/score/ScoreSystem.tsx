import { memo, type ReactNode } from 'react'
import type { CompiledMeasure, DrumHit, DurSpec, GuitarBeat, MelodyNote, Score } from '@/lib/notation/types'
import { DiagramGlyph } from '../ChordDiagram'
import { textWidth, tickToX, type Lane, type LayoutOptions, type ScoreLayout, type SystemLayout } from './layout'

interface Props {
  score: Score
  sys: SystemLayout
  layout: ScoreLayout
  opts: LayoutOptions
  onChordClick?: (name: string) => void
}

const beamCount = (base: number) => (base >= 32 ? 3 : base >= 16 ? 2 : base >= 8 ? 1 : 0)

/** 节奏行能画的东西：吉他拍或鼓的击打 */
type RhythmItem = { tick: number; dur: number; durSpec: DurSpec; kind: string }

export const ScoreSystem = memo(function ScoreSystem({ score, sys, layout, opts, onChordClick }: Props) {
  const { k } = layout
  const s = k.s
  const hasStaff = sys.hasStaff
  const hasMelody = sys.hasMelody
  const lanes = sys.lanes
  const sysW = sys.width
  const out: ReactNode[] = []
  let key = 0
  const K = () => key++
  /** 鼓谱那条线的 y */
  const drumLine = (L: Lane) => L.staffTop + 8 * s

  // ---------- 段落标签 ----------
  if (sys.showLabel) {
    const label = sys.sectionName
    const lw = textWidth(label, 12.5 * s, 650) + 22 * s
    out.push(
      <g key={K()} className="score-label">
        <rect x={0} y={4 * s} width={lw} height={21 * s} rx={10.5 * s} fill="var(--score-label-bg)" />
        <text x={lw / 2} y={18.5 * s} textAnchor="middle" fontSize={12.5 * s} fontWeight={650} fill="var(--score-label-ink)">
          {label}
        </text>
        {sys.repeat > 1 && (
          <text x={lw + 8 * s} y={18.5 * s} fontSize={12 * s} fontWeight={700} fill="var(--score-accent)">
            ×{sys.repeat}
          </text>
        )}
      </g>,
    )
    const note = score.sections[sys.section]?.note
    if (note) {
      out.push(
        <text key={K()} x={lw + (sys.repeat > 1 ? 34 : 10) * s} y={18.5 * s} fontSize={11.5 * s} fill="var(--score-dim)">
          {note}
        </text>,
      )
    }
  }

  // ---------- 各音轨的谱线 ----------
  const firstNo = sys.measures[0].index + 1
  /** 各层轨名占的宽度，本轨标注要排在它后面 */
  const headerW = new Map<number, number>()
  lanes.forEach((L, li) => {
    const tk = score.tracks[L.track]
    if (L.type === 'drums') {
      const y = drumLine(L)
      out.push(<line key={K()} x1={0} x2={sysW} y1={y} y2={y} stroke="var(--score-line)" strokeWidth={0.9} />)
      // 打击乐谱号：两条竖粗线
      const cx = k.clef / 2 + 1 * s
      for (const dx of [-2.6, 2.6])
        out.push(<rect key={K()} x={cx + dx * s - 1.3 * s} y={y - 7 * s} width={2.6 * s} height={14 * s} fill="var(--score-ink)" opacity={0.85} />)
    } else {
      for (let i = 1; i <= 6; i++) {
        const y = L.staffTop + (i - 1) * k.gap
        out.push(<line key={K()} x1={0} x2={sysW} y1={y} y2={y} stroke="var(--score-line)" strokeWidth={0.9} />)
      }
      const cx = k.clef / 2 + 1 * s
      ;['T', 'A', 'B'].forEach((ch, i) => {
        out.push(
          <text key={K()} x={cx} y={L.staffTop + k.gap * (1.15 + i * 1.35)} textAnchor="middle" fontSize={k.gap * 1.05} fontWeight={800} fill="var(--score-ink)" opacity={0.85}>
            {ch}
          </text>,
        )
      })
      out.push(<line key={K()} x1={0.5} x2={0.5} y1={L.staffTop} y2={L.staffBot} stroke="var(--score-bar)" strokeWidth={1} />)
    }
    if (sys.multiTrack) {
      // 轨名；段落第一行顺便注明变调夹和调弦
      const extra =
        sys.isSectionStart && tk.type === 'guitar'
          ? [tk.capo ? `Capo ${tk.capo}` : '', tk.tuningName !== '标准' ? tk.tuningName : ''].filter(Boolean).join(' · ')
          : ''
      const name = extra ? `${tk.name} · ${extra}` : tk.name
      headerW.set(L.track, textWidth(name, 10 * s, 700) + (li === 0 ? 8 * s + textWidth(String(firstNo), 10 * s, 500) : 0))
      out.push(
        <text key={K()} x={0} y={L.top + 10 * s} fontSize={10 * s} fontWeight={700} fill="var(--score-dim)">
          {name}
          {li === 0 && (
            <tspan fontWeight={500} dx={8 * s}>
              {firstNo}
            </tspan>
          )}
        </text>,
      )
    } else if (li === 0) {
      out.push(
        <text key={K()} x={1} y={L.staffTop - 5 * s} fontSize={9.5 * s} fill="var(--score-dim)" fontWeight={500}>
          {firstNo}
        </text>,
      )
    }
  })
  // 多层谱线用一条竖线连起来
  if (lanes.length > 1) {
    out.push(
      <line key={K()} x1={0.5} x2={0.5} y1={lanes[0].staffTop} y2={lanes[lanes.length - 1].staffBot} stroke="var(--score-bar)" strokeWidth={1.4} />,
    )
  }

  // 小节线的范围：每层谱线各画一段；没有谱线时画在简谱行或歌词行
  const lyricRows = Math.max(1, sys.verses)
  const barSpans: [number, number][] = lanes.length
    ? lanes.map((L): [number, number] => (L.type === 'drums' ? [drumLine(L) - 9 * s, drumLine(L) + 9 * s] : [L.staffTop, L.staffBot]))
    : hasMelody
      ? [[sys.rows.melody + 2 * s, sys.rows.melody + 28 * s]]
      : [[sys.rows.lyrics + 2 * s, sys.rows.lyrics + lyricRows * 22 * s]]

  sys.measures.forEach((ml, mIdx) => {
    const m = score.measures[ml.index]
    const xAt = (tick: number) => tickToX(ml, m.ticks, tick)

    // 拍号
    if (m.showTime) {
      const tx = ml.x + ml.lead - k.timeSig / 2 + 2 * s
      for (const L of lanes) {
        if (L.type === 'drums') {
          const y = drumLine(L)
          out.push(
            <g key={K()} fontWeight={800} fill="var(--score-ink)" textAnchor="middle" fontSize={k.gap * 1.25}>
              <text x={tx} y={y - 1.5 * s}>{m.timeNum}</text>
              <text x={tx} y={y + k.gap * 1.05}>{m.timeDen}</text>
            </g>,
          )
        } else {
          out.push(
            <g key={K()} fontWeight={800} fill="var(--score-ink)" textAnchor="middle" fontSize={k.gap * 1.9}>
              <text x={tx} y={L.staffTop + k.gap * 2.25}>{m.timeNum}</text>
              <text x={tx} y={L.staffTop + k.gap * 4.55}>{m.timeDen}</text>
            </g>,
          )
        }
      }
      if (!lanes.length && hasMelody) {
        out.push(
          <text key={K()} x={tx} y={sys.rows.melody + 20 * s} textAnchor="middle" fontSize={11 * s} fontWeight={700} fill="var(--score-dim)">
            {m.timeNum}/{m.timeDen}
          </text>,
        )
      }
    }

    // 反复记号（段落开头）
    if (mIdx === 0 && sys.isSectionStart && sys.repeat > 1 && (hasStaff || hasMelody)) {
      const rx = ml.x + ml.lead + 2 * s
      for (const [top, bot] of barSpans) out.push(...repeatSign(rx, top, bot, 'start', s, K))
    }

    // 文字标注
    if (m.text) {
      out.push(
        <text key={K()} x={ml.xs[0] - 6 * s} y={sys.rows.text + 12 * s} fontSize={11 * s} fontStyle="italic" fill="var(--score-dim)">
          {m.text}
        </text>,
      )
    }

    // 和弦名 + 和弦图
    if (opts.showChordNames) {
      for (const c of m.chords) {
        const cx = xAt(c.tick)
        out.push(
          <g
            key={K()}
            className={onChordClick ? 'score-chord' : undefined}
            onClick={onChordClick ? (e) => (e.stopPropagation(), onChordClick(c.name)) : undefined}
          >
            <rect
              x={cx - k.diagramW / 2 - 3 * s}
              y={sys.rows.chord}
              width={k.diagramW + 6 * s}
              height={Math.max(20 * s, sys.rows.staff - sys.rows.chord - 4 * s)}
              fill="transparent"
            />
            <text x={cx} y={sys.rows.chord + 14 * s} textAnchor="middle" fontSize={k.chordFont} fontWeight={700} fill={c.valid ? 'var(--score-chord)' : 'var(--score-error)'}>
              {c.name}
            </text>
            {opts.showDiagrams && <DiagramGlyph shape={c.shape} x={cx} y={sys.rows.diagram} w={k.diagramW * 0.8} h={k.diagramH - 2 * s} frets={4} />}
          </g>,
        )
      }
    }

    // 各音轨内容
    for (const L of lanes) {
      const part = m.parts[L.track]
      if (!part) continue
      if (part.text) {
        const nameW = (headerW.get(L.track) ?? 0) + 10 * s
        out.push(
          <text key={K()} x={Math.max(ml.xs[0] - 6 * s, nameW)} y={L.top + 10 * s} fontSize={10.5 * s} fontStyle="italic" fill="var(--score-dim)">
            {part.text}
          </text>,
        )
      }
      if (L.type === 'drums') drawDrums(part.drums, xAt, L, m)
      else {
        drawGuitar(part.guitar, xAt, L.staffTop)
        drawRhythm(part.guitar, xAt, L.staffBot + 5 * s, L.staffBot + 25 * s, m)
      }
    }
    if (hasMelody) drawMelody(m, xAt)
    if (opts.showLyrics) drawLyrics(m, xAt)

    // 小节线
    const bx = ml.endX
    const sectionEnd = sys.isSectionEnd && mIdx === sys.measures.length - 1
    for (const [barTop, barBot] of barSpans) {
      if (sectionEnd && sys.repeat > 1) out.push(...repeatSign(bx, barTop, barBot, 'end', s, K))
      else if (sectionEnd) {
        out.push(<line key={K()} x1={bx - 4.5 * s} x2={bx - 4.5 * s} y1={barTop} y2={barBot} stroke="var(--score-bar)" strokeWidth={1} />)
        out.push(<rect key={K()} x={bx - 2.6 * s} y={barTop} width={2.6 * s} height={barBot - barTop} fill="var(--score-bar)" />)
      } else out.push(<line key={K()} x1={bx - 0.5} x2={bx - 0.5} y1={barTop} y2={barBot} stroke="var(--score-bar)" strokeWidth={1} />)
    }
  })

  // ---------- 绘制函数 ----------

  function drawGuitar(beats: GuitarBeat[], xAt: (t: number) => number, staffTop: number) {
    const lineY = (str: number) => staffTop + (str - 1) * k.gap
    const lastOn = new Map<number, { x: number; fret: number }>()
    for (const g of beats) {
      const x = xAt(g.tick)
      if (g.kind === 'notes') {
        for (const n of g.notes) {
          const y = lineY(n.string)
          const label = n.dead ? '×' : n.harmonic ? `<${n.fret}>` : String(n.fret)
          const tw = textWidth(label, k.fret, 650) + 3 * s
          out.push(<rect key={K()} x={x - tw / 2} y={y - k.fret * 0.5} width={tw} height={k.fret} fill="var(--score-bg)" />)
          out.push(
            <text key={K()} x={x} y={y + k.fret * 0.36} textAnchor="middle" fontSize={k.fret} fontWeight={650} fill="var(--score-ink)">
              {label}
            </text>,
          )
          const prev = lastOn.get(n.string)
          if (n.tech && prev) {
            const x1 = prev.x + 5 * s
            const x2 = x - 5 * s
            if (n.tech === 'h' || n.tech === 'p') {
              const yy = y - k.fret * 0.62
              out.push(
                <path key={K()} d={`M${x1},${yy} Q${(x1 + x2) / 2},${yy - 8 * s} ${x2},${yy}`} fill="none" stroke="var(--score-ink)" strokeWidth={0.9} opacity={0.8} />,
              )
              out.push(
                <text key={K()} x={(x1 + x2) / 2} y={yy - 7 * s} textAnchor="middle" fontSize={8 * s} fontWeight={700} fill="var(--score-accent)">
                  {n.tech.toUpperCase()}
                </text>,
              )
            } else if (n.tech === 's') {
              const up = n.fret > prev.fret
              out.push(
                <line key={K()} x1={x1} y1={y + (up ? 3 : -3) * s} x2={x2} y2={y + (up ? -3 : 3) * s} stroke="var(--score-ink)" strokeWidth={1} />,
              )
            }
          }
          if (n.tech === 'b') {
            const bx = x + 6 * s
            out.push(
              <g key={K()} stroke="var(--score-ink)" fill="none" strokeWidth={1}>
                <path d={`M${bx},${y} Q${bx + 7 * s},${y} ${bx + 7 * s},${staffTop - 6 * s}`} />
                <path d={`M${bx + 4.5 * s},${staffTop - 2 * s} L${bx + 7 * s},${staffTop - 7 * s} L${bx + 9.5 * s},${staffTop - 2 * s}`} />
              </g>,
            )
            out.push(
              <text key={K()} x={bx + 7 * s} y={staffTop - 9 * s} textAnchor="middle" fontSize={8 * s} fill="var(--score-ink)">
                full
              </text>,
            )
          }
          if (n.vibrato) {
            const vy = staffTop - 7 * s
            let d = `M${x - 6 * s},${vy}`
            for (let i = 0; i < 4; i++) d += ` q${1.5 * s},${-2.5 * s} ${3 * s},0 q${1.5 * s},${2.5 * s} ${3 * s},0`
            out.push(<path key={K()} d={d} fill="none" stroke="var(--score-ink)" strokeWidth={1} />)
          }
          if (n.accent) {
            out.push(
              <text key={K()} x={x} y={staffTop - 5 * s} textAnchor="middle" fontSize={11 * s} fontWeight={700} fill="var(--score-ink)">
                &gt;
              </text>,
            )
          }
          lastOn.set(n.string, { x, fret: n.fret })
        }
      } else if (g.kind === 'strum' && g.strum) {
        const st = g.strum
        const yTop = lineY(st.to) - 3 * s
        const yBot = lineY(st.from) + 3 * s
        const color = 'var(--score-ink)'
        if (st.dir === 'chop') {
          const cy = (yTop + yBot) / 2
          const r = Math.min(9 * s, (yBot - yTop) / 2)
          out.push(<rect key={K()} x={x - r - 2} y={cy - r - 2} width={2 * r + 4} height={2 * r + 4} fill="var(--score-bg)" />)
          out.push(
            <g key={K()} stroke={color} strokeWidth={2.2 * s} strokeLinecap="round">
              <line x1={x - r * 0.7} y1={cy - r * 0.7} x2={x + r * 0.7} y2={cy + r * 0.7} />
              <line x1={x - r * 0.7} y1={cy + r * 0.7} x2={x + r * 0.7} y2={cy - r * 0.7} />
            </g>,
          )
        } else {
          const up = st.dir === 'down' // 下扫：低音弦 → 高音弦，在谱面上箭头朝上
          const tipY = up ? yTop : yBot
          const tailY = up ? yBot : yTop
          const ah = 6 * s
          const aw = 4 * s
          const w = (st.light ? 1.3 : 1.8) * s
          out.push(<rect key={K()} x={x - aw - 1} y={yTop - 1} width={2 * aw + 2} height={yBot - yTop + 2} fill="var(--score-bg)" />)
          out.push(
            <line key={K()} x1={x} x2={x} y1={tailY} y2={up ? tipY + ah * 0.8 : tipY - ah * 0.8} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={st.light ? 0.75 : 1} />,
          )
          out.push(
            <path
              key={K()}
              d={up ? `M${x - aw},${tipY + ah} L${x},${tipY} L${x + aw},${tipY + ah} Z` : `M${x - aw},${tipY - ah} L${x},${tipY} L${x + aw},${tipY - ah} Z`}
              fill={color}
              opacity={st.light ? 0.75 : 1}
            />,
          )
          if (st.accent) {
            out.push(
              <text key={K()} x={x} y={staffTop - 5 * s} textAnchor="middle" fontSize={11 * s} fontWeight={700} fill={color}>
                &gt;
              </text>,
            )
          }
        }
      }
    }
  }

  /** 节奏符干和连梁；stemTop 可按拍指定符干起点（鼓谱从符头往下画） */
  function drawRhythm(
    items: RhythmItem[],
    xAt: (t: number) => number,
    y1: number,
    y2: number,
    m: CompiledMeasure,
    stemTop?: (g: RhythmItem) => number,
  ) {
    const beats = items.filter((g) => g.kind !== 'hold')
    const window = m.timeDen === 8 && m.timeNum % 3 === 0 ? 720 : 480
    // 连梁分组
    const groups: RhythmItem[][] = []
    let cur: RhythmItem[] = []
    let curWin = -1
    for (const g of beats) {
      const short = g.kind !== 'rest' && beamCount(g.durSpec.base) > 0
      const win = Math.floor(g.tick / window)
      const end = g.tick + g.dur
      const fits = end <= (win + 1) * window
      if (short && fits && win === curWin && cur.length) cur.push(g)
      else {
        if (cur.length) groups.push(cur)
        cur = short && fits ? [g] : []
        curWin = short && fits ? win : -1
        if (!(short && fits)) groups.push([g])
      }
    }
    if (cur.length) groups.push(cur)

    for (const grp of groups) {
      for (const g of grp) {
        const x = xAt(g.tick)
        if (g.kind === 'rest') {
          out.push(restGlyph(x, (y1 + y2) / 2, g.durSpec.base, s, K()))
          continue
        }
        const base = g.durSpec.base
        if (base >= 2) {
          const top = stemTop ? stemTop(g) : y1
          const yEnd = base === 2 && !stemTop ? y1 + 11 * s : y2
          out.push(<line key={K()} x1={x} x2={x} y1={top} y2={yEnd} stroke="var(--score-ink)" strokeWidth={1.1 * s} />)
        }
        if (g.durSpec.dots) {
          for (let d = 0; d < g.durSpec.dots; d++)
            out.push(<circle key={K()} cx={x + (4 + d * 3.5) * s} cy={y2 - 3 * s} r={1.3 * s} fill="var(--score-ink)" />)
        }
      }
      const bc = grp.map((g) => beamCount(g.durSpec.base))
      if (grp.length >= 2) {
        const xs = grp.map((g) => xAt(g.tick))
        for (let level = 0; level < 3; level++) {
          const by = y2 - level * 4.5 * s
          let i = 0
          while (i < grp.length) {
            if (bc[i] <= level) {
              i++
              continue
            }
            let j = i
            while (j + 1 < grp.length && bc[j + 1] > level) j++
            if (j > i) {
              out.push(<rect key={K()} x={xs[i] - 0.55 * s} y={by - 2.6 * s} width={xs[j] - xs[i] + 1.1 * s} height={2.6 * s} fill="var(--score-ink)" />)
            } else if (level > 0) {
              const dir = i === grp.length - 1 ? -1 : 1
              const x0 = dir > 0 ? xs[i] : xs[i] - 6 * s
              out.push(<rect key={K()} x={x0} y={by - 2.6 * s} width={6 * s} height={2.6 * s} fill="var(--score-ink)" />)
            }
            i = j + 1
          }
        }
        if (grp.some((g) => g.durSpec.triplet)) {
          out.push(
            <text key={K()} x={(xs[0] + xs[xs.length - 1]) / 2} y={y2 + 10 * s} textAnchor="middle" fontSize={9 * s} fontStyle="italic" fill="var(--score-dim)">
              3
            </text>,
          )
        }
      } else if (grp.length === 1 && grp[0].kind !== 'rest' && bc[0] > 0) {
        const x = xAt(grp[0].tick)
        for (let l = 0; l < bc[0]; l++) {
          const fy = y2 - l * 4.5 * s
          out.push(<path key={K()} d={`M${x},${fy} q${5 * s},${-2 * s} ${6 * s},${-8 * s}`} fill="none" stroke="var(--score-ink)" strokeWidth={1.4 * s} />)
        }
      }
    }
  }

  /** 鼓谱：镲在线上方（× 符头），军鼓/拍弦在线上，底鼓/通鼓在线下 */
  function drawDrums(hits: DrumHit[], xAt: (t: number) => number, L: Lane, m: CompiledMeasure) {
    const y0 = drumLine(L)
    const headY = (inst: string) => (inst === 'H' || inst === 'O' || inst === 'C' ? y0 - 7 * s : inst === 'K' ? y0 + 7 * s : inst === 'T' ? y0 + 3.5 * s : y0)
    for (const h of hits) {
      if (h.kind !== 'hit') continue
      const x = xAt(h.tick)
      const top = Math.min(...h.notes.map((n) => headY(n.inst)))
      for (const n of h.notes) {
        const y = headY(n.inst)
        const op = n.light ? 0.55 : 1
        if (n.inst === 'H' || n.inst === 'O' || n.inst === 'C' || n.inst === 'X') {
          const r = 3.2 * s
          out.push(
            <g key={K()} stroke="var(--score-ink)" strokeWidth={1.4 * s} strokeLinecap="round" opacity={op}>
              <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
              <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
            </g>,
          )
          if (n.inst === 'O') out.push(<circle key={K()} cx={x} cy={y - 7 * s} r={2.3 * s} fill="none" stroke="var(--score-ink)" strokeWidth={1 * s} />)
          if (n.inst === 'C') out.push(<line key={K()} x1={x - 5 * s} x2={x + 5 * s} y1={y - 5 * s} y2={y - 5 * s} stroke="var(--score-ink)" strokeWidth={1 * s} />)
        } else {
          out.push(<ellipse key={K()} cx={x} cy={y} rx={4.3 * s} ry={3.1 * s} transform={`rotate(-20 ${x} ${y})`} fill="var(--score-ink)" opacity={op} />)
        }
      }
      if (h.notes.some((n) => n.accent)) {
        out.push(
          <text key={K()} x={x} y={Math.min(top, y0 - 7 * s) - 6 * s} textAnchor="middle" fontSize={11 * s} fontWeight={700} fill="var(--score-ink)">
            &gt;
          </text>,
        )
      }
    }
    // 符干从最低的符头往下接到连梁
    const lowest = (g: RhythmItem) => Math.max(...(g as DrumHit).notes.map((n) => headY(n.inst))) + 2.5 * s
    drawRhythm(hits, xAt, y0 + 12 * s, y0 + 30 * s, m, lowest)
  }

  function drawMelody(m: CompiledMeasure, xAt: (t: number) => number) {
    const base = sys.rows.melody + 21 * s
    const fs = k.jianpu
    const window = m.timeDen === 8 && m.timeNum % 3 === 0 ? 720 : 480
    const lines = (n: MelodyNote) => (n.kind === 'hold' ? 0 : beamCount(n.durSpec.base))
    for (const n of m.melody) {
      const x = xAt(n.tick)
      if (n.kind === 'hold') {
        out.push(<line key={K()} x1={x - 4.5 * s} x2={x + 4.5 * s} y1={base - 5 * s} y2={base - 5 * s} stroke="var(--score-ink)" strokeWidth={1.6 * s} strokeLinecap="round" />)
        continue
      }
      out.push(
        <text key={K()} x={x} y={base} textAnchor="middle" fontSize={fs} fontWeight={600} fill={n.kind === 'rest' ? 'var(--score-dim)' : 'var(--score-ink)'}>
          {n.degree}
        </text>,
      )
      if (n.acc) {
        out.push(
          <text key={K()} x={x - 7.5 * s} y={base - 8 * s} textAnchor="middle" fontSize={10 * s} fontWeight={600} fill="var(--score-ink)">
            {n.acc > 0 ? '♯' : '♭'}
          </text>,
        )
      }
      for (let i = 0; i < n.octave; i++) out.push(<circle key={K()} cx={x} cy={base - fs * 0.86 - i * 4 * s} r={1.5 * s} fill="var(--score-ink)" />)
      const u = lines(n)
      for (let i = 0; i < -n.octave; i++) out.push(<circle key={K()} cx={x} cy={base + 5.5 * s + u * 3.6 * s + i * 4 * s} r={1.5 * s} fill="var(--score-ink)" />)
      if (n.dotted || n.durSpec.dots) out.push(<circle key={K()} cx={x + 7 * s} cy={base - 4.5 * s} r={1.5 * s} fill="var(--score-ink)" />)
    }
    // 减时线（下划线）
    const notes = m.melody.filter((n) => n.kind !== 'hold')
    let i = 0
    while (i < notes.length) {
      if (lines(notes[i]) === 0) {
        i++
        continue
      }
      const win = Math.floor(notes[i].tick / window)
      let j = i
      while (j + 1 < notes.length && lines(notes[j + 1]) > 0 && Math.floor(notes[j + 1].tick / window) === win) j++
      for (let level = 0; level < 3; level++) {
        let a = i
        while (a <= j) {
          if (lines(notes[a]) <= level) {
            a++
            continue
          }
          let b = a
          while (b + 1 <= j && lines(notes[b + 1]) > level) b++
          const xa = xAt(notes[a].tick) - 5.5 * s
          const xb = xAt(notes[b].tick) + 5.5 * s
          const y = base + 4 * s + level * 3.6 * s
          out.push(<line key={K()} x1={xa} x2={xb} y1={y} y2={y} stroke="var(--score-ink)" strokeWidth={1.2 * s} />)
          a = b + 1
        }
      }
      i = j + 1
    }
  }

  function drawLyrics(m: CompiledMeasure, xAt: (t: number) => number) {
    const y0 = sys.rows.lyrics + 16 * s
    for (const n of m.melody) {
      n.lyric.forEach((t, v) => {
        if (!t) return
        out.push(
          <text key={K()} x={xAt(n.tick)} y={y0 + v * 22 * s} textAnchor="middle" fontSize={k.lyric} fontWeight={500} fill={v === 0 ? 'var(--score-lyric)' : 'var(--score-lyric-2)'}>
            {t}
          </text>,
        )
      })
    }
    for (const l of m.lyricsOnly) {
      l.text.forEach((t, v) => {
        if (!t) return
        out.push(
          <text key={K()} x={xAt(l.tick)} y={y0 + v * 22 * s} textAnchor="middle" fontSize={k.lyric} fontWeight={500} fill={v === 0 ? 'var(--score-lyric)' : 'var(--score-lyric-2)'}>
            {t}
          </text>,
        )
      })
    }
  }

  return (
    <svg
      width={layout.width}
      height={sys.height}
      viewBox={`0 0 ${layout.width} ${sys.height}`}
      className="score-system block"
      style={{ fontFamily: 'var(--font-score)' }}
    >
      {out}
    </svg>
  )
})

function repeatSign(x: number, top: number, bot: number, kind: 'start' | 'end', s: number, K: () => number): ReactNode[] {
  const mid = (top + bot) / 2
  const dy = (bot - top) * 0.13
  if (kind === 'start') {
    return [
      <rect key={K()} x={x} y={top} width={2.6 * s} height={bot - top} fill="var(--score-bar)" />,
      <line key={K()} x1={x + 5 * s} x2={x + 5 * s} y1={top} y2={bot} stroke="var(--score-bar)" strokeWidth={1} />,
      <circle key={K()} cx={x + 9 * s} cy={mid - dy} r={1.9 * s} fill="var(--score-bar)" />,
      <circle key={K()} cx={x + 9 * s} cy={mid + dy} r={1.9 * s} fill="var(--score-bar)" />,
    ]
  }
  return [
    <circle key={K()} cx={x - 10 * s} cy={mid - dy} r={1.9 * s} fill="var(--score-bar)" />,
    <circle key={K()} cx={x - 10 * s} cy={mid + dy} r={1.9 * s} fill="var(--score-bar)" />,
    <line key={K()} x1={x - 5.5 * s} x2={x - 5.5 * s} y1={top} y2={bot} stroke="var(--score-bar)" strokeWidth={1} />,
    <rect key={K()} x={x - 2.6 * s} y={top} width={2.6 * s} height={bot - top} fill="var(--score-bar)" />,
  ]
}

function restGlyph(x: number, y: number, base: number, s: number, key: number): ReactNode {
  const c = 'var(--score-ink)'
  if (base <= 2) {
    return <rect key={key} x={x - 4 * s} y={base === 1 ? y - 3 * s : y} width={8 * s} height={3 * s} fill={c} />
  }
  if (base === 4) {
    return (
      <path
        key={key}
        d={`M${x - 1.5 * s},${y - 8 * s} l${4 * s},${4.5 * s} l${-3.5 * s},${3.5 * s} l${4 * s},${4.5 * s} q${-5 * s},${-1.5 * s} ${-3.5 * s},${3.5 * s}`}
        fill="none"
        stroke={c}
        strokeWidth={1.6 * s}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    )
  }
  const n = base >= 32 ? 3 : base >= 16 ? 2 : 1
  const parts: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const yy = y - 4 * s + i * 4.5 * s
    parts.push(<circle key={`c${i}`} cx={x - 2 * s + i * -1 * s} cy={yy} r={1.6 * s} fill={c} />)
    parts.push(<path key={`p${i}`} d={`M${x - 2 * s - i * s},${yy + 1 * s} L${x + 2.5 * s - i * s},${yy - 1 * s}`} stroke={c} strokeWidth={1.2 * s} />)
  }
  parts.push(<line key="stem" x1={x + 2.5 * s} y1={y - 5 * s} x2={x - 1 * s - (n - 1) * s} y2={y + 7 * s} stroke={c} strokeWidth={1.2 * s} />)
  return <g key={key}>{parts}</g>
}
