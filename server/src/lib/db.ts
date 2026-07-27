import pg from 'pg'
import { env } from './env.ts'
import { currentRequestId } from './context.ts'

const { Pool } = pg

/**
 * The API connects as `eegai_app`, which has no BYPASSRLS. Every policy in
 * db/migrations therefore applies to every query this pool runs — the database
 * is the authorization boundary, not the route handlers.
 */
export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (error) => {
  // Imported lazily to keep this module free of a cycle through env/logger.
  void import('./logger.ts').then(({ log }) =>
    log.error('idle client error', { err: error.message }),
  )
})

export interface Actor {
  userId: string
  role: 'donor' | 'ngo' | 'volunteer' | 'admin'
}

export interface Tx {
  query: pg.ClientBase['query']
}

/**
 * Runs `fn` inside a transaction that announces who the caller is.
 *
 * The two GUCs are set with `set_config(..., true)` — local to the
 * transaction — so a pooled connection can never leak one request's identity
 * into the next. They are set from a *verified* JWT and never from request
 * input.
 *
 * Passing no actor runs the transaction anonymously: the helpers return null
 * and every policy fails closed. That is the correct behaviour for public
 * endpoints, not an oversight.
 */
export async function withActor<T>(actor: Actor | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    // All three are transaction-local (`true`), so a pooled connection can
    // never leak one request's identity into the next. app.request_id is what
    // write_audit() stamps onto every row it writes.
    await client.query(
      `select set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true)`,
      [
        'app.user_id',
        actor?.userId ?? '',
        'app.user_role',
        actor?.role ?? '',
        'app.request_id',
        currentRequestId(),
      ],
    )

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

/**
 * Elevated access for the few operations that legitimately sit outside any
 * user's authority — the scheduled expiry sweep, the notification dispatcher.
 * Runs as `admin` so the state-machine trigger accepts system transitions.
 */
export async function withSystemActor<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withActor({ userId: '00000000-0000-0000-0000-000000000000', role: 'admin' }, fn)
}
