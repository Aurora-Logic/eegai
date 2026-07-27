import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a donor part-way through posting an item
      // must not have the page swapped under them. UpdatePrompt asks first.
      registerType: 'prompt',
      // Registration happens in src/components/shared/pwa-prompt.tsx via
      // useRegisterSW, so the plugin must not also inject its own script.
      injectRegister: null,
      includeAssets: ['favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Wall of Kindness',
        short_name: 'The Wall',
        description: 'Give what you no longer need to an NGO that needs it.',
        lang: 'en-IN',
        theme_color: '#21324F',
        background_color: '#EBE7DC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['social', 'lifestyle'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          // Android crops to a circle; this one has the mark inside the safe zone.
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // SPA offline shell — any navigation while offline is served the
        // precached index.html, which then renders the offline route.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Without this the offline shell renders in a system fallback face
            // and the whole layout shifts — the exact reflow §8 warns about.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // The quality floor in PLAN.md §8 is 250KB gzipped total JS. Warn well
    // before we get there so a regression is visible in CI output.
    chunkSizeWarningLimit: 600,
  },
})
