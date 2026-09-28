import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Offline app shell for the website (the service worker is registered in main.tsx, web only —
    // never inside the Capacitor phone app, which already ships its files).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      // public/manifest.webmanifest is already linked from index.html.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // Short links and server routes must always reach the network (Firebase Hosting rewrites);
        // /__/ is Firebase's reserved auth/hosting path. Storefront pages (/s/…) are SPA routes and work offline.
        navigateFallbackDenylist: [/^\/l\//, /^\/api\//, /^\/__\//],
        runtimeCaching: [
          {
            // Cart photos on S3.
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/prod\.docs\.s3\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cart-photos',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
              // <img> loads are opaque (no-cors) while canvas/graphics loads use CORS; keep them apart so a
              // cached opaque copy is never handed to a CORS request (which would fail to load).
              plugins: [{ cacheKeyWillBeUsed: async ({ request }) => `${request.url}#${request.mode}` }],
            },
          },
        ],
      },
    }),
  ],
})
