import { currentRequestId } from './context.ts'
import { env } from './env.ts'

type Level = 'debug' | 'info' | 'warn' | 'error'

/**
 * JSON lines in production, readable text in development.
 *
 * Every line carries the request id, so a failure a donor reports maps to one
 * request, its log lines, and the audit_log rows it wrote — the trail is only
 * as good as its weakest link, and grep-and-hope is that weak link.
 */
function emit(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const requestId = currentRequestId()
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(requestId ? { request_id: requestId } : {}),
    ...fields,
  }

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

  if (env.NODE_ENV === 'development') {
    const suffix = Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
    sink(
      `${level.toUpperCase().padEnd(5)} ${requestId.slice(0, 8) || '········'} ${message} ${suffix}`,
    )
    return
  }

  sink(JSON.stringify(entry))
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
}
