/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // プレイ中に勝手に再読み込みされないよう、更新はタイトル画面でユーザーが選ぶ
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // MediaPipe の WASM/モデルは大きいので事前キャッシュせず、初回取得時にキャッシュする
        globIgnores: ['**/mediapipe/**'],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/'),
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe', expiration: { maxEntries: 10 } },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Face360（仮）',
        short_name: 'Face360',
        description: '自分の顔が的になる、全方向・ジャイロ操作のARシューティング',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#101018',
        theme_color: '#101018',
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  build: {
    // Three.js 単体で 500kB を超えるため
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
  },
});
