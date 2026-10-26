// 启动网页版：源码比 dist 新就先重新构建，再用 vite preview 打开。
// 由「启动没谱了.bat」调用；也可以直接 `node scripts/serve.mjs`。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(import.meta.dirname, '..')
const PORT = process.env.PORT || '4173'

function newest(path) {
  if (!existsSync(path)) return 0
  const st = statSync(path)
  if (!st.isDirectory()) return st.mtimeMs
  let t = 0
  for (const e of readdirSync(path)) t = Math.max(t, newest(join(path, e)))
  return t
}

const sources = ['src', 'public', 'index.html', 'vite.config.ts', 'package.json'].map((p) => join(root, p))
const built = join(root, 'dist', 'index.html')
const stale = !existsSync(built) || Math.max(...sources.map(newest)) > statSync(built).mtimeMs

const run = (args) => {
  const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (stale) {
  console.log('代码有更新，正在重新构建网页版…')
  run(['vite', 'build'])
}
console.log(`没谱了 已启动：http://localhost:${PORT}`)
run(['vite', 'preview', '--port', PORT, '--open'])
