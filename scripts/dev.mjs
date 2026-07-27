#!/usr/bin/env node
/**
 * Runs the API and the Vite dev server together, so `npm run dev` is the one
 * command someone needs after a clone. Written by hand rather than with
 * concurrently — it is twenty lines and PLAN.md §10 says not to add
 * dependencies casually.
 *
 * Either process exiting takes the other down, so you never end up with a
 * stranded API holding port 8787.
 */
import { spawn } from 'node:child_process'

const children = []
let shuttingDown = false

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.log(`\n[dev] ${name} exited (${signal ?? code}) — stopping everything.`)
    shutdown(code ?? 0)
  })

  children.push(child)
  return child
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Anything after `npm run dev --` is forwarded to Vite, so
// `npm run dev -- --port 5175` behaves the way it looks like it should.
const viteArgs = process.argv.slice(2)

run('api', 'npx', ['tsx', 'watch', 'server/src/index.ts'])
run('web', 'npx', ['vite', '--host', '127.0.0.1', ...viteArgs])
