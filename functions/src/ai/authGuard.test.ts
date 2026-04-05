import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock firebase-admin/firestore ───────────────────────────────
const mockGet = vi.fn()
const mockCount = vi.fn(() => ({ get: mockGet }))
const mockWhere = vi.fn(() => ({ where: mockWhere, count: mockCount }))
const mockCollection = vi.fn(() => ({ where: mockWhere }))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: mockCollection,
  })),
}))

// ── Mock firebase-functions/v2/https ────────────────────────────
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
      this.name = 'HttpsError'
    }
  }
  return { HttpsError }
})

import { requireEmailAuth, requireApprovedUser, isApprovedUser, checkRateLimit } from './authGuard'

type MockRequest = {
  auth?: {
    uid: string
    token?: {
      email?: string
      firebase?: { sign_in_provider?: string }
    }
  }
}

describe('requireEmailAuth', () => {
  it('throws for unauthenticated request (no auth)', () => {
    const req = { auth: undefined } as MockRequest
    expect(() => requireEmailAuth(req as never)).toThrow('Authentication required.')
  })

  it('throws for anonymous user', () => {
    const req: MockRequest = {
      auth: {
        uid: 'anon-123',
        token: {
          firebase: { sign_in_provider: 'anonymous' },
        },
      },
    }
    expect(() => requireEmailAuth(req as never)).toThrow('email account is required')
  })

  it('throws when auth token has no email', () => {
    const req: MockRequest = {
      auth: {
        uid: 'user-123',
        token: {
          firebase: { sign_in_provider: 'password' },
        },
      },
    }
    expect(() => requireEmailAuth(req as never)).toThrow('email account is required')
  })

  it('returns uid and email for email-authenticated user', () => {
    const req: MockRequest = {
      auth: {
        uid: 'user-456',
        token: {
          email: 'test@example.com',
          firebase: { sign_in_provider: 'password' },
        },
      },
    }
    const result = requireEmailAuth(req as never)
    expect(result).toEqual({ uid: 'user-456', email: 'test@example.com' })
  })
})

describe('isApprovedUser', () => {
  it('approves known email', () => {
    expect(isApprovedUser('nathan.xb9753@gmail.com')).toBe(true)
  })

  it('approves email case-insensitively', () => {
    expect(isApprovedUser('Nathan.XB9753@Gmail.com')).toBe(true)
  })

  it('rejects unknown email', () => {
    expect(isApprovedUser('stranger@example.com')).toBe(false)
  })
})

describe('requireApprovedUser', () => {
  it('throws for unapproved email user', () => {
    const req: MockRequest = {
      auth: {
        uid: 'user-789',
        token: {
          email: 'stranger@example.com',
          firebase: { sign_in_provider: 'password' },
        },
      },
    }
    expect(() => requireApprovedUser(req as never)).toThrow('not approved')
  })

  it('returns uid and email for approved user', () => {
    const req: MockRequest = {
      auth: {
        uid: 'user-approved',
        token: {
          email: 'nathan.xb9753@gmail.com',
          firebase: { sign_in_provider: 'password' },
        },
      },
    }
    const result = requireApprovedUser(req as never)
    expect(result).toEqual({ uid: 'user-approved', email: 'nathan.xb9753@gmail.com' })
  })

  it('throws for anonymous user (inherits from requireEmailAuth)', () => {
    const req: MockRequest = {
      auth: {
        uid: 'anon-123',
        token: {
          firebase: { sign_in_provider: 'anonymous' },
        },
      },
    }
    expect(() => requireApprovedUser(req as never)).toThrow('email account is required')
  })
})

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes when under rate limit', async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 5 }) })
    await expect(checkRateLimit('user-1', 'chat', 50, 60)).resolves.toBeUndefined()
  })

  it('throws when rate limit exceeded', async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 50 }) })
    await expect(checkRateLimit('user-1', 'chat', 50, 60)).rejects.toThrow('Rate limit exceeded')
  })

  it('throws when count equals maxCalls (boundary)', async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 10 }) })
    await expect(checkRateLimit('user-1', 'generateImage', 10, 30)).rejects.toThrow('Rate limit exceeded')
  })

  it('passes silently on infrastructure error (non-blocking)', async () => {
    mockGet.mockRejectedValueOnce(new Error('Missing composite index'))
    // Should NOT throw — infrastructure errors are non-blocking
    await expect(checkRateLimit('user-1', 'chat')).resolves.toBeUndefined()
  })
})
