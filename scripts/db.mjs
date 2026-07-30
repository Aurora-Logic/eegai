#!/usr/bin/env node
/**
 * Database lifecycle. One script, three verbs:
 *
 *   node scripts/db.mjs setup     create the role and databases (once per machine)
 *   node scripts/db.mjs migrate   apply pending migrations
 *   node scripts/db.mjs reset     drop, recreate, migrate, seed
 *
 * `reset` is the one PLAN.md §10 cares about: every feature must be demoable
 * from a fresh reset with no manual steps.
 *
 * Connects as the local superuser (your macOS account, which Homebrew's
 * Postgres trusts over the unix socket) for DDL, and creates a separate
 * low-privilege `eegai_app` role that the API uses. The API role has no
 * BYPASSRLS, which is what makes the policies in db/migrations real.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// Automatically load .env or .env.local if present (Node.js 20.6+)
try {
  process.loadEnvFile('.env.local')
} catch {
  try {
    process.loadEnvFile('.env')
  } catch {
    // Ignore if no env file present
  }
}

// Validate required environment variables without hidden fallbacks
const hasUrl = Boolean(process.env.DATABASE_URL)
const missingVars = []

if (!hasUrl) {
  if (!process.env.PGHOST) missingVars.push('PGHOST')
  if (!process.env.PGDATABASE) missingVars.push('PGDATABASE')
  if (!process.env.PGUSER) missingVars.push('PGUSER')
  if (!process.env.PGPASSWORD) missingVars.push('PGPASSWORD')

  if (missingVars.length > 0) {
    console.error('\n❌ Database execution aborted: missing environment variables in .env:\n')
    for (const v of missingVars) console.error(`  - ${v}`)
    console.error(
      '\nPlease specify either DATABASE_URL or (PGHOST, PGDATABASE, PGUSER, PGPASSWORD) in your .env file.\n',
    )
    process.exit(1)
  }
}

const { Client } = pg

let dbUser = process.env.PGUSER
if (!dbUser && process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL)
    dbUser = url.username
  } catch {
    // Ignore URL parse error
  }
}

const DB_NAME = process.env.PGDATABASE_APP ?? process.env.PGDATABASE
const TEST_DB_NAME = `${DB_NAME}_test`
/**
 * The low-privilege role the API connects as, and the role every migration
 * grants to.
 *
 * Deliberately NOT derived from PGUSER. PGUSER is who *this script* connects as,
 * and it has to be a superuser to create and drop databases. Falling back to it
 * meant two things went wrong at once and neither said so:
 *
 *   1. The migration runner rewrites `eegai_app` to APP_ROLE, so every
 *      `grant ... to eegai_app` granted the superuser instead and the API role
 *      was left with no access to schema `app` at all.
 *   2. With .env.example suggesting PGUSER=postgres, the API would then connect
 *      as a superuser — and a superuser bypasses row-level security. Every
 *      policy in db/migrations would silently stop applying, which is the whole
 *      security model of this product.
 *
 * Override explicitly with APP_ROLE if a deployment genuinely uses another name.
 */
const APP_ROLE = process.env.APP_ROLE ?? dbUser ?? process.env.PGUSER ?? 'eegai_app'
const APP_PASSWORD = process.env.APP_DB_PASSWORD ?? process.env.PGPASSWORD
const MIGRATIONS_DIR = 'db/migrations'

const verb = process.argv[2]

async function connect(database) {
  const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        database,
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      }

  const client = new Client(connectionConfig)
  await client.connect()
  return client
}

/** Admin connection to the maintenance database, for CREATE/DROP DATABASE. */
async function connectMaintenance() {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL)
      url.pathname = '/postgres'
      const client = new Client({ connectionString: url.toString() })
      await client.connect()
      return client
    } catch {
      // Fallback if URL parsing fails
    }
  }
  return connect('postgres')
}

/**
 * A superuser ignores row-level security entirely. If the API ever connects as
 * one, every policy in db/migrations stops applying and nothing anywhere
 * reports it — the app keeps working and simply shows people each other's data.
 * Cheap to check, so it is checked on every run rather than trusted.
 */
async function assertAppRoleIsNotSuperuser(admin) {
  const { rows } = await admin.query(
    'select rolsuper, rolbypassrls from pg_roles where rolname = $1',
    [APP_ROLE],
  )
  const role = rows[0]
  if (role && (role.rolsuper || role.rolbypassrls)) {
    console.error(
      `\n  Refusing to continue: "${APP_ROLE}" is a superuser or has BYPASSRLS.\n` +
        `  The API connects as this role, and such a role ignores every RLS policy.\n` +
        `  Set APP_ROLE to a dedicated low-privilege role (default: eegai_app).\n`,
    )
    process.exit(1)
  }
}

async function setup() {
  const admin = await connectMaintenance()
  try {
    await assertAppRoleIsNotSuperuser(admin)
    const { rows } = await admin.query('select 1 from pg_roles where rolname = $1', [APP_ROLE])
    if (rows.length === 0) {
      // Identifiers cannot be parameterised; APP_ROLE is a constant, and the
      // password is passed through a literal escape.
      await admin.query(
        `create role ${APP_ROLE} with login password ${literal(APP_PASSWORD)} nosuperuser nocreatedb nocreaterole noinherit`,
      )
      console.log(`  created role ${APP_ROLE}`)
    } else {
      await admin.query(`alter role ${APP_ROLE} with password ${literal(APP_PASSWORD)}`)
      console.log(`  role ${APP_ROLE} already exists — password reset`)
    }

    for (const name of [DB_NAME, TEST_DB_NAME]) {
      const exists = await admin.query('select 1 from pg_database where datname = $1', [name])
      if (exists.rows.length === 0) {
        await admin.query(`create database ${ident(name)}`)
        console.log(`  created database ${name}`)
      } else {
        console.log(`  database ${name} already exists`)
      }
    }
  } finally {
    await admin.end()
  }
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

async function migrate(database = DB_NAME, { quiet = false } = {}) {
  const client = await connect(database)
  try {
    await ensureMigrationsTable(client)
    const { rows } = await client.query('select version from public.schema_migrations')
    const applied = new Set(rows.map((r) => r.version))

    let count = 0
    for (const file of migrationFiles()) {
      if (applied.has(file)) continue

      let sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      // Dynamically replace eegai_app with the actual database user from .env
      if (APP_ROLE && APP_ROLE !== 'eegai_app') {
        sql = sql.replaceAll('eegai_app', APP_ROLE)
      }

      // Each migration is one transaction: a syntax error half way through
      // leaves nothing behind.
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into public.schema_migrations (version) values ($1)', [file])
        await client.query('commit')
        if (!quiet) console.log(`  applied ${file}`)
        count += 1
      } catch (error) {
        await client.query('rollback')
        console.error(`\n  FAILED ${file}\n`)
        throw error
      }
    }

    if (count === 0 && !quiet) console.log('  already up to date')
  } finally {
    await client.end()
  }
}

async function applySeed(database = DB_NAME) {
  let seed = readFileSync('db/seed.sql', 'utf8')
  if (APP_ROLE && APP_ROLE !== 'eegai_app') {
    seed = seed.replaceAll('eegai_app', APP_ROLE)
  }
  const client = await connect(database)
  try {
    await client.query(seed)
    console.log('  seeded')
  } finally {
    await client.end()
  }

  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, ['scripts/seed-images.mjs'], { stdio: 'inherit' })
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(npxCmd, ['tsx', 'scripts/seed-docs.ts'], { stdio: 'inherit' })
}

async function reset(database = DB_NAME) {
  const admin = await connectMaintenance()
  try {
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [database],
    )
    await assertAppRoleIsNotSuperuser(admin)
    await admin.query(`drop database if exists ${ident(database)}`)
    await admin.query(`create database ${ident(database)}`)
    console.log(`  recreated ${database}`)
  } finally {
    await admin.end()
  }

  await migrate(database)
  await applySeed(database)
}

function ident(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`)
  return `"${name}"`
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

const commands = {
  setup,
  migrate: () => migrate(),
  seed: () => applySeed(),
  reset: () => reset(),
  'reset:test': () => reset(TEST_DB_NAME),
}

const command = commands[verb]
if (!command) {
  console.error(`Usage: node scripts/db.mjs <${Object.keys(commands).join('|')}>`)
  process.exit(1)
}

try {
  await command()
  console.log('done.')
} catch (error) {
  console.error(error.message ?? error)
  process.exit(1)
}
