import { randomUUID } from 'node:crypto'
import type { MiddlewareHandler, Next } from 'hono'
import { requestContext } from '../lib/context.ts'
import { log } from '../lib/logger.ts'
import type { AppEnv } from './auth.ts'

const REQUEST_ID_HEADER = 'x-request-id'

/** A client-supplied id is only trusted if it looks like one — it lands in logs. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/

/**
 * Assigns a request id, puts it in AsyncLocalStorage for the whole request,
 * echoes it back in the response header, and logs one line per request.
 *
 * The echo matters: the client shows it on the error screen, so a user can
 * read out an id that maps to exactly one server-side trail.
 */
export const observability: MiddlewareHandler<AppEnv> = async (c, next: Next) => {
  const supplied = c.req.header(REQUEST_ID_HEADER)
  const requestId = supplied && SAFE_ID.test(supplied) ? supplied : randomUUID()
  const startedAt = Date.now()

  c.header(REQUEST_ID_HEADER, requestId)
  c.set('requestId', requestId)

  await requestContext.run({ requestId, startedAt }, async () => {
    await next()

    const actor = c.get('actor')
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - startedAt,
      ...(actor ? { user_id: actor.userId, role: actor.role } : {}),
    })
  })
}
