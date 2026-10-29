/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { BRAND_STOPS, MARK_VIEWBOX, markSvg } from './src/lib/brand'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// mode === 'capacitor'：打包进安卓 App 时不需要 Service Worker（资源本来就在本地，
// 而且 SW 缓存会让 App 升级后仍显示旧版本）
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // 网页版和安卓 App 分开输出，打 APK 不会覆盖网页版的 dist（否则浏览器里的旧缓存永远不更新）
  build: { outDir: mode === 'capacitor' ? 'dist-app' : 'dist' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    // 启动页里的拨片图形和图标同源（src/lib/brand.ts），首屏 HTML 里直接带上，不用等 JS
    {
      name: 'brand-mark',
      transformIndexHtml: (html) =>
        html.replace(/<!--brand-mark[^>]*-->/, `<svg class="mark" viewBox="${MARK_VIEWBOX}">${markSvg('boot', BRAND_STOPS)}</svg>`),
    },
    react(),
    tailwindcss(),
    VitePWA({
      disable: mode === 'capacitor',
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '没谱了 · 本地吉他谱',
        short_name: '没谱了',
        description: '本地优先的吉他谱 App：参数化制谱、AI 扒谱、动态播放',
        theme_color: '#08080c',
        background_color: '#08080c',
        display: 'standalone',
        orientation: 'any',
        lang: 'zh-CN',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, host: true },
  test: { environment: 'node' },
}))
