import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { loginSchema, registerSchema } from '../../../src/lib/validation/auth.ts'
import { withActor, withSystemActor } from '../lib/db.ts'
import { hashPassword, verifyPassword } from '../lib/password.ts'
import { SESSION_COOKIE, signSession } from '../lib/jwt.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'
import { env } from '../lib/env.ts'
import { log } from '../lib/logger.ts'

export const authRoutes = new Hono<AppEnv>()

const cookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  path: '/',
  secure: env.NODE_ENV === 'production',
  maxAge: env.SESSION_TTL_HOURS * 3600,
} as const

/**
 * Sign in as a seeded account of a given role, with no password.
 *
 * Testing this product means being four people in sequence — a donor posts, an
 * NGO claims, a volunteer collects and reads an OTP, the NGO acknowledges. Doing
 * that through the login form four times per pass is most of the cost of testing
 * a change, so this collapses it to one tap.
 *
 * Two separate things stop this reaching production:
 * 1. It 404s unless NODE_ENV is 'development' — not merely "not production", so
 *    a missing or misspelled env var fails closed rather than open.
 * 2. The button that calls it is behind `import.meta.env.DEV`, so it is dead-code
 *    eliminated from a production bundle and never shipped at all.
 *
 * Layer 1 is the one that actually matters — layer 2 only hides the door, it does
 * not lock it. Be aware this hands out a session for the oldest account of the
 * chosen role, which in a seeded dev database is a seed user. Point it at a
 * database with real accounts in it and it will hand out a real one.
 */
authRoutes.post('/dev-login', async (c) => {
  if (env.NODE_ENV !== 'development') {
    return c.json({ error: 'No such endpoint.' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const role = body?.role
  if (!['donor', 'ngo', 'volunteer', 'admin'].includes(role)) {
    return c.json({ error: 'Pick donor, ngo, volunteer or admin.' }, 400)
  }

  // Which one of that role. Defaults to the first, which is what the UI button
  // wants; the flow check needs to be a *specific* person, because seeded
  // volunteers have different service radii and only some can see a given
  // pickup. Picking by position is exactly the trap NOTES.md records from the
  // RLS fixtures — so tooling gets a way to choose deliberately.
  const index = Number.isInteger(body?.index) && body.index >= 0 ? body.index : 0

  // withSystemActor, not withActor(null). The API role has no BYPASSRLS, so with
  // no session GUC set every profiles policy evaluates against a null user and
  // the select returns nothing — the endpoint then reports "no seeded account"
  // for a database that is full of them. Picking who to become is inherently a
  // pre-authentication act, so it needs the elevated path.
  const session = await withSystemActor(async (tx) => {
    const { rows } = await tx.query(
      `select p.user_id, p.full_name, p.role
       from public.profiles p
       where p.role = $1::public.user_role
       order by p.created_at, p.full_name
       limit 1 offset $2`,
      [role, index],
    )
    const found = rows[0]
    if (!found) return null
    return {
      userId: found.user_id as string,
      role: found.role as string,
      fullName: found.full_name as string,
    }
  })

  if (!session) {
    return c.json({ error: `No seeded ${role} at position ${index}. Run npm run db:reset.` }, 404)
  }

  const token = await signSession(session)
  setCookie(c, SESSION_COOKIE, token, cookieOptions)
  return c.json({ user: session })
})

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const { fullName, phone, password, role, email, address, pincode, lat, lng } = parsed.data
  const passwordHash = await hashPassword(password)

  try {
    const session = await withActor(null, async (tx) => {
      const { rows } = await tx.query(
        'select * from app.register_user($1, $2, $3, $4::public.user_role, $5, $6, $7, $8, $9)',
        [
          phone,
          passwordHash,
          fullName,
          role,
          email ?? null,
          address || null,
          pincode || null,
          lat ?? null,
          lng ?? null,
        ],
      )
      const created = rows[0]
      return { userId: created.user_id as string, role, fullName }
    })

    const token = await signSession(session)
    setCookie(c, SESSION_COOKIE, token, cookieOptions)
    return c.json({ user: session }, 201)
  } catch (error) {
    // 23505 = unique_violation. Phone is the login identity, so a duplicate is
    // the common case and deserves a real message rather than a 500.
    if (isPgError(error, '23505')) {
      return c.json({ error: 'That number is already registered. Sign in instead.' }, 409)
    }
    throw error
  }
})

/**
 * "I have forgotten my password."
 *
 * Records a request for an admin to action. There is no SMS gateway, so there
 * is nowhere to send a reset link — the admin resets it and reads the new one
 * out, the same channel the handover codes use.
 *
 * The answer is identical whether or not the number is registered. Saying "no
 * such account" would turn this into a way to discover which numbers have one.
 */
authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => null)
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null

  const answer = {
    ok: true,
    message: 'If that number has an account, someone will call you to reset it.',
  }

  // Shape-check only. An invalid number is not worth a row, but it still gets
  // the same answer.
  if (!/^[6-9]\d{9}$/.test(phone)) return c.json(answer)

  await withSystemActor(async (tx) => {
    await tx.query('select app.request_password_reset($1, $2)', [phone, note])
  })

  log.info('password reset requested')
  return c.json(answer)
})

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Enter your number and password.' }, 400)
  }

  const { phone, password } = parsed.data

  const found = await withActor(null, async (tx) => {
    const { rows } = await tx.query('select * from app.find_login($1)', [phone])
    return rows[0] ?? null
  })

  // Hash a throwaway password when the account does not exist, so that a
  // missing number and a wrong password take the same time to answer.
  const ok = found
    ? await verifyPassword(password, found.password_hash)
    : await verifyPassword(password, 'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA')

  if (!found || !ok) {
    return c.json({ error: 'That number and password do not match.' }, 401)
  }

  if (!found.is_active) {
    return c.json({ error: 'This account has been disabled. Contact us to reopen it.' }, 403)
  }

  const session = {
    userId: found.user_id as string,
    role: found.role as 'donor' | 'ngo' | 'volunteer' | 'admin',
    fullName: found.full_name as string,
  }

  await withActor(session, async (tx) => {
    await tx.query('select app.touch_last_login($1)', [session.userId])
  })

  const token = await signSession(session)
  setCookie(c, SESSION_COOKIE, token, cookieOptions)
  return c.json({ user: session })
})

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/** The client calls this on boot to restore a session from the cookie. */
authRoutes.get('/me', async (c) => {
  const actor = c.get('actor')
  if (!actor) return c.json({ user: null })

  const profile = await withActor(actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.id, p.full_name, p.phone, p.role, p.pincode, p.lat, p.lng, p.is_active
       from public.profiles p
       where p.user_id = app.current_user_id()`,
    )
    return rows[0] ?? null
  })

  // The JWT is valid but the profile is gone — treat as signed out rather than
  // handing back a half-session the UI cannot render.
  if (!profile) {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ user: null })
  }

  return c.json({ user: { ...actor, profile } })
})

authRoutes.post('/change-password', requireAuth, async (c) => {
  const actor = actorOf(c)
  const body = await c.req.json().catch(() => null)

  const current = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
  const next = typeof body?.newPassword === 'string' ? body.newPassword : ''

  if (next.length < 8) {
    return c.json({ error: 'Use at least 8 characters for the new password.' }, 400)
  }

  const row = await withActor(actor, async (tx) => {
    const { rows } = await tx.query('select password_hash from public.users where id = $1', [
      actor.userId,
    ])
    return rows[0] ?? null
  })

  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return c.json({ error: 'Your current password is not right.' }, 401)
  }

  const hash = await hashPassword(next)
  await withActor(actor, async (tx) => {
    await tx.query('update public.users set password_hash = $1 where id = $2', [hash, actor.userId])
  })

  return c.json({ ok: true })
})

function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
