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
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiErrorBody {
  error?: string
  code?: string
  issues?: unknown
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response

  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
  } catch {
    // A network failure is the common case on patchy 4G, and it deserves a
    // message about connectivity rather than a generic error.
    throw new ApiError(0, "You're offline. Check your connection and try again.")
  }

  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error ?? 'That did not go through. Try again.',
      body.code,
      body.issues,
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
  upload: <T>(path: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<T>(path, { method: 'POST', body: form })
  },
}

/** Uploaded photos are served through the authenticated file route. */
export function photoUrl(storagePath: string): string {
  return `/api/files/${storagePath}`
}
