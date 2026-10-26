// 安卓构建助手
//   node scripts/android.mjs apk    打包网页 → 同步到安卓工程 → 编译调试版 APK（输出到 apk/）
//   node scripts/android.mjs open   同步后用 Android Studio 打开安卓工程
//   node scripts/android.mjs live   热更新预览：App 直接加载电脑上的开发服务器（需另开 npm run dev）
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const android = join(root, 'android')
const cmd = process.argv[2] ?? 'apk'
const isWin = process.platform === 'win32'

function firstExisting(list) {
  return list.filter(Boolean).find((p) => existsSync(p))
}

// Android Studio 自带的 JDK（编译安卓需要 JDK 17+，系统里的 Java 8 不行）
const studio = firstExisting([
  process.env.ANDROID_STUDIO_PATH,
  'D:\\Android Studio',
  'C:\\Program Files\\Android\\Android Studio',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Android Studio'),
  '/Applications/Android Studio.app/Contents',
  '/opt/android-studio',
])
const javaHome = firstExisting([process.env.MEIPULE_JAVA_HOME, studio && join(studio, 'jbr'), process.env.JAVA_HOME])
const sdk = firstExisting([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk'),
  process.env.HOME && join(process.env.HOME, 'Android', 'Sdk'),
])

if (!sdk) {
  console.error('找不到 Android SDK。请先打开一次 Android Studio 完成 SDK 安装，或设置 ANDROID_HOME。')
  process.exit(1)
}
writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`)

const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk }
if (javaHome) {
  env.JAVA_HOME = javaHome
  env.PATH = `${join(javaHome, 'bin')}${isWin ? ';' : ':'}${env.PATH}`
}

function run(command, args, opts = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const r = spawnSync(command, args, { stdio: 'inherit', shell: isWin, env: { ...env, ...(opts.env ?? {}) }, cwd: opts.cwd ?? root })
  if (r.status !== 0) {
    console.error(`\n命令失败：${command} ${args.join(' ')}`)
    process.exit(r.status ?? 1)
  }
}

/** 找真实网卡（WLAN/以太网）的局域网 IP，跳过虚拟机、WSL、VPN 的虚拟网卡 */
function lanIp() {
  const virtual = /vmware|virtual|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier|vpn|bluetooth/i
  const all = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal).map((n) => ({ name, address: n.address })),
  )
  return (all.find((n) => !virtual.test(n.name)) ?? all[0])?.address ?? 'localhost'
}

if (cmd === 'live') {
  const ip = process.argv[3] ?? lanIp()
  const url = `http://${ip}:5173`
  run('npx', ['cap', 'sync', 'android'], { env: { CAP_SERVER_URL: url } })
  console.log(`
已把 App 指向开发服务器 ${url}
1. 另开一个终端运行：npm run dev
2. 在 Android Studio 里点 ▶ 运行到模拟器或真机（手机需和电脑在同一局域网）
3. 改代码后 App 里会自动刷新
完成后运行 npm run android:sync 恢复成正常打包模式。`)
  process.exit(0)
}

// 打包网页（安卓模式：不带 Service Worker）并同步到安卓工程
run('npx', ['vite', 'build', '--mode', 'capacitor'])
run('npx', ['cap', 'sync', 'android'])

if (cmd === 'sync') process.exit(0)

if (cmd === 'open') {
  const exe = studio && firstExisting([join(studio, 'bin', 'studio64.exe'), join(studio, 'bin', 'studio.sh'), join(studio, 'MacOS', 'studio')])
  run('npx', ['cap', 'open', 'android'], { env: exe ? { CAPACITOR_ANDROID_STUDIO_PATH: exe } : {} })
  process.exit(0)
}

if (cmd === 'apk') {
  // Windows 下 .bat 必须经由 shell 执行，用带引号的绝对路径最稳妥
  const gradlew = isWin ? `"${join(android, 'gradlew.bat')}"` : './gradlew'
  run(gradlew, ['assembleDebug', '--no-daemon'], { cwd: android })
  const out = join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
  mkdirSync(join(root, 'apk'), { recursive: true })
  const target = join(root, 'apk', '没谱了-1.0.0.apk')
  copyFileSync(out, target)
  console.log(`\n✅ APK 已生成：${target}\n把它发到手机上安装即可（需要允许“安装未知来源应用”）。`)
}
