// 生成安卓启动图标与启动页：node scripts/android-assets.mjs（需要先 npx cap add android）
// 图形定义在 src/lib/brand.ts；启动页布局和 index.html 里的 #boot 保持一致，原生启动页淡出时无缝衔接
import { chromium } from 'playwright-core'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { adaptiveBackgroundSvg, adaptiveForegroundSvg, appIconSvg, BRAND_STOPS, MARK_VIEWBOX, markSvg } from '../src/lib/brand.ts'

const RES = 'android/app/src/main/res'

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const jobs = []
for (const [d, f] of Object.entries(DENS)) {
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher.png`, w: 48 * f, h: 48 * f, html: appIconSvg('rounded'), transparent: true })
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher_round.png`, w: 48 * f, h: 48 * f, html: appIconSvg('circle'), transparent: true })
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, w: 108 * f, h: 108 * f, html: adaptiveForegroundSvg(), transparent: true })
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher_background.png`, w: 108 * f, h: 108 * f, html: adaptiveBackgroundSvg(), transparent: false })
}

// 自适应图标的背景从纯色换成带光晕的图片
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) writeFileSync(`${RES}/mipmap-anydpi-v26/${f}`, adaptive)

// 启动页：沿用模板里每张 splash.png 的尺寸
function pngSize(file) {
  const b = readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
for (const dir of readdirSync(RES)) {
  const f = join(RES, dir, 'splash.png')
  try {
    if (!statSync(f).isFile()) continue
  } catch {
    continue
  }
  const { w, h } = pngSize(f)
  const s = Math.min(w, h)
  const m = s * 0.24 // 拨片宽度，对应 #boot 的 --w: 24vmin（光晕取呼吸动画的起始帧）
  const html = `<div style="width:${w}px;height:${h}px;background:radial-gradient(${s * 0.9}px ${s * 0.75}px at 50% 44%, #2c1d10 0%, #08080c 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s * 0.045}px;font-family:'Microsoft YaHei','PingFang SC',sans-serif">
    <div style="position:relative;width:${m}px;height:${(m * 384) / 326}px">
      <div style="position:absolute;left:50%;top:50%;width:${m * 2.6}px;height:${m * 2.6}px;margin:${m * -1.3}px 0 0 ${m * -1.3}px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,138,61,.3),rgba(255,138,61,0));opacity:.65;transform:scale(.92)"></div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" width="${m}" height="${(m * 384) / 326}" style="position:relative;display:block">${markSvg('s', BRAND_STOPS)}</svg>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:${s * 0.016}px">
      <div style="color:#efedf6;font-size:${s * 0.075}px;font-weight:700;letter-spacing:.12em;padding-left:.12em">没谱了</div>
      <div style="color:#7a7790;font-size:${s * 0.03}px;letter-spacing:.32em;padding-left:.32em">本地吉他谱</div>
    </div></div>`
  jobs.push({ file: f, w, h, html, transparent: false })
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: Math.round(j.w), height: Math.round(j.h) } })
  const body = j.html.startsWith('<svg') ? j.html.replace('<svg ', `<svg width="${j.w}" height="${j.h}" `) : j.html
  await page.setContent(`<html><body style="margin:0;background:transparent;overflow:hidden">${body}</body></html>`)
  await page.screenshot({ path: j.file, omitBackground: j.transparent })
  await page.close()
}
await browser.close()
console.log(`生成了 ${jobs.length} 张图片`)
