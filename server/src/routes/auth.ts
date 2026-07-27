import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { loginSchema, registerSchema } from '../../../src/lib/validation/auth.ts'
import { withActor } from '../lib/db.ts'
import { hashPassword, verifyPassword } from '../lib/password.ts'
import { SESSION_COOKIE, signSession } from '../lib/jwt.ts'
import { actorOf, requireAuth, type AppEnv } from '../middleware/auth.ts'
import { env } from '../lib/env.ts'

export const authRoutes = new Hono<AppEnv>()

const cookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  path: '/',
  secure: env.NODE_ENV === 'production',
  maxAge: env.SESSION_TTL_HOURS * 3600,
} as const

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Check the form.', issues: parsed.error.flatten() }, 400)
  }

  const { fullName, phone, password, role, email } = parsed.data
  const passwordHash = await hashPassword(password)

  try {
    const session = await withActor(null, async (tx) => {
      const { rows } = await tx.query(
        'select * from app.register_user($1, $2, $3, $4::public.user_role, $5)',
        [phone, passwordHash, fullName, role, email ?? null],
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
