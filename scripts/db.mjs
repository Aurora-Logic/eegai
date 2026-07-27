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

const { Client } = pg

const DB_NAME = process.env.PGDATABASE_APP ?? 'eegai'
const TEST_DB_NAME = `${DB_NAME}_test`
const APP_ROLE = 'eegai_app'
const APP_PASSWORD = process.env.APP_DB_PASSWORD ?? 'eegai_local_dev'
const MIGRATIONS_DIR = 'db/migrations'

const verb = process.argv[2]

async function connect(database) {
  const client = new Client({ database, host: process.env.PGHOST ?? '/tmp' })
  await client.connect()
  return client
}

/** Admin connection to the maintenance database, for CREATE/DROP DATABASE. */
async function connectMaintenance() {
  return connect('postgres')
}

async function setup() {
  const admin = await connectMaintenance()
  try {
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

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
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

async function reset(database = DB_NAME) {
  const admin = await connectMaintenance()
  try {
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [database],
    )
    await admin.query(`drop database if exists ${ident(database)}`)
    await admin.query(`create database ${ident(database)}`)
    console.log(`  recreated ${database}`)
  } finally {
    await admin.end()
  }

  await migrate(database)

  const seed = readFileSync('db/seed.sql', 'utf8')
  const client = await connect(database)
  try {
    await client.query(seed)
    console.log('  seeded')
  } finally {
    await client.end()
  }

  // The seeded donations reference storage/seed/*.png. Generating them here
  // keeps `reset` a single command that leaves a fully demoable app.
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, ['scripts/seed-images.mjs'], { stdio: 'inherit' })
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
