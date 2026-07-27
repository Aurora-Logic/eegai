#!/usr/bin/env node
/**
 * Generates placeholder photos for the seeded donations.
 *
 * The wall is a masonry layout sized by aspect ratio (PLAN.md §8), so these
 * come in a spread of shapes — a demo where every tile is a square does not
 * exercise the layout at all. Deliberately abstract: flat bands in the brand
 * palette, not fake photographs of real donated goods.
 *
 * Run: node scripts/seed-images.mjs   (called by scripts/db.mjs reset)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from './lib/png.mjs'

const OUT_DIR = join('storage', 'seed')

const PALETTE = [
  [0xc9, 0xa8, 0x7c], // kraft
  [0x4a, 0x6b, 0x4f], // moss
  [0xe8, 0xa3, 0x17], // marigold
  [0x21, 0x32, 0x4f], // indigo
  [0xc0, 0x44, 0x2e], // vermilion
  [0xd8, 0xd2, 0xc2], // dim plaster
]

// Portrait, square and landscape, so the masonry has something to solve.
const SHAPES = [
  [480, 640],
  [640, 640],
  [640, 480],
  [480, 720],
  [720, 480],
]

mkdirSync(OUT_DIR, { recursive: true })

let written = 0
for (let i = 0; i < 12; i++) {
  const shape = SHAPES[i % SHAPES.length]
  const [w, h] = shape
  const base = PALETTE[i % PALETTE.length]
  const accent = PALETTE[(i + 2) % PALETTE.length]

  // Two diagonal bands. Enough structure to tell tiles apart at a glance.
  const png = render(w, h, (x, y) => {
    const t = (x / w + y / h) / 2
    const band = Math.floor(t * 5) % 2
    if (band === 0) return base
    return accent
  })

  writeFileSync(join(OUT_DIR, `${i}.png`), png)
  written += 1
}

console.log(`  ${written} seed photos written to ${OUT_DIR}/`)
