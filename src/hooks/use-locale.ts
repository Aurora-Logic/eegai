import { useSyncExternalStore } from 'react'
import { getLocale, subscribeToLocale, type Locale } from '@/lib/i18n'

/**
 * Re-renders the caller when the language changes.
 *
 * Called once at the root of the app. `t()` reads the active locale at call
 * time, so a single re-render from here refreshes every string below without
 * any component needing to know i18n exists. Nothing is memoised between the
 * root and the leaves, so the whole tree re-renders — and nothing unmounts, so
 * a half-filled form survives a language switch.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeToLocale, getLocale, getLocale)
}
