import { SignJWT, jwtVerify } from 'jose'
import { env } from './env.ts'
import type { Actor } from './db.ts'

const secret = new TextEncoder().encode(env.JWT_SECRET)
const ISSUER = 'eegai'

export interface SessionClaims extends Actor {
  fullName: string
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, fullName: claims.fullName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_TTL_HOURS}h`)
    .sign(secret)
}

/** Returns null for anything not currently valid — expired, forged, or absent. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER })

    const role = payload.role
    if (
      typeof payload.sub !== 'string' ||
      (role !== 'donor' && role !== 'ngo' && role !== 'volunteer' && role !== 'admin')
    ) {
      return null
    }

    return {
      userId: payload.sub,
      role,
      fullName: typeof payload.fullName === 'string' ? payload.fullName : '',
    }
  } catch {
    return null
  }
}

export const SESSION_COOKIE = 'eegai_session'
