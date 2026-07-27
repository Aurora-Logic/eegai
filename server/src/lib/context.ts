import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  requestId: string
  startedAt: number
}

/**
 * Carries the request id from the HTTP middleware down to the database layer
 * without threading a parameter through every route handler and helper.
 *
 * AsyncLocalStorage rather than a module-level variable: concurrent requests
 * interleave, and a shared variable would attribute one user's mutation to
 * another user's request id — worse than having no id at all.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>()

export function currentRequestId(): string {
  return requestContext.getStore()?.requestId ?? ''
}
