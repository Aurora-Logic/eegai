import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { Hono, type Context } from 'hono'
import { withActor, withSystemActor } from '../lib/db.ts'
import { env } from '../lib/env.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'

export const uploadRoutes = new Hono<AppEnv>()

// Images are already compressed client-side to ~400KB (PLAN.md §3); this is a
// backstop against a crafted request, not the primary limit.
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

/**
 * Two kinds of photo, with genuinely different audiences.
 *
 * A donation photo is public to every NGO that can see the item on the wall. An
 * acknowledgement photo shows where someone's belongings ended up and is meant
 * for that donor alone (PLAN.md §M6). They are stored under different prefixes
 * so the read path can tell them apart without a database lookup on every hit.
 */
const KINDS = new Set(['donation', 'acknowledgement'])

/** Malformed percent-encoding ('%zz') must be a 404, not an unhandled 500. */
function decodePath(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

async function profileIdOf(c: Context<AppEnv>): Promise<string | null> {
  const actor = actorOf(c)
  return withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      'select id from public.profiles where user_id = app.current_user_id()',
    )
    return (rows[0]?.id as string | undefined) ?? null
  })
}

uploadRoutes.post('/', requireAuth, async (c) => {
  const form = await c.req.parseBody()
  const file = form['file']
  const kind =
    typeof form['kind'] === 'string' && KINDS.has(form['kind']) ? form['kind'] : 'donation'

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

  const id = randomUUID()

  let relative: string
  if (kind === 'acknowledgement') {
    // Namespaced by uploader so the photo is readable back into the form before
    // the acknowledgement row that will own it exists. Without this the NGO
    // uploads a photo and gets a broken preview until they submit.
    const profileId = await profileIdOf(c)
    if (!profileId) return c.json({ error: 'Your profile is missing. Contact us.' }, 403)
    relative = join('acknowledgements', profileId, `${id}${ext}`)
  } else {
    // Sharded by first two hex chars so one directory never holds every photo.
    relative = join('donations', id.slice(0, 2), `${id}${ext}`)
  }

  const absolute = join(env.STORAGE_DIR, relative)
  await mkdir(join(env.STORAGE_DIR, relative, '..'), { recursive: true })
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()))

  return c.json({ path: relative }, 201)
})

/**
 * Removes an upload that never became part of anything — a photo taken out of
 * the post-item draft, or a draft discarded with "start over". Without this,
 * every removed photo sat in storage forever.
 *
 * Only unattached files can go: a path referenced by donation_photos or
 * acknowledgements is refused, so nothing that is part of an item's record can
 * be deleted through this route, ever. Donation paths are unguessable UUIDs
 * known only to the uploader before they attach; acknowledgement paths are
 * additionally namespaced by uploader and checked against it.
 */
uploadRoutes.delete('/*', requireAuth, async (c) => {
  const requested = decodePath(c.req.path.replace(/^\/api\/(?:files|uploads)\//, ''))
  if (requested === null) return c.json({ error: 'Not found.' }, 404)

  const safe = normalize(requested)
  if (safe.startsWith('..') || safe.startsWith('/') || safe.includes('\0')) {
    return c.json({ error: 'Not found.' }, 404)
  }
  if (!safe.startsWith('donations/') && !safe.startsWith('acknowledgements/')) {
    return c.json({ error: 'Not found.' }, 404)
  }

  if (safe.startsWith('acknowledgements/')) {
    const profileId = await profileIdOf(c)
    if (!profileId || safe.split('/')[1] !== profileId) {
      return c.json({ error: 'Not found.' }, 404)
    }
  }

  // System authority, deliberately: the check must see every reference, not
  // just the rows the caller's RLS happens to show them — a photo attached to
  // someone else's item must still count as attached.
  const attached = await withSystemActor(async (tx) => {
    const { rows } = await tx.query(
      `select 1 from public.donation_photos where storage_path = $1
       union all
       select 1 from public.acknowledgements where photo_path = $1
       limit 1`,
      [safe],
    )
    return rows.length > 0
  })
  if (attached) {
    return c.json({ error: 'That photo belongs to a posted item and cannot be removed.' }, 409)
  }

  try {
    await unlink(join(env.STORAGE_DIR, safe))
  } catch {
    // Already gone is the outcome the caller wanted.
  }
  return c.body(null, 204)
})

/**
 * Serves an uploaded photo.
 *
 * Donation photos stay coarsely authorised — any signed-in user who knows the
 * path can read one, and paths are unguessable UUIDs. That is acceptable because
 * the same photos are on a wall visible to every nearby NGO anyway.
 *
 * Acknowledgement photos are not. Those are checked against RLS on every read:
 * the acknowledgements_party_read policy returns the row only to the donor of
 * that item and the NGO that wrote it, so anyone else gets a 404 even holding
 * the exact path. This is the tightening NOTES.md flagged as an M6 task.
 */
uploadRoutes.get('/*', requireAuth, async (c) => {
  const requested = decodePath(c.req.path.replace(/^\/api\/files\//, ''))
  if (requested === null) return c.json({ error: 'Not found.' }, 404)

  // Reject traversal before touching the filesystem.
  const safe = normalize(requested)
  if (safe.startsWith('..') || safe.startsWith('/') || safe.includes('\0')) {
    return c.json({ error: 'Not found.' }, 404)
  }

  if (safe.startsWith('acknowledgements/')) {
    const allowed = await canReadAcknowledgementPhoto(c, safe)
    if (!allowed) return c.json({ error: 'Not found.' }, 404)
  }

  try {
    const data = await readFile(join(env.STORAGE_DIR, safe))
    // Verification documents are PDFs. Serving one as image/jpeg makes the
    // browser download a file it then refuses to open.
    const TYPES: Record<string, string> = {
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    }
    const type = TYPES[extname(safe).toLowerCase()] ?? 'application/octet-stream'

    return c.body(new Uint8Array(data), 200, {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=86400',
    })
  } catch {
    return c.json({ error: 'Not found.' }, 404)
  }
})

/** Either you uploaded it, or you are a party to the item it belongs to. */
async function canReadAcknowledgementPhoto(c: Context<AppEnv>, path: string): Promise<boolean> {
  const uploaderId = path.split('/')[1]
  const profileId = await profileIdOf(c)

  if (profileId && uploaderId === profileId) return true

  const actor = actorOf(c)
  return withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      'select 1 from public.acknowledgements a where a.photo_path = $1',
      [path],
    )
    return rows.length > 0
  })
}
