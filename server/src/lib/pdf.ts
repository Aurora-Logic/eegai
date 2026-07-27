/**
 * A minimal PDF writer — enough for a one-page receipt, and nothing more.
 *
 * PLAN.md §10 says not to add a dependency without asking. Every PDF library
 * worth having (pdfkit, pdf-lib) is a real dependency with a real tree, and what
 * M6 actually needs is one page of left-aligned text in one font. PDF's base-14
 * fonts mean no font file has to be embedded, which is the only genuinely hard
 * part of writing a PDF by hand.
 *
 * Deliberate limits, so nobody mistakes this for a general renderer:
 * - One page. No pagination. A receipt that overflows is truncated, not spilled.
 * - WinAnsi only. Tamil cannot be rendered without embedding a font, so the
 *   receipt is English-only until someone subsets Noto Sans Tamil. See §8.
 * - Text widths are approximated, so wrapping is close but not typeset-exact.
 */

const PAGE_WIDTH = 595.28 // A4 portrait, in points
const PAGE_HEIGHT = 841.89
const MARGIN = 56

export type PdfFont = 'body' | 'bold' | 'mono'

const FONT_RESOURCE: Record<PdfFont, string> = {
  body: '/F1',
  bold: '/F2',
  mono: '/F3',
}

/**
 * Mean glyph width as a fraction of font size. Helvetica's real widths live in
 * an AFM table; carrying that table to wrap three paragraphs is not worth it, so
 * these are measured averages rounded up slightly. Erring wide means a line
 * wraps one word early rather than running into the margin.
 */
const WIDTH_FACTOR: Record<PdfFont, number> = {
  body: 0.52,
  bold: 0.55,
  mono: 0.6, // Courier is monospaced at exactly 0.6
}

export type PdfBlock =
  | { kind: 'text'; text: string; font?: PdfFont; size?: number; gapAfter?: number }
  | { kind: 'rule'; gapAfter?: number }
  | { kind: 'space'; height: number }

/**
 * PDF text strings are parenthesised, so a literal backslash or paren has to be
 * escaped or the file is structurally broken rather than merely ugly.
 *
 * Anything outside Latin-1 is transliterated where there is an obvious ASCII
 * equivalent and dropped otherwise — a stray glyph is better rendered as "Rs"
 * than as a broken box, and far better than a corrupt file.
 */
function encodeText(input: string): string {
  return input
    .replace(/₹/g, 'Rs ') // ₹
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

/** Greedy wrap against the approximate width. Long unbreakable tokens are cut. */
function wrap(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const perChar = size * WIDTH_FACTOR[font]
  const maxChars = Math.max(8, Math.floor(maxWidth / perChar))
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }

    let current = ''
    for (const word of paragraph.split(/\s+/)) {
      // A single token longer than the line (a UUID, say) is hard-cut rather
      // than allowed to run off the page edge.
      if (word.length > maxChars) {
        if (current) {
          lines.push(current)
          current = ''
        }
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars))
        }
        continue
      }

      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxChars) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
  }

  return lines
}

/**
 * Lays the blocks out top-down and returns the page's content stream.
 *
 * Blocks that would fall below the bottom margin are dropped. The receipt is
 * composed to fit; silently running off the page would be worse than stopping.
 */
function contentStream(blocks: PdfBlock[]): string {
  const usableWidth = PAGE_WIDTH - MARGIN * 2
  const ops: string[] = []
  let y = PAGE_HEIGHT - MARGIN

  for (const block of blocks) {
    if (block.kind === 'space') {
      y -= block.height
      continue
    }

    if (block.kind === 'rule') {
      if (y < MARGIN) break
      ops.push(
        `0.8 w 0.82 0.79 0.72 RG ${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`,
      )
      y -= block.gapAfter ?? 14
      continue
    }

    const font = block.font ?? 'body'
    const size = block.size ?? 11
    const leading = size * 1.45

    for (const line of wrap(block.text, font, size, usableWidth)) {
      if (y < MARGIN) return ops.join('\n')
      if (line !== '') {
        ops.push(
          `BT ${FONT_RESOURCE[font]} ${size} Tf 0.13 0.20 0.31 rg ${MARGIN} ${y.toFixed(2)} Td (${encodeText(line)}) Tj ET`,
        )
      }
      y -= leading
    }

    y -= block.gapAfter ?? 6
  }

  return ops.join('\n')
}

/**
 * Assembles the object table, xref and trailer.
 *
 * The xref offsets are byte offsets into the finished file, so the body is built
 * as a byte-length-tracked list rather than concatenated at the end — getting
 * this wrong produces a file that some readers open and others reject, which is
 * the worst possible failure mode.
 */
export function renderPdf(blocks: PdfBlock[], title: string): Buffer {
  const stream = contentStream(blocks)

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Title (${encodeText(title)}) /Producer (EEGAI) /Creator (EEGAI) >>`,
  ]

  const chunks: Buffer[] = []
  let offset = 0
  const offsets: number[] = []

  function push(text: string) {
    const buffer = Buffer.from(text, 'latin1')
    chunks.push(buffer)
    offset += buffer.length
  }

  push('%PDF-1.4\n')
  // A binary comment marks the file as binary for transfer-mode heuristics.
  push('%\xE2\xE3\xCF\xD3\n')

  objects.forEach((body, index) => {
    offsets.push(offset)
    push(`${index + 1} 0 obj\n${body}\nendobj\n`)
  })

  const xrefOffset = offset
  const count = objects.length + 1

  // Every xref entry is exactly 20 bytes. Padding is load-bearing, not cosmetic.
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (const entry of offsets) {
    xref += `${String(entry).padStart(10, '0')} 00000 n \n`
  }
  push(xref)

  push(
    `trailer\n<< /Size ${count} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`,
  )

  return Buffer.concat(chunks)
}
