#!/usr/bin/env node
/**
 * Generates the PWA icon set into public/.
 *
 * The mark is the wall itself: marigold bricks in a running bond on an indigo
 * ground. Drawn procedurally rather than checked in as binaries so the brand
 * hexes have exactly one source of truth — change them here and in globals.css
 * and nothing else needs touching.
 *
 * Written against node:zlib alone. Pulling in sharp or canvas for six small
 * squares would be a dependency PLAN.md §3 does not list.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { crc32, deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const INDIGO = [0x21, 0x32, 0x4f]
const MARIGOLD = [0xe8, 0xa3, 0x17]
const PLASTER = [0xeb, 0xe7, 0xdc]

const OUT_DIR = 'public'

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, no interlace)
// ---------------------------------------------------------------------------

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData) >>> 0)
  return Buffer.concat([len, typeAndData, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const src = y * width * 4
    const dst = y * (1 + width * 4)
    raw[dst] = 0
    rgba.copy(raw, dst + 1, src, src + width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Coverage of a rounded rectangle at a point — 1 inside, 0 outside. */
function insideRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * @param size      output edge length in px
 * @param inset     fraction of the canvas kept clear around the wall. Maskable
 *                  icons get a bigger inset so the mark survives Android's
 *                  circular crop.
 * @param ground    background colour
 */
function drawIcon(size, inset, ground) {
  const SS = 3 // supersample factor — cheap anti-aliasing
  const S = size * SS
  const acc = new Float64Array(size * size * 3)
  const cov = new Float64Array(size * size)

  const margin = S * inset
  const wallX = margin
  const wallY = margin
  const wallW = S - margin * 2
  const wallH = S - margin * 2

  const rows = 3
  const gap = wallH * 0.055
  const brickH = (wallH - gap * (rows - 1)) / rows
  const brickW = (wallW - gap) / 2
  const radius = brickH * 0.14

  // Precompute brick rectangles in a running bond, clipped to the wall.
  const bricks = []
  for (let r = 0; r < rows; r++) {
    const by = wallY + r * (brickH + gap)
    const offset = r % 2 === 1 ? -(brickW + gap) / 2 : 0
    for (let k = -1; k <= 2; k++) {
      const bx = wallX + offset + k * (brickW + gap)
      const x0 = Math.max(bx, wallX)
      const x1 = Math.min(bx + brickW, wallX + wallW)
      if (x1 - x0 > brickW * 0.12) {
        bricks.push({ x: x0, y: by, w: x1 - x0, h: brickH })
      }
    }
  }

  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      let colour = ground
      for (const b of bricks) {
        if (insideRoundedRect(sx + 0.5, sy + 0.5, b.x, b.y, b.w, b.h, radius)) {
          colour = MARIGOLD
          break
        }
      }
      const di = (Math.floor(sy / SS) * size + Math.floor(sx / SS)) * 3
      const ci = Math.floor(sy / SS) * size + Math.floor(sx / SS)
      acc[di] += colour[0]
      acc[di + 1] += colour[1]
      acc[di + 2] += colour[2]
      cov[ci] += 1
    }
  }

  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const n = cov[i]
    rgba[i * 4] = Math.round(acc[i * 3] / n)
    rgba[i * 4 + 1] = Math.round(acc[i * 3 + 1] / n)
    rgba[i * 4 + 2] = Math.round(acc[i * 3 + 2] / n)
    rgba[i * 4 + 3] = 255
  }

  return encodePng(size, size, rgba)
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  // Standard icons: mark fills most of the tile.
  { file: 'pwa-192.png', size: 192, inset: 0.14, ground: INDIGO },
  { file: 'pwa-512.png', size: 512, inset: 0.14, ground: INDIGO },
  // Maskable: Android crops to a circle, so the mark sits inside the 80% safe zone.
  { file: 'pwa-maskable-512.png', size: 512, inset: 0.26, ground: INDIGO },
  // iOS does not respect maskable and draws its own rounded corners.
  { file: 'apple-touch-icon.png', size: 180, inset: 0.16, ground: INDIGO },
  // Favicon reads better light-on-dark at 48px in a browser tab strip.
  { file: 'favicon-48.png', size: 48, inset: 0.1, ground: INDIGO },
]

for (const target of targets) {
  const png = drawIcon(target.size, target.inset, target.ground)
  writeFileSync(join(OUT_DIR, target.file), png)
  console.log(`  ${String(png.length).padStart(7)} B  ${OUT_DIR}/${target.file}`)
}

// Keep the linter honest about the unused plaster import if the palette changes.
void PLASTER

console.log('\nIcons written. They are generated — edit this script, not the PNGs.')
