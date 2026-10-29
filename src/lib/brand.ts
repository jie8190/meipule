// 品牌图形：倾斜的拨片 + 八分音符。侧边栏 Logo、网页启动页、PWA 图标、安卓图标和启动图都从这里生成，
// 改这里后运行 `node scripts/icons.mjs` 和 `node scripts/android-assets.mjs` 重新出图。
// 只用纯字符串和函数（不依赖别的模块），这样 Node 脚本也能直接 import 这个 .ts 文件。

/** 拨片轮廓（512 画布，尖朝下、底部是圆润的尖） */
const PICK = 'M256 456C228 456 116 330 104 236C92 146 168 88 256 88s164 58 152 148C396 330 284 456 256 456Z'

/** 拨片倾斜角度和旋转中心 */
const TILT = -12
const CX = 256
const CY = 262

/** 双八分音符（摆正，不跟拨片一起倾斜） */
const NOTE = `<g fill="#fff" transform="translate(244 246) scale(.86) translate(-260 -242)">
  <ellipse cx="204" cy="322" rx="35" ry="26" transform="rotate(-22 204 322)"/>
  <ellipse cx="318" cy="294" rx="35" ry="26" transform="rotate(-22 318 294)"/>
  <rect x="221" y="172" width="17" height="150" rx="3"/>
  <rect x="335" y="144" width="17" height="150" rx="3"/>
  <path d="M221 166 352 136v44L221 210Z"/>
</g>`

/** 品牌渐变（静态图标用）；应用内的 Logo 改用当前主题色 */
export const BRAND_STOPS = ['#ffc35a', '#ff9248', '#ff6a4a']

/** 拨片在 512 画布里倾斜后的包围盒，启动页按它裁切 viewBox */
export const MARK_VIEWBOX = '84 78 326 384'

/**
 * 拨片图形（512 画布的 SVG 片段）。
 * id 用来区分同一页面里多个实例的渐变/裁切 id；stops 可以是颜色或 var(--x)。
 */
export function markSvg(id: string, stops: string[] = BRAND_STOPS, { strings = true }: { strings?: boolean } = {}) {
  const stop = (c: string, i: number) => `<stop offset="${i / (stops.length - 1)}" style="stop-color:${c}"/>`
  return `<defs>
  <linearGradient id="${id}-g" x1=".15" y1="0" x2=".85" y2="1">${stops.map(stop).join('')}</linearGradient>
  <linearGradient id="${id}-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".36"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="${id}-c"><path d="${PICK}"/></clipPath>
</defs>
<g class="mark-pick" transform="rotate(${TILT} ${CX} ${CY})">
  <path d="${PICK}" fill="url(#${id}-g)"/>
  <path d="${PICK}" fill="url(#${id}-h)"/>
  ${
    strings
      ? `<g clip-path="url(#${id}-c)" stroke="#fff" stroke-opacity=".16">${[0, 1, 2, 3, 4, 5]
          .map((i) => `<line class="mark-string" x1="${136 + i * 48}" y1="40" x2="${136 + i * 48}" y2="480" stroke-width="${(6 - i * 0.7).toFixed(1)}"/>`)
          .join('')}</g>`
      : ''
  }
  <g class="mark-note" transform="rotate(${-TILT} ${CX} ${CY})">${NOTE}</g>
</g>`
}

/** 深色底板（512 画布）：圆角矩形 / 圆形 / 满版方形，带一圈暖色光晕 */
function plate(id: string, shape: 'rounded' | 'circle' | 'square') {
  const body =
    shape === 'circle'
      ? `<circle cx="256" cy="256" r="256" fill="url(#${id}-bg)"/>`
      : `<rect width="512" height="512" rx="${shape === 'rounded' ? 112 : 0}" fill="url(#${id}-bg)"/>`
  const edge =
    shape === 'rounded'
      ? `<rect x="1.5" y="1.5" width="509" height="509" rx="110.5" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="3"/>`
      : shape === 'circle'
        ? `<circle cx="256" cy="256" r="254.5" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="3"/>`
        : ''
  return `<defs>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b26"/><stop offset="1" stop-color="#09090d"/></linearGradient>
  <radialGradient id="${id}-glow"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".34"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
</defs>
${body}<circle cx="256" cy="270" r="230" fill="url(#${id}-glow)"/>${edge}`
}

/** 把拨片缩放到画布中心（倾斜后的拨片包围盒是 x 94–400、y 88–452，上宽下尖，视觉中心取 (248, 262)） */
function centered(inner: string, scale: number) {
  return `<g transform="translate(256 256) scale(${scale}) translate(-248 -262)">${inner}</g>`
}

/** 完整的 App 图标 SVG */
export function appIconSvg(shape: 'rounded' | 'circle' | 'square' = 'rounded', id = 'i') {
  const scale = shape === 'rounded' ? 0.8 : shape === 'circle' ? 0.74 : 0.7
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${plate(id, shape)}${centered(markSvg(id), scale)}</svg>`
}

/** 安卓自适应图标背景：满版深色底 + 光晕（系统会按各家的形状裁切） */
export function adaptiveBackgroundSvg(id = 'b') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${plate(id, 'square')}</svg>`
}

/** 安卓自适应图标前景：108dp 画布，内容要落在中间 66dp 的安全区内 */
export function adaptiveForegroundSvg(id = 'f') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${centered(markSvg(id), 0.62)}</svg>`
}
