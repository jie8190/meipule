// 曲谱图片分析（纯计算，不依赖 DOM）：找出纸上的内容区域、统计墨迹、规划切条

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 墨迹：比周围明显暗、而周围又是亮底的像素（纸上的字和线）。深色主题的截图（亮字暗底）得到全 0 */
export function inkMask(gray: ArrayLike<number>, w: number, h: number): Uint8Array {
  // 积分图求局部均值
  const r = Math.max(2, Math.round(Math.min(w, h) / 60))
  const integ = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row
    }
  }
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const sum = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      if (mean > 120 && gray[y * w + x] < mean - 28) mask[y * w + x] = 1
    }
  }
  return mask
}

/**
 * 找出图里「纸上有字」的区域。拍照时的桌面、阴影是成片的暗色，不算墨迹，会被裁掉；页边空白也裁掉。
 * 深色主题的截图检测不到墨迹，返回 null，按整张处理。
 */
export function findContent(gray: ArrayLike<number>, w: number, h: number, mask = inkMask(gray, w, h)): Rect | null {
  const colInk = new Float64Array(w)
  const rowInk = new Float64Array(h)
  let total = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        colInk[x]++
        rowInk[y]++
        total++
      }
  if (total < w * h * 0.002) return null
  // 去掉零星噪点：行/列里墨迹太少的不算
  const span = (arr: Float64Array, len: number, other: number) => {
    const min = Math.max(1, other * 0.004)
    let a = 0
    while (a < len && arr[a] < min) a++
    let b = len - 1
    while (b > a && arr[b] < min) b--
    return [a, b] as const
  }
  // 贯穿大半页高度的竖条（线圈装订、书页边缘的阴影）不算内容
  for (let x = 0; x < w; x++) if (colInk[x] > h * 0.45) colInk[x] = 0
  const [x0, x1] = span(colInk, w, h)
  const [y0, y1] = span(rowInk, h, w)
  if (x1 <= x0 || y1 <= y0) return null
  const mx = Math.round(w * 0.015)
  const my = Math.round(h * 0.01)
  const rect = { x: Math.max(0, x0 - mx), y: Math.max(0, y0 - my), w: 0, h: 0 }
  rect.w = Math.min(w, x1 + mx + 1) - rect.x
  rect.h = Math.min(h, y1 + my + 1) - rect.y
  // 裁得太狠多半是误判
  if (rect.w * rect.h < w * h * 0.08) return null
  return rect
}

/**
 * 每一行被几根「长竖线」穿过：小节线、多轨谱左边的括号把一组谱线连在一起，
 * 被穿过的行在一组谱的中间，不能在这里下刀。几乎贯穿整个高度的竖条（线圈装订、页边阴影）不算。
 */
export function verticalCrossings(mask: Uint8Array, w: number, box: Rect, minRun: number): Uint16Array {
  const cross = new Uint16Array(box.h)
  const at = (x: number, y: number) => x >= 0 && x < w && mask[(box.y + y) * w + x] === 1
  for (let x = box.x; x < box.x + box.w; x++) {
    let start = -1
    for (let y = 0; y <= box.h; y++) {
      // 照片里的竖线会稍微歪一点，左右各放宽 1 像素
      const on = y < box.h && (at(x, y) || at(x - 1, y) || at(x + 1, y))
      if (on && start < 0) start = y
      else if (!on && start >= 0) {
        const len = y - start
        if (len >= minRun && len < box.h * 0.6) for (let k = start; k < y; k++) cross[k]++
        start = -1
      }
    }
  }
  return cross
}

/** 色阶：最暗的 1% 压成黑，最亮的 2% 提成白；对比度本来就够的图返回 null */
export function levelsOf(gray: ArrayLike<number>, idx: (i: number) => boolean, n: number): [number, number] | null {
  const hist = new Uint32Array(256)
  let count = 0
  for (let i = 0; i < n; i++)
    if (idx(i)) {
      hist[gray[i]]++
      count++
    }
  let lo = 0
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < count * 0.01; lo++);
  let hi = 255
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < count * 0.02; hi--);
  if (hi - lo < 40 || (lo < 12 && hi > 243)) return null
  return [lo, hi]
}

export function applyLevels(ctx: CanvasRenderingContext2D, w: number, h: number, [lo, hi]: [number, number]) {
  const im = ctx.getImageData(0, 0, w, h)
  const d = im.data
  const k = 255 / (hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (d[i] - lo) * k
    d[i + 1] = (d[i + 1] - lo) * k
    d[i + 2] = (d[i + 2] - lo) * k
  }
  ctx.putImageData(im, 0, 0)
}

/**
 * 规划横条：尽量在空白行下刀（选范围内最宽的那段空白），这样一整行六线谱、
 * 和弦图连同下面的歌词都不会被切开；整段都没有空白时才硬切，并留出重叠。
 * ink[y] 为第 y 行的墨迹量，blank 为「算空白」的容差。
 * 拍照的书页每一行都可能有一点墨迹（线圈装订、透过来的背面字），所以切口按窗口内的
 * 相对最小值找：先找墨迹最少的那些行（小节号这类小字也算内容，免得把和弦图和它的谱线
 * 分开），再放宽一点，取其中最宽的一段。多轨谱一组谱线之间有贯穿的小节线，墨迹比两组
 * 谱之间多，不会被从中间切开。
 */
export function planStrips(
  ink: ArrayLike<number>,
  H: number,
  maxH: number,
  blank: number,
  overlap: number,
  cross?: ArrayLike<number>,
): { strips: [number, number][]; hard: boolean } {
  const strips: [number, number][] = []
  let hard = false
  const free = (y: number) => !cross || !cross[y]
  // 底噪：全图最干净的那一行（拍照的书页可能每行都有装订线之类的一点墨迹）
  let floor = Infinity
  for (let i = 0; i < H; i++) floor = Math.min(floor, ink[i])
  // 最干净的行也很满，说明整张都是密集的内容，不是噪点
  floor = Number.isFinite(floor) ? Math.min(floor, blank * 4) : 0
  // 末尾的空白：零星噪点不算内容
  const isBlank = (y: number) => ink[y] <= floor + blank * 3 && free(y)
  // 每条开头只跳过真正空白的行：和弦名这类只有几个像素的小字也不能丢
  const isEmpty = (y: number) => ink[y] <= floor && free(y)
  const findGap = (from: number, to: number, limit: number): [number, number] | null => {
    let best: [number, number] | null = null
    let runEnd = -1
    for (let c = to; c >= from; c--) {
      if (ink[c] <= limit && free(c)) {
        if (runEnd < 0) runEnd = c
        if (!best || runEnd - c > best[1] - best[0]) best = [c, runEnd]
      } else runEnd = -1
    }
    return best && best[1] - best[0] >= 2 ? best : null
  }
  let lastInk = H - 1
  while (lastInk > 0 && isBlank(lastInk)) lastInk--
  let y = 0
  let prevEnd = 0
  for (let guard = 0; guard < 500 && y < H; guard++) {
    while (y < H && isEmpty(y)) y++
    if (y > lastInk) break
    const start = Math.max(prevEnd, y - 8)
    if (lastInk + 8 - start <= maxH) {
      strips.push([start, Math.min(H, lastInk + 8)])
      break
    }
    // 在 [start + 0.35·maxH, start + maxH] 里找最宽的空白段，宽度相同取靠下的；
    // 找不到就放宽到 1.5·maxH：宁可这一条高一些，也不把一组谱切开
    let best: [number, number] | null = null
    for (const ext of [1, 1.5]) {
      const from = start + Math.floor(maxH * 0.35)
      const to = Math.min(H - 1, start + Math.floor(maxH * ext) - 1)
      let m = Infinity
      for (let c = from; c <= to; c++) if (free(c)) m = Math.min(m, ink[c])
      // 窗口里最干净的行也很满：是一大块没有空隙的内容
      if (m > floor + blank * 4) continue
      best = findGap(from, to, m) ?? findGap(from, to, m + Math.max(blank, m * 0.5))
      if (best) break
    }
    if (best) {
      const cut = Math.round((best[0] + best[1]) / 2)
      strips.push([start, cut])
      prevEnd = cut
      y = cut
    } else {
      hard = true
      strips.push([start, start + maxH])
      prevEnd = start + maxH - overlap
      y = prevEnd
    }
  }
  return { strips, hard }
}
