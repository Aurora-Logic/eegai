/**
 * The one place the client talks to the API.
 *
 * Same-origin in dev via Vite's proxy, so the session cookie is first-party and
 * there is no token for the client to hold, leak, or forget to refresh.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly issues?: unknown,
    /** Echoed by the server; the one string worth showing a user on failure. */
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let mostRecentRequestId: string | null = null

/** The id of the last request the client made, for the error boundary. */
export function lastRequestId(): string | null {
  return mostRecentRequestId
}

function newRequestId(): string {
  // crypto.randomUUID needs a secure context; the fallback keeps the id format
  // valid on plain http during local testing rather than sending nothing.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface ApiErrorBody {
  error?: string
  code?: string
  issues?: unknown
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  const requestId = newRequestId()
  mostRecentRequestId = requestId

  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        // Generated client-side so the id exists even if the request never
        // reaches the server, and so a retry is distinguishable from a repeat.
        'X-Request-Id': requestId,
        ...init.headers,
      },
    })
  } catch {
    // A network failure is the common case on patchy 4G, and it deserves a
    // message about connectivity rather than a generic error.
    throw new ApiError(
      0,
      "You're offline. Check your connection and try again.",
      undefined,
      undefined,
      requestId,
    )
  }

  mostRecentRequestId = response.headers.get('x-request-id') ?? requestId

  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error ?? 'That did not go through. Try again.',
      body.code,
      body.issues,
      mostRecentRequestId ?? requestId,
    )
  }

  return body
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  /** Partial update — send only what changed, never the whole record. */
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  /**
   * `fields` carries the upload kind. Acknowledgement photos are stored under a
   * different prefix and read back through an RLS check, so the server has to be
   * told which sort it is receiving — see server/src/routes/uploads.ts.
   */
  upload: <T>(path: string, file: File, fields?: Record<string, string>) => {
    const form = new FormData()
    form.append('file', file)
    for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value)
    return request<T>(path, { method: 'POST', body: form })
  },
}

/** Uploaded photos are served through the authenticated file route. */
export function photoUrl(storagePath: string): string {
  return `/api/files/${storagePath}`
}
