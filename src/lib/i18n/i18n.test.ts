import { afterEach, describe, expect, it, vi } from 'vitest'
import en from './en.json'
import ta from './ta.json'
import hi from './hi.json'
import { LOCALES, LOCALE_NAMES, getLocale, setLocale, t, type StringKey } from './index'

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

/**
 * Three dictionaries make a whole class of bug possible that one could not: a
 * key added in English and forgotten in Tamil renders as a raw dotted key in
 * front of a donor. `t()` falls back through English so it degrades to real
 * words, but the gap should fail here rather than ship quietly.
 */
describe('translations', () => {
  const dictionaries = { ta, hi } as const

  afterEach(() => setLocale('en'))

  it.each(Object.keys(dictionaries) as (keyof typeof dictionaries)[])(
    '%s covers every English key, and adds none of its own',
    (name) => {
      const dictionary: Record<string, string> = dictionaries[name]
      expect(Object.keys(en).filter((k) => !(k in dictionary))).toEqual([])
      expect(Object.keys(dictionary).filter((k) => !(k in en))).toEqual([])
    },
  )

  it.each(Object.keys(dictionaries) as (keyof typeof dictionaries)[])(
    '%s has no empty strings and no untranslated leftovers',
    (name) => {
      const dictionary: Record<string, string> = dictionaries[name]
      expect(Object.entries(dictionary).filter(([, v]) => v.trim() === '')).toEqual([])

      // A value identical to the English one is usually a forgotten key rather
      // than a deliberate choice. The exceptions are the product name, the Tamil
      // script logotype which is the same in every locale, and file-format
      // acronyms that are not words in any language.
      const SHARED = new Set(['app.name', 'app.nameScript', 'post.dropHint'])
      const copied = Object.entries(dictionary).filter(
        ([k, v]) => !SHARED.has(k) && v === en[k as StringKey],
      )
      expect(copied).toEqual([])
    },
  )

  it('preserves the {left} placeholder wherever English has one', () => {
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(en)) {
        const placeholders = value.match(/\{(\w+)\}/g) ?? []
        for (const placeholder of placeholders) {
          expect(
            (dictionary as Record<string, string>)[key],
            `${name}.${key} dropped ${placeholder}`,
          ).toContain(placeholder)
        }
      }
    }
  })

  it('switches what t() returns, and back again', () => {
    expect(t('action.claim')).toBe('Claim this')

    setLocale('ta')
    expect(getLocale()).toBe('ta')
    expect(t('action.claim')).toBe(ta['action.claim'])

    setLocale('hi')
    expect(t('action.claim')).toBe(hi['action.claim'])

    setLocale('en')
    expect(t('action.claim')).toBe('Claim this')
  })

  it('names every language in its own script, so the picker is readable', () => {
    // Someone who reads only Tamil has to find தமிழ், not the English word.
    expect(LOCALE_NAMES.ta).toBe('தமிழ்')
    expect(LOCALE_NAMES.hi).toBe('हिन्दी')
    expect(LOCALES).toEqual(['en', 'ta', 'hi'])
  })
})
