import { describe, expect, it } from 'vitest'
import { renderPdf, type PdfBlock } from '../src/lib/pdf.ts'

/**
 * The receipt writer is hand-rolled (see server/src/lib/pdf.ts for why), and the
 * failure mode that matters is a *structurally* broken file — one where the xref
 * offsets do not point at the objects they claim to. Some readers repair that
 * silently and others refuse the file, so it can look fine on the machine that
 * wrote it and be unopenable for the donor. These tests parse the file back.
 */
function parse(pdf: Buffer) {
  const text = pdf.toString('latin1')
  const startxref = Number(text.match(/startxref\n(\d+)/)?.[1])
  const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
  return { text, startxref, offsets }
}

const MINIMAL: PdfBlock[] = [
  { kind: 'text', text: 'EEGAI', font: 'bold', size: 26 },
  { kind: 'rule' },
  { kind: 'text', text: 'Record of goods donated' },
]

describe('renderPdf', () => {
  it('writes a file with a header and a terminator', () => {
    const pdf = renderPdf(MINIMAL, 'test')
    const text = pdf.toString('latin1')

    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  /**
   * The one that would actually bite. Every xref entry must be the byte offset of
   * the object it indexes — if the table drifts by even one byte the file is
   * invalid, and nothing in normal use would reveal it.
   */
  it('points every xref entry at the object it claims', () => {
    const pdf = renderPdf(MINIMAL, 'test')
    const { text, offsets } = parse(pdf)

    expect(offsets).toHaveLength(8)
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })

  it('points startxref at the xref table', () => {
    const pdf = renderPdf(MINIMAL, 'test')
    const { text, startxref } = parse(pdf)

    expect(text.slice(startxref, startxref + 4)).toBe('xref')
  })

  it('declares a stream length matching the bytes actually written', () => {
    const pdf = renderPdf(MINIMAL, 'test')
    const text = pdf.toString('latin1')

    const declared = Number(text.match(/<< \/Length (\d+) >>/)?.[1])
    const body = text.match(/stream\n([\s\S]*?)\nendstream/)?.[1] ?? ''

    expect(Buffer.byteLength(body, 'latin1')).toBe(declared)
  })

  /**
   * An unescaped paren closes the string early and corrupts everything after it.
   * A donor called "Priya (Amma)" is not an exotic input.
   */
  it('escapes parens and backslashes in donor-supplied text', () => {
    const pdf = renderPdf([{ kind: 'text', text: 'Priya (Amma) \\ Kumar' }], 'test')
    const text = pdf.toString('latin1')

    expect(text).toContain('Priya \\(Amma\\) \\\\ Kumar')
    const { text: full, offsets } = parse(pdf)
    offsets.forEach((offset, index) => {
      expect(full.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })

  /**
   * Tamil cannot render without an embedded font, so it is stripped rather than
   * written as broken bytes. This documents that limit rather than pretending it
   * does not exist — the app name appears as "EEGAI" alone on the receipt.
   */
  it('drops characters it cannot encode instead of writing invalid bytes', () => {
    const pdf = renderPdf([{ kind: 'text', text: 'EEGAI ஈகை' }], 'test')
    const text = pdf.toString('latin1')

    expect(text).toContain('(EEGAI )')
    expect(text).not.toContain('ஈகை')
  })

  it('transliterates the rupee sign, which is outside Latin-1', () => {
    const pdf = renderPdf([{ kind: 'text', text: '₹40 courier fee' }], 'test')
    expect(pdf.toString('latin1')).toContain('Rs 40 courier fee')
  })

  it('stays on one page when given far more content than fits', () => {
    const many: PdfBlock[] = Array.from({ length: 400 }, (_, i) => ({
      kind: 'text' as const,
      text: `Line ${i}`,
    }))
    const pdf = renderPdf(many, 'test')
    const text = pdf.toString('latin1')

    expect(text.match(/\/Type \/Page[^s]/g) ?? []).toHaveLength(1)
    expect(text).toContain('/Count 1')
  })
})
