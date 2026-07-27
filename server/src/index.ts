import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { env } from './lib/env.ts'
import { pool, withSystemActor } from './lib/db.ts'
import { withSession, type AppEnv } from './middleware/auth.ts'
import { observability } from './middleware/observability.ts'
import { log } from './lib/logger.ts'
import { authRoutes } from './routes/auth.ts'
import { adminRoutes } from './routes/admin.ts'
import { donationRoutes } from './routes/donations.ts'
import { uploadRoutes } from './routes/uploads.ts'

const app = new Hono<AppEnv>()

app.use('*', observability)
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    // The session is an httpOnly cookie, so the browser must be allowed to send it.
    credentials: true,
  }),
)
app.use('*', withSession)

app.get('/api/health', async (c) => {
  try {
    await pool.query('select 1')
    return c.json({ ok: true, db: 'up' })
  } catch {
    return c.json({ ok: false, db: 'down' }, 503)
  }
})

app.route('/api/auth', authRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/donations', donationRoutes)
app.route('/api/uploads', uploadRoutes)
app.route('/api/files', uploadRoutes)

app.onError((error, c) => {
  // Never let a Postgres error message reach the client — they quote table and
  // column names, and sometimes row values. The request id is safe to return
  // and is the whole point: the user can read it out and we can find the trail.
  log.error('unhandled', {
    err: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    path: c.req.path,
  })
  return c.json(
    { error: 'That did not go through. Try again.', requestId: c.get('requestId') },
    500,
  )
})

app.notFound((c) => c.json({ error: 'No such endpoint.' }, 404))

/**
 * Claim expiry sweep (PLAN.md §7): widen the radius at 24h, hand the item back
 * at 72h. A setInterval rather than pg_cron — one less extension to install,
 * and the API is already a long-running process.
 */
const EXPIRY_INTERVAL_MS = 15 * 60 * 1000
setInterval(() => {
  withSystemActor(async (tx) => {
    const { rows } = await tx.query('select * from app.expire_stale_posts()')
    const result = rows[0]
    if (result && (result.widened > 0 || result.returned > 0)) {
      log.info('expiry sweep', { widened: result.widened, returned: result.returned })
    }
  }).catch((error) => log.error('expiry sweep failed', { err: String(error) }))
}, EXPIRY_INTERVAL_MS).unref()

serve({ fetch: app.fetch, port: env.PORT, hostname: '127.0.0.1' }, (info) => {
  log.info('api listening', { port: info.port, env: env.NODE_ENV })
})
