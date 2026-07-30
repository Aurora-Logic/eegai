import { z } from 'zod'

// Automatically load .env or .env.local if present (Node.js 20.6+)
try {
  process.loadEnvFile('.env.local')
} catch {
  try {
    process.loadEnvFile('.env')
  } catch {
    // No .env file found; using process.env directly
  }
}

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PGHOST: z.string({ required_error: 'PGHOST is required' }),
  PGDATABASE: z.string({ required_error: 'PGDATABASE is required' }),
  PGUSER: z.string({ required_error: 'PGUSER is required' }),
  PGPASSWORD: z.string({ required_error: 'PGPASSWORD is required' }),
  PGPORT: z.coerce.number().int().positive().default(5432),

  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
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
