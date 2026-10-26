import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** 页面出错时给出友好提示，而不是整页白屏 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(error.message)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-lg font-semibold">{chunk ? '页面资源更新了' : '这个页面出了点问题'}</div>
        <div className="max-w-md text-sm text-fg-2">{chunk ? '刷新一下就好。' : error.message}</div>
        <div className="flex gap-2">
          <button className="h-10 rounded-xl bg-accent-gradient px-4 text-sm font-semibold text-accent-fg" onClick={() => location.reload()}>
            刷新页面
          </button>
          <button className="h-10 rounded-xl border border-line-2 px-4 text-sm" onClick={() => (location.hash = '#/')}>
            回到曲库
          </button>
        </div>
      </div>
    )
  }
}
