#!/usr/bin/env node
/**
 * Would this deploy's migrations apply to a database that already has data?
 *
 *   node scripts/check-upgrade.mjs [base-ref]     (default: origin/main)
 *
 * Every other check builds the database from empty: `db:reset` runs all the
 * migrations and only then the seed. A migration that is fine on an empty
 * table and fails on a populated one passes all of them — which is exactly
 * how 030 reached production and failed the deploy: it emptied hospitals'
 * category lists while a constraint forbidding that was still in place, and a
 * fresh reset never had a hospital in it to trip.
 *
 * This builds the database the way production has it instead: the migrations
 * that existed at `base-ref`, then that release's own seed (written for that
 * schema, so it loads), then every migration added since, one at a time and
 * each in a transaction, as the deploy does. Point base-ref at the last
 * successful deploy.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'

try {
  process.loadEnvFile('.env.local')
} catch {
  try {
    process.loadEnvFile('.env')
  } catch {
    // The PG* variables may come from the shell instead.
  }
}

const base = process.argv[2] ?? 'origin/main'
const DB = `${process.env.PGDATABASE_APP ?? process.env.PGDATABASE ?? 'eegai'}_upgrade`
// The same rule db.mjs uses, so grants land on the same role a deploy uses.
const APP_ROLE = process.env.APP_ROLE ?? process.env.PGUSER ?? 'eegai_app'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 })
const forRole = (sql) => (APP_ROLE !== 'eegai_app' ? sql.replaceAll('eegai_app', APP_ROLE) : sql)

function client(database) {
  return new pg.Client({
    database,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  })
}

async function apply(db, label, sql) {
  await db.query('begin')
  try {
    await db.query(forRole(sql))
    await db.query('commit')
    console.log(`  ok      ${label}`)
  } catch (error) {
    await db.query('rollback')
    console.error(`\n  FAILED  ${label}\n          ${error.message}\n`)
    if (error.detail) console.error(`          ${error.detail}\n`)
    throw error
  }
}

const atBase = git('ls-tree', '--name-only', base, 'db/migrations/')
  .split('\n')
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace('db/migrations/', ''))
  .sort()
const baseSet = new Set(atBase)
const added = readdirSync('db/migrations')
  .filter((f) => f.endsWith('.sql') && !baseSet.has(f))
  .sort()

console.log(
  `\nUpgrade from ${base}: ${atBase.length} migrations and its seed, then ${added.length} new\n`,
)
if (added.length === 0) {
  console.log('  nothing new to apply\n')
  process.exit(0)
}

const admin = client('postgres')
await admin.connect()
await admin.query(`drop database if exists "${DB}"`)
await admin.query(`create database "${DB}"`)

const db = client(DB)
await db.connect()
let failed = false
try {
  for (const file of atBase) {
    await apply(db, `${base}:${file}`, git('show', `${base}:db/migrations/${file}`))
  }
  await apply(db, `${base}:db/seed.sql`, git('show', `${base}:db/seed.sql`))
  for (const file of added) {
    await apply(db, file, readFileSync(`db/migrations/${file}`, 'utf8'))
  }
  console.log('\n  The new migrations apply on top of real-shaped data.\n')
} catch {
  failed = true
} finally {
  await db.end()
  await admin.query(`drop database if exists "${DB}"`)
  await admin.end()
}
process.exit(failed ? 1 : 0)
