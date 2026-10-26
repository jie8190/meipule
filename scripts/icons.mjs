// 用 SVG 生成 PWA 图标：node scripts/icons.mjs
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/icon.svg', 'utf8')
const fullBleed = svg.replace('rx="112"', 'rx="0"')
const jobs = [
  { file: 'public/icon-192.png', size: 192, src: svg, transparent: true },
  { file: 'public/icon-512.png', size: 512, src: svg, transparent: true },
  { file: 'public/icon-maskable-512.png', size: 512, src: fullBleed, transparent: false },
  { file: 'public/apple-touch-icon.png', size: 180, src: fullBleed, transparent: false },
]
const browser = await chromium.launch({ channel: 'msedge', headless: true })
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.size, height: j.size } })
  await page.setContent(`<html><body style="margin:0;background:transparent">${j.src.replace('<svg ', `<svg width="${j.size}" height="${j.size}" `)}</body></html>`)
  await page.screenshot({ path: j.file, omitBackground: j.transparent })
  await page.close()
  console.log('wrote', j.file)
}
await browser.close()
