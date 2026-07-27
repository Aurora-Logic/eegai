import en from './en.json'

/**
 * Every user-facing string goes through `t()`, even now when English is the
 * only locale (PLAN.md §8). v1 does not ship a language switcher — this exists
 * so that adding Marathi and Hindi later is a data change, not a refactor of
 * every component.
 */
export type Locale = 'en'

const dictionaries = { en } as const

export type StringKey = keyof typeof en

let activeLocale: Locale = 'en'

/**
 * Look up a string. `vars` fills `{name}`-style placeholders.
 *
 * A missing key returns the key itself rather than throwing — a broken label is
 * survivable in front of a donor, a white screen is not. The dev warning is
 * what catches it in review.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const dict: Record<string, string> = dictionaries[activeLocale]
  const template = dict[key]

  if (template === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] missing string: ${key}`)
    }
    return key
  }

  if (!vars) return template

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

export function setLocale(locale: Locale) {
  activeLocale = locale
}
