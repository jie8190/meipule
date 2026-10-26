export function timeAgo(ts?: number): string {
  if (!ts) return ''
  const d = (Date.now() - ts) / 1000
  if (d < 60) return '刚刚'
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} 天前`
  const dt = new Date(ts)
  return `${dt.getMonth() + 1}月${dt.getDate()}日`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function todayLabel(): string {
  const d = new Date()
  const wd = '日一二三四五六'[d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${wd}`
}

export const DIFFICULTY = ['', '入门', '简单', '中等', '进阶', '挑战']
