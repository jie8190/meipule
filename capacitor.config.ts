import type { CapacitorConfig } from '@capacitor/cli'

// 开发时热更新：先 `npm run dev`，再用 `npm run android:live` 同步，
// App 会直接加载电脑上的开发服务器（CAP_SERVER_URL），改代码手机上立即生效。
const liveUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.meipule.app',
  appName: '没谱了',
  webDir: 'dist-app',
  backgroundColor: '#08080c',
  android: {
    // 允许 http 开发服务器（仅热更新时使用）
    allowMixedContent: !!liveUrl,
  },
  server: liveUrl
    ? { url: liveUrl, cleartext: true }
    : { androidScheme: 'https' },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false,
      backgroundColor: '#08080c',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
}

export default config
