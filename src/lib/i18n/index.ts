import en from './en.json'
import ta from './ta.json'
import hi from './hi.json'

/**
 * Every user-facing string goes through `t()` (PLAN.md §8).
 *
 * The three locales are the ones the pilot actually needs: English, Tamil for
 * Coimbatore, and Hindi for the sizeable non-Tamil-speaking population there.
 * All three dictionaries are flat and share exactly the same key set, which a
 * test enforces — a missing Tamil string would otherwise surface as a raw dotted
 * key in front of a donor.
 *
 * The dictionaries are imported statically rather than lazily. Together they are
 * a few KB of JSON against a 250KB budget, and splitting them would buy a flash
 * of English on every language switch.
 */
export const LOCALES = ['en', 'ta', 'hi'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * What each language calls itself. Deliberately never translated — a language
 * picker written in a language you cannot read is useless to exactly the person
 * who needs it.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिन्दी',
}

const dictionaries: Record<Locale, Record<string, string>> = { en, ta, hi }

export type StringKey = keyof typeof en

const STORAGE_KEY = 'eegai.locale'

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Saved choice first, then what the browser asks for, then English.
 *
 * `navigator.languages` carries region tags like `ta-IN`, so only the primary
 * subtag is compared — a phone set to Tamil should get Tamil regardless of which
 * country it thinks it is in.
 */
function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    // Private browsing can throw on localStorage. Not a reason to fail to render.
  }

  for (const tag of navigator.languages ?? []) {
    const primary = tag.split('-')[0]
    if (isLocale(primary)) return primary
  }
  return 'en'
}

let activeLocale: Locale = initialLocale()
const listeners = new Set<() => void>()

/**
 * A tiny external store rather than React context.
 *
 * `t()` is called from module scope in some places and from components
 * everywhere; threading a context value through all of them would mean touching
 * every call site. This keeps `t(key)` as the whole API and lets a single
 * `useSyncExternalStore` at the root re-render the tree when the language
 * changes.
 */
export function subscribeToLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLocale(): Locale {
  return activeLocale
}

export function setLocale(locale: Locale): void {
  if (locale === activeLocale) return
  activeLocale = locale

  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // A locale that does not survive a reload still beats one that throws.
  }

  // Screen readers switch voice on this, and it drives the browser's font and
  // line-breaking choices. Forgetting it is the usual i18n bug.
  document.documentElement.lang = locale

  for (const listener of listeners) listener()
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = activeLocale
}

/**
 * Look up a string. `vars` fills `{name}`-style placeholders.
 *
 * Falls back through English before giving up, so a gap in a translation shows
 * real words rather than a dotted key — which matters far more with three
 * dictionaries than it did with one. A missing key everywhere returns the key
 * rather than throwing: a broken label is survivable in front of a donor, a
 * white screen is not.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const template = dictionaries[activeLocale][key] ?? dictionaries.en[key]

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
