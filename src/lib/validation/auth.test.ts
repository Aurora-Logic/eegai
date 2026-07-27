import { describe, expect, it } from 'vitest'
import { loginSchema, normalisePhone, phoneSchema, registerSchema } from './auth'

describe('normalisePhone', () => {
  it('keeps a bare 10-digit number untouched', () => {
    expect(normalisePhone('9820012345')).toBe('9820012345')
  })

  it('does not mistake a leading 91 for a country code', () => {
    // The regression that broke every seeded NGO login: 9100000001 is a real
    // 10-digit mobile, not +91 followed by 00000001.
    expect(normalisePhone('9100000001')).toBe('9100000001')
    expect(normalisePhone('9199999999')).toBe('9199999999')
  })

  it('strips a country code when the length says it is one', () => {
    expect(normalisePhone('+919820012345')).toBe('9820012345')
    expect(normalisePhone('919820012345')).toBe('9820012345')
    expect(normalisePhone('0091 98200 12345')).toBe('9820012345')
  })

  it('strips a single leading zero from an 11-digit number', () => {
    expect(normalisePhone('09820012345')).toBe('9820012345')
  })

  it('ignores spaces, hyphens and brackets', () => {
    expect(normalisePhone('98200-12345')).toBe('9820012345')
    expect(normalisePhone('98200 12345')).toBe('9820012345')
  })
})

describe('phoneSchema', () => {
  it.each(['9820012345', '9100000001', '6000000000', '+919820012345'])('accepts %s', (input) => {
    expect(phoneSchema.parse(input)).toMatch(/^[6-9]\d{9}$/)
  })

  it.each([
    ['5820012345', 'a landline-style prefix'],
    ['982001234', 'too short'],
    ['98200123456', 'too long'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false)
  })
})

describe('registerSchema', () => {
  it('accepts a complete donor signup', () => {
    const result = registerSchema.safeParse({
      fullName: 'Asha Kulkarni',
      phone: '9820012345',
      password: 'a-long-enough-password',
      role: 'donor',
    })
    expect(result.success).toBe(true)
  })

  it('refuses an admin role from the outside', () => {
    // Defence in depth: app.register_user() also refuses it in SQL.
    const result = registerSchema.safeParse({
      fullName: 'Sneaky',
      phone: '9820012345',
      password: 'a-long-enough-password',
      role: 'admin',
    })
    expect(result.success).toBe(false)
  })

  it('requires at least 8 characters of password', () => {
    const result = registerSchema.safeParse({
      fullName: 'Asha Kulkarni',
      phone: '9820012345',
      password: 'short',
      role: 'donor',
    })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('normalises the phone on the way in', () => {
    const result = loginSchema.parse({ phone: '+91 98200 12345', password: 'x' })
    expect(result.phone).toBe('9820012345')
  })
})
