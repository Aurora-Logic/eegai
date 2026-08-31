import { Hono } from 'hono'
import { z } from 'zod'
import { withActor } from '../lib/db.ts'
import { log } from '../lib/logger.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'

/**
 * The donor's inbox, and complaints.
 *
 * Brief §7 lists a Notifications screen, and until now the proximity engine
 * wrote rows nobody could read — correct and silent. Real push and SMS still
 * need a provider; this is the half that works without one.
 */
export const inboxRoutes = new Hono<AppEnv>()
inboxRoutes.use('*', requireAuth)

inboxRoutes.get('/notifications', async (c) => {
  const actor = actorOf(c)

  const rows = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      // RLS on `notifications` already scopes this to the caller, so there is
      // no WHERE on profile_id — one that disagreed with the policy would be
      // the bug worth avoiding.
      `select id, template_key, payload, created_at, read_at, sent_at, error
       from public.notifications
       order by created_at desc
       limit 100`,
    )
    return rows
  })

  return c.json({
    notifications: rows,
    unread: rows.filter((r) => !r.read_at).length,
  })
})

inboxRoutes.post('/notifications/read', async (c) => {
  const actor = actorOf(c)
  const marked = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select app.mark_notifications_read() as n')
    return (rows[0]?.n as number) ?? 0
  })
  return c.json({ marked })
})

const reportSchema = z.object({
  subjectType: z.enum(['health_request', 'ngo', 'donation', 'profile']),
  subjectId: z.string().uuid().nullable().optional(),
  detail: z.string().trim().min(10, 'Say a little more about what went wrong').max(2000),
})

/** File a complaint. The reporter comes from the session, never the body. */
inboxRoutes.post('/reports', async (c) => {
  const actor = actorOf(c)
  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const { subjectType, subjectId, detail } = parsed.data

  const id = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      'select app.file_report($1::public.report_subject, $2, $3) as id',
      [subjectType, subjectId ?? null, detail],
    )
    return rows[0]?.id as string
  })

  log.info('report filed', { requestId: c.get('requestId'), subjectType })
  return c.json({ id }, 201)
})

/** What somebody has complained about, and what came of it. */
inboxRoutes.get('/reports', async (c) => {
  const actor = actorOf(c)
  const reports = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, subject_type, subject_id, detail, status, resolution, created_at, handled_at
       from public.reports
       order by created_at desc`,
    )
    return rows
  })
  return c.json({ reports })
})
