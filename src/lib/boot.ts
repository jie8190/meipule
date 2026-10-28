// 启动页：首屏渲染好、各页面代码预加载完（最多等一会儿）再淡出，之后切换页面不用再等加载

/** 预加载最多等这么久，超时就先进入，剩下的在后台继续加载 */
const MAX_WAIT = 1500

export function finishBoot(preload: (onProgress: (p: number) => void) => Promise<unknown>) {
  const el = document.getElementById('boot')
  const bar = el?.querySelector<HTMLElement>('.bar i')
  const setProgress = (p: number) => {
    if (bar) bar.style.width = `${Math.round(6 + p * 94)}%`
  }
  const all = preload(setProgress)
  if (!el) return
  const hide = () => {
    if (el.classList.contains('done')) return
    setProgress(1)
    // 等进度条走满、首屏画好再淡出
    requestAnimationFrame(() =>
      setTimeout(() => {
        el.classList.add('done')
        setTimeout(() => el.remove(), 350)
      }, 120),
    )
  }
  void Promise.race([all, new Promise((r) => setTimeout(r, MAX_WAIT))]).then(hide)
}
