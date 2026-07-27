/**
 * Where uploaded photos live (PLAN.md §3, §M6).
 *
 * The point of this file is the same as courier.ts: no route names a storage
 * provider. `uploads.ts` asks for a path and gets bytes back, and whether those
 * bytes came off local disk or out of a bucket is settled here by one env var.
 *
 * Two drivers, for two genuinely different situations:
 *
 * - `local` writes under STORAGE_DIR, which is what `npm run dev` and every
 *   test wants. A fresh clone needs no account and no network, which is the
 *   §10 rule about `db:reset` leaving a demoable app.
 * - `supabase` talks to the Storage REST API. Production hosts do not keep a
 *   filesystem: Vercel's is read-only outside /tmp, and Render's free tier has
 *   no persistent disk, so anything written locally survives until the next
 *   deploy and no longer. Uploads would appear to succeed and quietly vanish.
 *
 * No SDK. @supabase/supabase-js is a real dependency tree for what is four
 * fetch calls against a documented REST surface, and §10 says not to add one
 * casually. The same reasoning that produced lib/pdf.ts applies here.
 *
 * The bucket is **private**. Every read goes through uploads.ts, which is what
 * keeps the acknowledgement-photo RLS check in front of the bytes. Making the
 * bucket public would hand out acknowledgement photos to anyone holding a URL
 * and silently undo the tightening M6 asked for.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { env } from './env.ts'

export interface StoredObject {
  bytes: Uint8Array
  contentType: string
}

export interface StorageDriver {
  /** Writes bytes at `path`, creating any intermediate structure. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Returns null when the object is absent — callers turn that into a 404. */
  get(path: string): Promise<StoredObject | null>
}

const CONTENT_TYPES = new Map([
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
])

/** Content type from the extension. Paths are server-generated, so this is total. */
export function contentTypeOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return (dot === -1 ? undefined : CONTENT_TYPES.get(path.slice(dot).toLowerCase())) ?? 'image/jpeg'
}

const localDriver: StorageDriver = {
  async put(path, bytes) {
    const absolute = join(env.STORAGE_DIR, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, bytes)
  },

  async get(path) {
    try {
      const bytes = await readFile(join(env.STORAGE_DIR, path))
      return { bytes: new Uint8Array(bytes), contentType: contentTypeOf(path) }
    } catch {
      return null
    }
  },
}

/**
 * Supabase Storage over its REST API.
 *
 * Authenticates with the service-role key, which bypasses storage RLS. That is
 * correct here and only here: the API has already decided whether this caller
 * may see this object, using the policies in db/migrations, before it asks for
 * bytes. The key must never reach the client — it is unprefixed precisely so
 * Vite refuses to inline it.
 */
function supabaseDriver(): StorageDriver {
  const base = `${env.SUPABASE_URL!.replace(/\/+$/, '')}/storage/v1/object`
  const bucket = env.SUPABASE_STORAGE_BUCKET
  const auth = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}` }

  return {
    async put(path, bytes, contentType) {
      const response = await fetch(`${base}/${bucket}/${encodeURI(path)}`, {
        method: 'POST',
        headers: {
          ...auth,
          'Content-Type': contentType,
          // Makes a retry after a half-failed write idempotent rather than a 409.
          'x-upsert': 'true',
        },
        body: bytes,
      })

      if (!response.ok) {
        // The body carries the bucket name and sometimes the key prefix, so it
        // is logged, never returned. index.ts turns this into a request id.
        throw new Error(`storage put failed: ${response.status} ${await response.text()}`)
      }
    },

    async get(path) {
      const response = await fetch(`${base}/${bucket}/${encodeURI(path)}`, { headers: auth })

      if (response.status === 404 || response.status === 400) return null
      if (!response.ok) {
        throw new Error(`storage get failed: ${response.status} ${await response.text()}`)
      }

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        // Trusting our own extension over the response header: the bucket will
        // happily report application/octet-stream for something we wrote as png.
        contentType: contentTypeOf(path),
      }
    },
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 'supabase' ? supabaseDriver() : localDriver
