import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

/**
 * scrypt from node:crypto rather than argon2 or bcrypt — both of those are
 * native modules that need a compiler on every machine and in CI, and scrypt is
 * a memory-hard KDF that OWASP considers acceptable for password storage.
 *
 * Parameters follow OWASP's minimum for scrypt: N=2^17, r=8, p=1.
 */
const N = 2 ** 17
const R = 8
const P = 1
const KEY_LEN = 64
const SALT_LEN = 16

// N=2^17 with r=8 needs ~128 MiB. Node's default maxmem is 32 MiB and would
// throw, so it is raised explicitly rather than quietly weakening N.
const MAX_MEM = 256 * 1024 * 1024

/** Format: scrypt$N$r$p$<salt base64>$<hash base64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const derived = (await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  })) as Buffer

  return ['scrypt', N, R, P, salt.toString('base64'), derived.toString('base64')].join('$')
}

/**
 * Constant-time comparison. Returns false rather than throwing on a malformed
 * stored hash — a corrupted row must not become a 500 that distinguishes it
 * from a wrong password.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false

    const n = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4] ?? '', 'base64')
    const expected = Buffer.from(parts[5] ?? '', 'base64')

    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false
    if (salt.length === 0 || expected.length === 0) return false

    const derived = (await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    })) as Buffer

    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
