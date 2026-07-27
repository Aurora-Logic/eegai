import pg from 'pg'

const { Pool } = pg

/**
 * Connects as `wok_app` — the same low-privilege, non-BYPASSRLS role the API
 * uses. Testing RLS as a superuser would prove nothing at all.
 */
export const testPool = new Pool({
  host: process.env.PGHOST ?? '/tmp',
  port: Number(process.env.PGPORT ?? 5432),
  database: 'wall_of_kindness_test',
  user: 'wok_app',
  password: process.env.APP_DB_PASSWORD ?? 'wok_local_dev',
  max: 6,
})

export type Role = 'donor' | 'ngo' | 'volunteer' | 'admin'

/** Mirrors withActor() in server/src/lib/db.ts. */
export async function asActor<T>(
  actor: { userId: string; role: Role } | null,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await testPool.connect()
  try {
    await client.query('begin')
    await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
      'app.user_id',
      actor?.userId ?? '',
      'app.user_role',
      actor?.role ?? '',
    ])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Superuser connection, for arranging fixtures RLS would otherwise hide. */
export const adminPool = new Pool({
  host: process.env.PGHOST ?? '/tmp',
  database: 'wall_of_kindness_test',
  max: 4,
})

export interface Fixture {
  userId: string
  profileId: string
  role: Role
  fullName: string
  /** Present for NGOs only. Tests must pick NGOs whose categories match the
   *  item under test, or RLS hides it and the assertion passes for the wrong
   *  reason. */
  acceptsCategories?: string[]
  ngoId?: string
}

export async function loadFixtures() {
  const { rows } = await adminPool.query<{
    user_id: string
    profile_id: string
    role: Role
    full_name: string
    accepts_categories: string[] | null
    ngo_id: string | null
  }>(
    `select u.id as user_id, p.id as profile_id, p.role, p.full_name,
            n.accepts_categories, n.id as ngo_id
     from public.users u
     join public.profiles p on p.user_id = u.id
     left join public.ngos n on n.profile_id = p.id
     order by p.role, p.full_name`,
  )

  const byRole = (role: Role): Fixture[] =>
    rows
      .filter((r) => r.role === role)
      .map((r) => ({
        userId: r.user_id,
        profileId: r.profile_id,
        role: r.role,
        fullName: r.full_name,
        ...(r.accepts_categories ? { acceptsCategories: r.accepts_categories } : {}),
        ...(r.ngo_id ? { ngoId: r.ngo_id } : {}),
      }))

  const ngos = byRole('ngo')

  return {
    donors: byRole('donor'),
    ngos,
    /** NGOs that accept `category`, for tests that need two genuine rivals. */
    ngosAccepting: (category: string) =>
      ngos.filter((n) => n.acceptsCategories?.includes(category)),
    volunteers: byRole('volunteer'),
    admins: byRole('admin'),
  }
}

export async function closePools() {
  await Promise.all([testPool.end(), adminPool.end()])
}
