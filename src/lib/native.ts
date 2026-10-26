// 安卓原生能力（Capacitor）：返回键、状态栏、屏幕常亮、文件分享、免跨域请求。
// 在浏览器里运行时这些函数都会退回到网页实现。
import { Capacitor, CapacitorHttp, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useEffect, useState } from 'react'
import { useUi } from '@/store/ui'

export const isNative = Capacitor.isNativePlatform()

/** 触屏设备（没有鼠标悬停）：用来切换「Shift+点击」「空格」这类键盘提示 */
export const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

/**
 * 软键盘是否弹出。App 里键盘会把 WebView 顶矮（adjustResize），
 * 视口比见过的最高值矮了两成以上就当作键盘开着；转屏时重新记基准。
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!isTouch) return
    let base = { w: innerWidth, h: innerHeight }
    const check = () => {
      if (innerWidth !== base.w) base = { w: innerWidth, h: innerHeight }
      base.h = Math.max(base.h, innerHeight)
      setOpen(innerHeight < base.h * 0.8)
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return open
}

/** 启动时调用一次：注册返回键、关闭启动页 */
export function initNative() {
  if (!isNative) return
  document.documentElement.classList.add('native')
  void App.addListener('backButton', ({ canGoBack }) => {
    const ui = useUi.getState()
    if (ui.paletteOpen) return ui.setPalette(false)
    if (ui.importOpen) return ui.closeImport()
    // 弹窗、菜单都监听 Esc，先关掉它们
    if (document.querySelector('[role="dialog"], [data-popover]')) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return
    }
    const atRoot = !location.hash || location.hash === '#/' || location.hash === '#'
    if (!atRoot && canGoBack) history.back()
    else void App.exitApp()
  })
  // 等首屏渲染后再淡出启动页，避免白屏闪烁
  requestAnimationFrame(() => setTimeout(() => void SplashScreen.hide({ fadeOutDuration: 300 }), 150))
}

/** 状态栏文字颜色跟随主题 */
export function setSystemBarsTheme(theme: 'dark' | 'light') {
  if (!isNative) return
  void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}

/** 沉浸模式：隐藏状态栏和导航栏（练琴时更大的谱面） */
export async function setImmersive(on: boolean) {
  if (!isNative) return
  try {
    if (on) await SystemBars.hide()
    else await SystemBars.show()
  } catch {
    /* 部分系统不支持 */
  }
}

/** 播放/自动滚动时保持屏幕常亮 */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (isNative) {
      void KeepAwake.keepAwake().catch(() => {})
      return () => void KeepAwake.allowSleep().catch(() => {})
    }
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    navigator.wakeLock
      .request('screen')
      .then((l) => {
        if (released) void l.release()
        else lock = l
      })
      .catch(() => {})
    return () => {
      released = true
      void lock?.release()
    }
  }, [active])
}

/** 在 App 里保存/分享文件（WebView 不支持 <a download>） */
export async function shareTextFile(filename: string, text: string): Promise<void> {
  const res = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: filename, files: [res.uri], dialogTitle: `保存或发送 ${filename}` })
  } catch (e) {
    // 用户取消分享不算错误
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e
  }
}

/** 原生 HTTP POST（绕过浏览器跨域限制），返回解析后的 JSON */
export async function nativePostJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<{ status: number; data: unknown }> {
  const req = CapacitorHttp.post({
    url,
    headers: { 'Content-Type': 'application/json', ...headers },
    data: body,
    connectTimeout: 30_000,
    readTimeout: 600_000,
    responseType: 'json',
  })
  if (!signal) return req
  return Promise.race([
    req,
    new Promise<never>((_, reject) => {
      if (signal.aborted) reject(new Error('已取消'))
      signal.addEventListener('abort', () => reject(new Error('已取消')), { once: true })
    }),
  ])
}

/** 原生 HTTP POST，按文本读回响应（用于流式接口：结果完成后一次性拿到全部 SSE 文本） */
export async function nativePost(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<{ status: number; data: unknown }> {
  const req = CapacitorHttp.post({
    url,
    headers: { 'Content-Type': 'application/json', ...headers },
    data: body,
    connectTimeout: 30_000,
    readTimeout: 900_000,
    responseType: 'text',
  })
  if (!signal) return req
  return Promise.race([
    req,
    new Promise<never>((_, reject) => {
      if (signal.aborted) reject(new Error('已取消'))
      signal.addEventListener('abort', () => reject(new Error('已取消')), { once: true })
    }),
  ])
}

/** 原生 HTTP GET（绕过跨域），返回解析后的 JSON */
export async function nativeGetJson(url: string, headers: Record<string, string>): Promise<{ status: number; data: unknown }> {
  return CapacitorHttp.get({ url, headers, connectTimeout: 15_000, readTimeout: 20_000, responseType: 'json' })
}
