import { afterEach, vi } from 'vitest'

// This file is the global setup for every suite, including the server ones that
// run under `// @vitest-environment node`. Anything DOM-specific has to be
// guarded, or those suites fail before their first assertion.
const isBrowserLike = typeof window !== 'undefined'

if (isBrowserLike) {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')

  afterEach(() => {
    cleanup()
  })

  // jsdom has no matchMedia; useTheme reads it on first render.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}
