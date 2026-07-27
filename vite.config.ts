import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA is scaffolded here in M0 but only hardened in M8 (offline shell, install
// prompt). `injectRegister: null` keeps the service worker out of the bundle
// until then — see DECISIONS.md.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'Wall of Kindness',
        short_name: 'The Wall',
        description: 'Give what you no longer need to an NGO that needs it.',
        theme_color: '#21324F',
        background_color: '#EBE7DC',
        display: 'standalone',
        start_url: '/',
        icons: [],
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
