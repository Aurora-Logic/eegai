/**
 * Minimal PNG encoder (8-bit RGBA, no interlace) built on node:zlib alone.
 *
 * Shared by generate-icons.mjs and seed-images.mjs. Pulling in sharp or canvas
 * to draw flat rectangles would be a dependency PLAN.md §3 does not list.
 */
import { crc32, deflateSync } from 'node:zlib'

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData) >>> 0)
  return Buffer.concat([len, typeAndData, crc])
}

export function encodePng(width, height, rgba) {
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

/** Coverage test for a rounded rectangle — true inside, false outside. */
export function insideRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * Renders with `shade(x, y) -> [r,g,b]` at `ss`x supersampling for cheap
 * anti-aliasing, and returns encoded PNG bytes.
 */
export function render(width, height, shade, ss = 3) {
  const acc = new Float64Array(width * height * 3)
  const cov = new Float64Array(width * height)

  for (let sy = 0; sy < height * ss; sy++) {
    for (let sx = 0; sx < width * ss; sx++) {
      const colour = shade(sx / ss, sy / ss)
      const i = Math.floor(sy / ss) * width + Math.floor(sx / ss)
      acc[i * 3] += colour[0]
      acc[i * 3 + 1] += colour[1]
      acc[i * 3 + 2] += colour[2]
      cov[i] += 1
    }
  }

  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const n = cov[i] || 1
    rgba[i * 4] = Math.round(acc[i * 3] / n)
    rgba[i * 4 + 1] = Math.round(acc[i * 3 + 1] / n)
    rgba[i * 4 + 2] = Math.round(acc[i * 3 + 2] / n)
    rgba[i * 4 + 3] = 255
  }

  return encodePng(width, height, rgba)
}
