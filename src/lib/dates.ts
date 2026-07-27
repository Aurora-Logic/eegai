/**
 * Date formatting via `Intl`, which is already in the browser.
 *
 * This replaces date-fns. Four call sites used two of its functions and pulled
 * in ~16KB gzipped between the library and its en-US locale chunk — against a
 * budget with under 2KB of headroom left, that was the cheapest real byte to
 * find, and `Intl.DateTimeFormat` does the same job with nothing shipped.
 *
 * Everything is rendered in IST. The pilot is in Coimbatore, and a timestamp a
 * donor reads should be the time it happened to them, not the time on whatever
 * machine served the page.
 *
 * Formatters are built once and reused — constructing an `Intl.DateTimeFormat`
 * is the expensive part, and these render inside lists.
 */
const IST = 'Asia/Kolkata'

const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: IST,
})

const dayMonthYearTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: IST,
})

const weekdayDayMonth = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: IST,
})

const stamp = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: IST,
})

/** "27 Jul 2026" */
export function formatDate(value: string | Date): string {
  return dayMonthYear.format(new Date(value))
}

/** "27 Jul 2026, 14:32" */
export function formatDateTime(value: string | Date): string {
  return dayMonthYearTime.format(new Date(value))
}

/** "Tue, 28 Jul" — a pickup slot, where the weekday matters and the year does not. */
export function formatDayMonth(value: string | Date): string {
  return weekdayDayMonth.format(new Date(value))
}

/** "2026-07-27, 14:32:07" — the audit trail, where sorting matters more than prose. */
export function formatStamp(value: string | Date): string {
  return stamp.format(new Date(value))
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/**
 * "3 days ago", "last month".
 *
 * Picks the largest unit that gives a count of at least one, which is what makes
 * "2 months ago" read better than "61 days ago". Anything under a minute is
 * "just now" rather than "0 seconds ago".
 */
export function formatRelative(value: string | Date): string {
  const elapsed = Date.now() - new Date(value).getTime()

  for (const [unit, ms] of UNITS) {
    const count = Math.round(elapsed / ms)
    if (Math.abs(count) >= 1) return relative.format(-count, unit)
  }
  return 'just now'
}
