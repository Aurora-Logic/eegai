import { z } from 'zod'

/**
 * Server-side configuration. Unlike src/lib/env.ts on the client, everything
 * here is genuinely secret and must never be prefixed VITE_.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PGHOST: z.string().default('/tmp'),
  PGDATABASE: z.string().default('eegai'),
  PGUSER: z.string().default('eegai_app'),
  PGPASSWORD: z.string().default('eegai_local_dev'),
  PGPORT: z.coerce.number().int().positive().default(5432),

  // 32+ bytes. The default exists so `npm run dev` works on a fresh clone;
  // startup refuses it outside development.
  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-000000000000'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 14),

  STORAGE_DIR: z.string().default('storage'),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:5175'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Server environment is invalid:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data

if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('dev-only-secret')) {
  console.error('JWT_SECRET is still the development default. Refusing to start in production.')
  process.exit(1)
}
