// 生成安卓启动图标与启动页：node scripts/android-assets.mjs（需要先 npx cap add android）
import { chromium } from 'playwright-core'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RES = 'android/app/src/main/res'
const PICK = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5b041"/><stop offset="1" stop-color="#ff7849"/></linearGradient>
    <clipPath id="c"><path d="M256 448C200 392 96 286 96 190c0-66 72-110 160-110s160 44 160 110c0 96-104 202-160 258Z"/></clipPath>
  </defs>
  <path d="M256 448C200 392 96 286 96 190c0-66 72-110 160-110s160 44 160 110c0 96-104 202-160 258Z" fill="url(#g)"/>
  <g clip-path="url(#c)" stroke="#fff" stroke-opacity=".55" stroke-linecap="round">
    ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${176 + i * 32}" y1="60" x2="${176 + i * 32}" y2="470" stroke-width="${7 - i * 0.9}"/>`).join('')}
  </g>
  <circle cx="256" cy="200" r="46" fill="none" stroke="#fff" stroke-width="16"/>`
const BG = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1a24"/><stop offset="1" stop-color="#08080c"/></linearGradient></defs>`
// 拨片几何中心约在 (256, 264)
const pick = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -264)">${PICK}</g>`

const svgs = {
  legacy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}<rect width="512" height="512" rx="112" fill="url(#bg)"/>${pick(0.86)}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}<circle cx="256" cy="256" r="256" fill="url(#bg)"/>${pick(0.78)}</svg>`,
  // 自适应图标前景：108dp 画布，内容要落在中间 66dp 的安全区内
  foreground: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${pick(0.5)}</svg>`,
}

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const jobs = []
for (const [d, f] of Object.entries(DENS)) {
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher.png`, w: 48 * f, h: 48 * f, html: svgs.legacy, transparent: true })
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher_round.png`, w: 48 * f, h: 48 * f, html: svgs.round, transparent: true })
  jobs.push({ file: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, w: 108 * f, h: 108 * f, html: svgs.foreground, transparent: true })
}

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
  const html = `<div style="width:${w}px;height:${h}px;background:radial-gradient(${s * 0.9}px ${s * 0.7}px at 50% 42%, #2a1c10 0%, #08080c 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s * 0.05}px;font-family:'Microsoft YaHei','PingFang SC',sans-serif">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="80 70 352 390" width="${s * 0.26}" height="${s * 0.29}">${PICK}</svg>
    <div style="color:#efedf6;font-size:${s * 0.075}px;font-weight:700;letter-spacing:.08em">没谱了</div>
    <div style="color:#6e6b80;font-size:${s * 0.03}px;letter-spacing:.2em">本地吉他谱</div></div>`
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
