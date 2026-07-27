import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { Hono } from 'hono'
import { env } from '../lib/env.ts'
import { requireAuth, type AppEnv } from '../middleware/auth.ts'

export const uploadRoutes = new Hono<AppEnv>()

// Images are already compressed client-side to ~400KB (PLAN.md §3); this is a
// backstop against a crafted request, not the primary limit.
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

uploadRoutes.post('/', requireAuth, async (c) => {
  const form = await c.req.parseBody()
  const file = form['file']

  if (!(file instanceof File)) {
    return c.json({ error: 'Attach a photo.' }, 400)
  }

  const ext = ALLOWED.get(file.type)
  if (!ext) {
    return c.json({ error: 'Photos must be JPEG, PNG or WebP.' }, 415)
  }

  if (file.size > MAX_BYTES) {
    return c.json({ error: 'That photo is too large. Try again from the app.' }, 413)
  }

  // Sharded by first two hex chars so one directory never holds every photo.
  const id = randomUUID()
  const shard = id.slice(0, 2)
  const relative = join('donations', shard, `${id}${ext}`)
  const absolute = join(env.STORAGE_DIR, relative)

  await mkdir(join(env.STORAGE_DIR, 'donations', shard), { recursive: true })
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()))

  return c.json({ path: relative }, 201)
})

/**
 * Serves an uploaded photo.
 *
 * Authorization here is coarse — any signed-in user who knows a path can read
 * it — because paths are unguessable UUIDs. Tightening this to "only parties to
 * the donation" needs a lookup per request and is a real M6 task, since
 * acknowledgement photos are supposed to be donor-only.
 */
uploadRoutes.get('/*', requireAuth, async (c) => {
  const requested = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ''))

  // Reject traversal before touching the filesystem.
  const safe = normalize(requested)
  if (safe.startsWith('..') || safe.startsWith('/') || safe.includes('\0')) {
    return c.json({ error: 'Not found.' }, 404)
  }

  try {
    const data = await readFile(join(env.STORAGE_DIR, safe))
    const type =
      extname(safe) === '.png'
        ? 'image/png'
        : extname(safe) === '.webp'
          ? 'image/webp'
          : 'image/jpeg'

    return c.body(new Uint8Array(data), 200, {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=86400',
    })
  } catch {
    return c.json({ error: 'Not found.' }, 404)
  }
})
