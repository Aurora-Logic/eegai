import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    // Component tests need a DOM; the server suites opt into node with a
    // `// @vitest-environment node` pragma at the top of the file.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    css: false,
    // The RLS and state-machine suites share one seeded database and assert on
    // row counts, so they must not interleave with each other.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
