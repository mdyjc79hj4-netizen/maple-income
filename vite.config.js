import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '메기 - 메이플 수익 기록',
        short_name: '메기',
        description: '메이플스토리 보스·재획·아이템 수익과 캐릭터 정보를 기록하고 관리하는 메이플 수익 관리 앱',
        lang: 'ko-KR',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0d151c',
        background_color: '#0d151c',
        icons: [
          {src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
          {src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
          {src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'}
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        globIgnores: ['**/favicon.svg', '**/apple-touch-icon.png', '**/pwa-*.png'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: []
      }
    })
  ]
});
