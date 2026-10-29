// 生成网页图标（public/icon.svg 和各尺寸 PNG）：node scripts/icons.mjs
// 图形定义在 src/lib/brand.ts（Node 22.18+ 可以直接 import .ts）
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
import { appIconSvg } from '../src/lib/brand.ts'

writeFileSync('public/icon.svg', appIconSvg('rounded') + '\n')
const jobs = [
  { file: 'public/icon-192.png', size: 192, src: appIconSvg('rounded'), transparent: true },
  { file: 'public/icon-512.png', size: 512, src: appIconSvg('rounded'), transparent: true },
  // maskable 图标会被系统裁成各种形状，用满版底板、拨片缩小到安全区内
  { file: 'public/icon-maskable-512.png', size: 512, src: appIconSvg('square'), transparent: false },
  { file: 'public/apple-touch-icon.png', size: 180, src: appIconSvg('square'), transparent: false },
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
