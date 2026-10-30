import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  Heart,
  PenLine,
  Maximize,
  Minimize,
  Printer,
  ChevronLeft,
  ChevronRight,
  Info,
  ZoomIn,
  ZoomOut,
  FileText,
  ScrollText,
} from 'lucide-react'
import { db, saveViewPrefs, setFavorite, touchSong } from '@/lib/db'
import { compileSong } from '@/lib/notation/compile'
import { player } from '@/lib/audio/player'
import { useSettings } from '@/store/settings'
import { ScoreView } from '@/components/score/ScoreView'
import { TrackMixer } from '@/components/TrackMixer'
import { PlayerDock, usePlayerStatus } from '@/components/PlayerDock'
import { TransposePanel } from '@/components/TransposePanel'
import { ChordModal } from '@/components/ChordModal'
import { ChordDiagram } from '@/components/ChordDiagram'
import { Cover } from '@/components/Cover'
import { SongMenu } from '@/components/SongCard'
import { DiagnosticsList } from '@/components/Diagnostics'
import { DIFFICULTY } from '@/lib/format'
import { isNative, isTouch, setImmersive, useKeepAwake } from '@/lib/native'
import { Button, cn, IconButton, Slider, Switch } from '@/components/ui'

export default function SongPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const rec = useLiveQuery(() => db.songs.get(id), [id])
  const setlistId = params.get('list')
  const setlist = useLiveQuery(() => (setlistId ? db.setlists.get(setlistId) : undefined), [setlistId])

  const s = useSettings()
  const [shift, setShift] = useState(0)
  const [capo, setCapo] = useState<number | null>(null)
  const [speed, setSpeed] = useState(1)
  const [keepKey, setKeepKey] = useState(true)
  const [selection, setSelection] = useState<[number, number] | null>(null)
  const [loopOn, setLoopOn] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const [chord, setChord] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showIssues, setShowIssues] = useState(false)
  /** 多轨：谱面上隐藏的音轨（null = 按曲谱里的 hidden） */
  const [hiddenTracks, setHiddenTracks] = useState<number[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loaded = useRef<string | null>(null)
  const status = usePlayerStatus()

  // 载入每首歌自己的视图偏好
  useEffect(() => {
    if (!rec || loaded.current === rec.id) return
    loaded.current = rec.id
    setShift(rec.view?.shift ?? 0)
    setCapo(rec.view?.capo ?? null)
    setSpeed(rec.view?.speed ?? 1)
    setSelection(null)
    setLoopOn(false)
    setHiddenTracks(null)
    void touchSong(rec.id)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [rec])

  useEffect(() => {
    if (!rec || loaded.current !== rec.id) return
    const t = setTimeout(() => void saveViewPrefs(rec.id, { shift, capo: capo ?? undefined, speed }), 400)
    return () => clearTimeout(t)
  }, [shift, capo, speed, rec])

  // 收藏、打开记录等写库操作会产生新的记录对象；只在曲谱内容真正变化时才重新编译，避免打断播放
  const docJson = rec ? JSON.stringify(rec.doc) : ''
  const score = useMemo(() => (docJson ? compileSong(JSON.parse(docJson), { shift, capo: capo ?? undefined }) : null), [docJson, shift, capo])

  // 播放器
  useEffect(() => {
    if (score) player.load(score, loopOn && selection ? selection : null)
  }, [score]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => player.stop(), [])
  useEffect(() => {
    player.setOptions({ guitar: s.playGuitar, melody: s.playMelody, metronome: s.metronome, countIn: s.countIn, speed })
  }, [s.playGuitar, s.playMelody, s.metronome, s.countIn, speed])
  useEffect(() => {
    if (!score) return
    player.setLoop(loopOn && selection ? selection : null)
  }, [loopOn, selection]) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动滚动（不播放时）
  useEffect(() => {
    if (!autoScroll) return
    let raf = 0
    let last = performance.now()
    let acc = scrollRef.current?.scrollTop ?? 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const el = scrollRef.current
      if (!el) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (Math.abs(el.scrollTop - acc) > 2) acc = el.scrollTop // 用户手动滚动过
      acc += s.autoScrollSpeed * dt
      el.scrollTop = acc
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setAutoScroll(false)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [autoScroll, s.autoScrollSpeed])
  useEffect(() => {
    if (status === 'playing') setAutoScroll(false)
  }, [status])

  // 播放或滚动时保持屏幕常亮
  useKeepAwake(status === 'playing' || autoScroll)

  // 键盘快捷键
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        player.toggle()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const pos = player.currentMeasurePos()
        const cur = pos?.measure ?? -1
        const n = score?.measures.length ?? 0
        const next = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))
        player.seekMeasure(next)
        e.preventDefault()
      } else if (e.key === 'l' || e.key === 'L') {
        if (selection) setLoopOn((v) => !v)
      } else if (e.key === 'm' || e.key === 'M') {
        s.set({ metronome: !s.metronome })
      } else if (e.key === 'Escape') {
        setSelection(null)
        setLoopOn(false)
      } else if (e.key === '=' || e.key === '+') {
        s.set({ scale: Math.min(1.8, +(s.scale + 0.1).toFixed(2)) })
      } else if (e.key === '-') {
        s.set({ scale: Math.max(0.7, +(s.scale - 0.1).toFixed(2)) })
      }
    },
    [score, selection, s],
  )
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  useEffect(() => {
    if (isNative) return () => void setImmersive(false)
    const on = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFullscreen = () => {
    if (isNative) {
      // App 里：隐藏状态栏和导航栏
      void setImmersive(!fullscreen)
      setFullscreen(!fullscreen)
    } else if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  const hidden = useMemo(() => hiddenTracks ?? score?.tracks.flatMap((t, i) => (t.hidden ? [i] : [])) ?? [], [hiddenTracks, score])
  const opts = useMemo(
    () => ({
      scale: s.scale,
      showTab: s.showTab,
      showDiagrams: s.showDiagrams,
      showChordNames: s.showChordNames,
      showMelody: s.showMelody,
      showLyrics: s.showLyrics,
      hiddenTracks: hidden,
    }),
    [s.scale, s.showTab, s.showDiagrams, s.showChordNames, s.showMelody, s.showLyrics, hidden],
  )

  if (rec === undefined) return null
  if (!rec || !score) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 text-fg-2">
        <div>没有找到这首曲谱</div>
        <Button onClick={() => navigate('/')}>返回曲库</Button>
      </div>
    )
  }

  const effCapo = score.capo
  const transposed = shift !== 0 || effCapo !== score.originalCapo
  const transposeLabel = score.shapeKey ? `${score.shapeKey}${effCapo ? ` · 夹${effCapo}` : ''}` : '变调'
  const issues = score.diagnostics.filter((d) => d.level !== 'info')
  const pos = setlist ? setlist.songIds.indexOf(rec.id) : -1
  const prevId = setlist && pos > 0 ? setlist.songIds[pos - 1] : null
  const nextId = setlist && pos >= 0 && pos < setlist.songIds.length - 1 ? setlist.songIds[pos + 1] : null
  const hasTimeline = score.measures.length > 0

  const displayPanel = (
    <div className="w-72 space-y-1 p-2">
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <ZoomOut className="size-4 text-fg-3" />
        <Slider value={s.scale} min={0.7} max={1.8} step={0.05} onChange={(v) => s.set({ scale: v })} label="缩放" />
        <ZoomIn className="size-4 text-fg-3" />
        <span className="w-10 text-right text-xs tabular-nums text-fg-2">{Math.round(s.scale * 100)}%</span>
      </div>
      {(
        [
          ['showTab', '六线谱'],
          ['showChordNames', '和弦名'],
          ['showDiagrams', '和弦图'],
          ['showMelody', '简谱'],
          ['showLyrics', '歌词'],
          ['scorePaper', '纸张谱面（浅色）'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex items-center justify-between rounded-xl px-2 py-2 text-[13px] font-medium hover:bg-[color-mix(in_oklab,var(--fg)_4%,transparent)]">
          {label}
          <Switch checked={s[k]} onChange={(v) => s.set({ [k]: v })} />
        </label>
      ))}
      <div className="px-2 pb-1 pt-2">
        <div className="mb-1 flex justify-between text-xs text-fg-2">
          <span>自动滚动速度</span>
          <span className="tabular-nums">{s.autoScrollSpeed} px/s</span>
        </div>
        <Slider value={s.autoScrollSpeed} min={6} max={120} step={2} onChange={(v) => s.set({ autoScrollSpeed: v })} label="自动滚动速度" />
      </div>
    </div>
  )

  return (
    <div className={cn('flex h-dvh flex-col')}>
      {/* 顶栏 */}
      <header className="no-print glass relative z-20 flex h-[calc(60px+var(--sat))] shrink-0 items-center gap-2 border-b border-line px-2 pt-[var(--sat)] sm:px-4">
        <IconButton label="返回" onClick={() => (setlistId ? navigate(`/setlists/${setlistId}`) : navigate(-1))}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <Cover title={rec.title} artist={rec.artist} className="hidden size-9 shrink-0 rounded-[10px] sm:block" showText={false} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{rec.title}</div>
          <div className="truncate text-xs text-fg-3">
            {setlist ? `歌单「${setlist.name}」· ${pos + 1}/${setlist.songIds.length}` : rec.artist || '未知作者'}
          </div>
        </div>
        {setlist && (
          <div className="flex">
            <IconButton label="上一首" disabled={!prevId} onClick={() => prevId && navigate(`/song/${prevId}?list=${setlistId}`)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <IconButton label="下一首" disabled={!nextId} onClick={() => nextId && navigate(`/song/${nextId}?list=${setlistId}`)}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        )}
        <div className="hidden items-center gap-1.5 md:flex">
          {score.originalKey && <MetaChip label="原调" value={score.originalKey} />}
          {score.shapeKey && transposed && <MetaChip label="选调" value={score.shapeKey} accent />}
          {effCapo > 0 && <MetaChip label="Capo" value={String(effCapo)} accent={transposed} />}
          <MetaChip label="♩" value={String(score.tempo)} />
        </div>
        {issues.length > 0 && (
          <IconButton label={`${issues.length} 个格式提示`} onClick={() => setShowIssues(!showIssues)} active={showIssues}>
            <Info className="size-[18px] text-warn" />
          </IconButton>
        )}
        <IconButton label={rec.favorite ? '取消收藏' : '收藏'} onClick={() => setFavorite(rec.id, !rec.favorite)}>
          <Heart className={cn('size-[18px]', rec.favorite && 'fill-[#ff5d7a] text-[#ff5d7a]')} />
        </IconButton>
        <IconButton label="编辑" onClick={() => navigate(`/edit/${rec.id}`)}>
          <PenLine className="size-[18px]" />
        </IconButton>
        <IconButton
          label={fullscreen ? '退出全屏' : '全屏'}
          className={isNative ? '' : 'hidden sm:inline-flex'}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
        </IconButton>
        <IconButton label="打印" className="hidden lg:inline-flex" onClick={() => window.print()}>
          <Printer className="size-[18px]" />
        </IconButton>
        <SongMenu song={rec} />
      </header>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-[1180px] px-3 pb-40 pt-6 sm:px-6 sm:pt-8">
          {showIssues && issues.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="card mb-5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">格式提示</span>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/edit/${rec.id}`)}>
                  去修改
                </Button>
              </div>
              <DiagnosticsList diags={issues} />
            </motion.div>
          )}

          {/* 曲目信息 */}
          <section className="mb-6 flex flex-col gap-5 px-1 sm:flex-row sm:items-end">
            <Cover title={rec.title} artist={rec.artist} className="hidden size-28 shrink-0 rounded-[16px] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)] ring-1 ring-inset ring-white/8 sm:block" />
            <div className="min-w-0 flex-1">
              <div className="eyebrow mb-2">
                Score · {score.timeNum}/{score.timeDen} · {score.tempo} BPM
              </div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">{score.title}</h1>
              <div className="mt-1 text-[13.5px] text-fg-2">
                {[score.artist, score.meta.composer && `曲：${score.meta.composer}`, score.meta.lyricist && `词：${score.meta.lyricist}`].filter(Boolean).join('　')}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {score.originalKey && <MetaChip label="原调" value={score.originalKey} />}
                {score.shapeKey && <MetaChip label="选调" value={score.shapeKey} accent={transposed} />}
                <MetaChip label="Capo" value={effCapo ? `${effCapo} 品` : '无'} accent={transposed} />
                <MetaChip label="拍号" value={`${score.timeNum}/${score.timeDen}`} />
                <MetaChip label="速度" value={`${score.tempo}`} />
                {score.doName && score.hasMelody && <MetaChip label="1 =" value={score.doName} />}
                {score.tuningName !== '标准' && <MetaChip label="调弦" value={score.tuningName} accent />}
                {score.meta.difficulty ? <MetaChip label="难度" value={DIFFICULTY[score.meta.difficulty] ?? String(score.meta.difficulty)} /> : null}
              </div>
            </div>
          </section>

          {score.meta.notes && (
            <div className="mb-5 flex gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-fg-2 shadow-[var(--highlight)]">
              <ScrollText className="mt-0.5 size-4 shrink-0 text-accent" />
              {score.meta.notes}
            </div>
          )}

          {/* 和弦一览 */}
          {score.chordsUsed.length > 0 && (
            <section className="mb-5">
              <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-6 sm:px-6">
                {score.chordsUsed.map((c) => (
                  <button
                    key={c.name}
                    data-score={s.scorePaper ? 'paper' : undefined}
                    onClick={() => setChord(c.name)}
                    className="shrink-0 rounded-2xl px-1.5 pb-1 pt-1.5 ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-3"
                    style={{ background: 'var(--score-paper)' }}
                  >
                    <ChordDiagram name={c.name} shape={c.shape} size={62} fingers={false} frets={4} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 谱面 */}
          <div
            data-score={s.scorePaper ? 'paper' : undefined}
            className="score-paper relative overflow-hidden rounded-[24px] pb-10 pt-4 shadow-[var(--shadow)] ring-1 ring-line sm:rounded-[28px] sm:pt-7"
          >
            {score.sections.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center" style={{ color: 'var(--score-dim)' }}>
                <FileText className="size-8" />
                这首曲谱还没有内容
                <Button variant="primary" size="sm" onClick={() => navigate(`/edit/${rec.id}`)}>
                  去编辑
                </Button>
              </div>
            ) : (
              <ScoreView
                score={score}
                opts={opts}
                scrollRef={scrollRef}
                selection={selection}
                onSelect={(sel) => {
                  setSelection(sel)
                  if (!sel) setLoopOn(false)
                }}
                onSeek={(m) => player.seekMeasure(m)}
                onPlayFrom={(m) => {
                  player.seekMeasure(m)
                  if (player.status !== 'playing') player.play()
                }}
                onChordClick={setChord}
                follow={s.followCursor}
                pad={typeof window !== 'undefined' && window.innerWidth < 640 ? 14 : 30}
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[11.5px] text-fg-3">
            <span>{isTouch ? '点小节定位 · 双击从这里播放 · 长按另一个小节选择循环区间' : '点击小节定位 · 双击从这里播放 · Shift+点击选择循环区间'}</span>
            {!isTouch && <span className="hidden sm:inline">空格 播放/暂停 · ←/→ 切换小节 · L 循环 · M 节拍器</span>}
          </div>
          {setlist && nextId && (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" iconRight={<ChevronRight className="size-4" />} onClick={() => navigate(`/song/${nextId}?list=${setlistId}`)}>
                下一首
              </Button>
            </div>
          )}
        </div>
      </div>

      <PlayerDock
        speed={speed}
        onSpeed={setSpeed}
        tempo={score.tempo}
        loopOn={loopOn}
        canLoop={!!selection}
        onLoop={() => selection && setLoopOn(!loopOn)}
        autoScroll={autoScroll}
        onAutoScroll={() => setAutoScroll(!autoScroll)}
        transposeLabel={transposeLabel}
        hasTimeline={hasTimeline}
        transpose={
          <TransposePanel
            score={score}
            shift={shift}
            capo={effCapo}
            keepKey={keepKey}
            onKeepKey={setKeepKey}
            onChange={(v) => {
              setShift(v.shift)
              setCapo(v.capo)
            }}
          />
        }
        display={displayPanel}
        tracks={score.tracks.length > 1 ? <TrackMixer tracks={score.tracks} hidden={hidden} onHidden={setHiddenTracks} /> : undefined}
      />

      <ChordModal
        name={chord}
        onClose={() => setChord(null)}
        tuning={score.tuning}
        capo={effCapo}
        shape={score.chordsUsed.find((c) => c.name === chord)?.shape ?? null}
      />
    </div>
  )
}

function MetaChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs',
        accent ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_30%,transparent)]' : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line-2)]',
      )}
    >
      <span className="text-fg-3">{label}</span>
      <span className="font-mono text-[11.5px] font-medium">{value}</span>
    </span>
  )
}
