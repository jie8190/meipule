import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App'

// 网页版：Service Worker 发现新版本后自动刷新到新版本，不会一直停在缓存里的旧版
// （安卓 App 和开发模式下没有 Service Worker，这里是空操作）
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
