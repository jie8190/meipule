// 启动页：首屏渲染好、各页面代码预加载完（最多等一会儿）再淡出，之后切换页面不用再等加载

/** 预加载最多等这么久，超时就先进入，剩下的在后台继续加载 */
const MAX_WAIT = 1500
/** 网页端至少展示到入场动画（拨片落位、扫一次弦）播完；安卓上原生启动图已经展示过，不再额外等 */
const MIN_SHOW = 1100

export function finishBoot(preload: (onProgress: (p: number) => void) => Promise<unknown>) {
  const el = document.getElementById('boot')
  const bar = el?.querySelector<HTMLElement>('.bar i')
  const setProgress = (p: number) => {
    if (bar) bar.style.width = `${Math.round(6 + p * 94)}%`
  }
  const all = preload(setProgress)
  if (!el) return
  const native = document.documentElement.classList.contains('native')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const minShow = new Promise((r) => setTimeout(r, native || reduced ? 0 : Math.max(0, MIN_SHOW - performance.now())))
  const hide = () => {
    if (el.classList.contains('done')) return
    setProgress(1)
    // 等进度条走满、首屏画好再淡出；主界面同时从略小处放大进场
    requestAnimationFrame(() =>
      setTimeout(() => {
        el.classList.add('done')
        document.documentElement.classList.add('boot-reveal')
        setTimeout(() => {
          el.remove()
          document.documentElement.classList.remove('boot-reveal')
        }, 650)
      }, 120),
    )
  }
  void Promise.all([Promise.race([all, new Promise((r) => setTimeout(r, MAX_WAIT))]), minShow]).then(hide)
}
