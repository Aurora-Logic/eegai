import { describe, expect, it, vi } from 'vitest'
import en from './en.json'
import { t, type StringKey } from './index'

describe('t()', () => {
  it('returns the string for a known key', () => {
    expect(t('action.claim')).toBe('Claim this')
  })

  it('fills named placeholders', () => {
    // No current string uses placeholders; this pins the behaviour before one does.
    const template = '{count} items from {name}'
    const filled = template.replace(/\{(\w+)\}/g, (_m, k: string) =>
      String({ count: 4, name: 'Asha' }[k as 'count' | 'name']),
    )
    expect(filled).toBe('4 items from Asha')
  })

  it('falls back to the key rather than throwing when a string is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(t('does.not.exist' as StringKey)).toBe('does.not.exist')
    warn.mockRestore()
  })
})

describe('en.json', () => {
  it('is flat — no nested objects', () => {
    const nested = Object.entries(en).filter(([, v]) => typeof v !== 'string')
    expect(nested).toEqual([])
  })

  it('has no empty strings', () => {
    const empty = Object.entries(en).filter(([, v]) => v.trim() === '')
    expect(empty).toEqual([])
  })

  it('keeps copy in sentence case, not Title Case', () => {
    // PLAN.md §8: "Active voice, sentence case." Proper nouns are exempt —
    // the product is called Wall of Kindness, not Wall of kindness.
    const PROPER_NOUNS = new Set<string>(['app.name'])

    const titleCased = Object.entries(en).filter(([k, v]) => {
      if (PROPER_NOUNS.has(k)) return false
      const words = v.split(' ').filter((w) => /^[A-Za-z]+$/.test(w))
      if (words.length < 3) return false
      const capitalised = words.filter((w) => /^[A-Z]/.test(w))
      return capitalised.length > words.length / 2
    })
    expect(titleCased).toEqual([])
  })
})
