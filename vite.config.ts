/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // MediaPipe の WASM/モデルは大きいので事前キャッシュせず、初回取得時にキャッシュする
        globIgnores: ['**/mediapipe/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/'),
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe', expiration: { maxEntries: 10 } },
          },
        ],
      },
      manifest: {
        name: 'Face360（仮）',
        short_name: 'Face360',
        description: '全方向・ジャイロ操作のARシューティング',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#101018',
        theme_color: '#101018',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
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
