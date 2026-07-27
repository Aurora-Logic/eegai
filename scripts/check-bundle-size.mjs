#!/usr/bin/env node
/**
 * Enforces the JS budget from PLAN.md §8: total JS under 250KB gzipped.
 *
 * Run after `npm run build`. Sums the gzipped size of every emitted .js asset —
 * the number a donor on 4G in Nashik actually waits for.
 */
import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BUDGET_BYTES = 250 * 1024
const DIST = 'dist'

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

let files
try {
  files = walk(DIST).filter((f) => f.endsWith('.js'))
} catch {
  console.error(`No ${DIST}/ directory. Run \`npm run build\` first.`)
  process.exit(1)
}

// The service worker and its workbox runtime are fetched off the critical path
// and are not what a donor waits for on first paint. Reported, not budgeted.
const isServiceWorker = (f) => /(^|\/)(sw|registerSW)\.js$/.test(f) || /workbox-\w+\.js$/.test(f)

const measured = files
  .map((file) => ({ file, gzip: gzipSync(readFileSync(file)).length, sw: isServiceWorker(file) }))
  .sort((a, b) => b.gzip - a.gzip)

const total = measured.filter((m) => !m.sw).reduce((sum, m) => sum + m.gzip, 0)
const swTotal = measured.filter((m) => m.sw).reduce((sum, m) => sum + m.gzip, 0)
const kb = (n) => `${(n / 1024).toFixed(1)}KB`

for (const m of measured) {
  console.log(
    `  ${kb(m.gzip).padStart(8)}  ${m.file}${m.sw ? '  (service worker, not budgeted)' : ''}`,
  )
}
console.log(`\n  app JS ${kb(total)} gzipped of ${kb(BUDGET_BYTES)} budget`)
if (swTotal > 0) console.log(`  service worker ${kb(swTotal)} gzipped, off the critical path`)

if (total > BUDGET_BYTES) {
  console.error(`\nJS budget exceeded by ${kb(total - BUDGET_BYTES)}.`)
  process.exit(1)
}

console.log(`  ${kb(BUDGET_BYTES - total)} of headroom left.\n`)
