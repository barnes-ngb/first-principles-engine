import { describe, it, expect } from 'vitest'

import {
  validateOrderSubmission,
  isPlausibleFamilyId,
  isAllowedOrigin,
  checkRateLimit,
  ORDER_LIMITS,
  HONEYPOT_FIELD,
  ALLOWED_ORDER_ORIGINS,
} from './orderValidation.js'

// ── validateOrderSubmission ─────────────────────────────────────

describe('validateOrderSubmission', () => {
  const validItem = { productId: 'prod-1', title: 'Sticker Pack', qty: 1 }

  function validBody(overrides: Record<string, unknown> = {}) {
    return { customerName: 'Lincoln', items: [validItem], ...overrides }
  }

  // — Happy path —

  it('accepts a minimal valid order', () => {
    const result = validateOrderSubmission(validBody())
    expect(result).toEqual({
      ok: true,
      spam: false,
      order: {
        customerName: 'Lincoln',
        items: [{ productId: 'prod-1', title: 'Sticker Pack', qty: 1 }],
      },
    })
  })

  it('accepts an order with note and contact', () => {
    const result = validateOrderSubmission(
      validBody({ note: 'Please gift wrap', contact: 'Mom' }),
    )
    expect(result).toMatchObject({
      ok: true,
      spam: false,
      order: { note: 'Please gift wrap', contact: 'Mom' },
    })
  })

  it('trims whitespace from customerName, note, and contact', () => {
    const result = validateOrderSubmission(
      validBody({ customerName: '  Lincoln  ', note: ' hi ', contact: ' mom ' }),
    )
    expect(result).toMatchObject({
      ok: true,
      order: { customerName: 'Lincoln', note: 'hi', contact: 'mom' },
    })
  })

  it('omits note and contact when empty after trim', () => {
    const result = validateOrderSubmission(validBody({ note: '   ', contact: '' }))
    expect(result).toMatchObject({ ok: true })
    if (result.ok && !result.spam) {
      expect(result.order.note).toBeUndefined()
      expect(result.order.contact).toBeUndefined()
    }
  })

  it('accepts multiple valid items', () => {
    const items = [
      { productId: 'p1', title: 'Book', qty: 2 },
      { productId: 'p2', title: 'Sticker', qty: 3 },
    ]
    const result = validateOrderSubmission(validBody({ items }))
    expect(result).toMatchObject({ ok: true, spam: false })
    if (result.ok && !result.spam) {
      expect(result.order.items).toHaveLength(2)
      expect(result.order.items[0].qty).toBe(2)
      expect(result.order.items[1].qty).toBe(3)
    }
  })

  // — Honeypot —

  it('detects honeypot as spam (non-empty honeypot field)', () => {
    const result = validateOrderSubmission({ ...validBody(), [HONEYPOT_FIELD]: 'bot-filled' })
    expect(result).toEqual({ ok: true, spam: true })
  })

  it('passes when honeypot is empty string', () => {
    const result = validateOrderSubmission({ ...validBody(), [HONEYPOT_FIELD]: '' })
    expect(result).toMatchObject({ ok: true, spam: false })
  })

  it('passes when honeypot is whitespace-only', () => {
    const result = validateOrderSubmission({ ...validBody(), [HONEYPOT_FIELD]: '   ' })
    expect(result).toMatchObject({ ok: true, spam: false })
  })

  // — Body shape —

  it('rejects null body', () => {
    const result = validateOrderSubmission(null)
    expect(result).toMatchObject({ ok: false, reason: 'Body must be a JSON object.' })
  })

  it('rejects non-object body (string)', () => {
    const result = validateOrderSubmission('not an object')
    expect(result).toMatchObject({ ok: false, reason: 'Body must be a JSON object.' })
  })

  it('rejects non-object body (array)', () => {
    const result = validateOrderSubmission([1, 2, 3])
    expect(result).toMatchObject({ ok: false })
  })

  // — customerName —

  it('rejects missing customerName', () => {
    const result = validateOrderSubmission({ items: [validItem] })
    expect(result).toMatchObject({ ok: false, reason: 'A first name is required.' })
  })

  it('rejects empty customerName', () => {
    const result = validateOrderSubmission(validBody({ customerName: '' }))
    expect(result).toMatchObject({ ok: false, reason: 'A first name is required.' })
  })

  it('rejects whitespace-only customerName', () => {
    const result = validateOrderSubmission(validBody({ customerName: '   ' }))
    expect(result).toMatchObject({ ok: false, reason: 'A first name is required.' })
  })

  it('rejects customerName exceeding cap', () => {
    const result = validateOrderSubmission(
      validBody({ customerName: 'X'.repeat(ORDER_LIMITS.nameMax + 1) }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Name is too long.' })
  })

  it('accepts customerName at exactly the cap', () => {
    const result = validateOrderSubmission(
      validBody({ customerName: 'A'.repeat(ORDER_LIMITS.nameMax) }),
    )
    expect(result).toMatchObject({ ok: true, spam: false })
  })

  it('coerces non-string customerName to empty', () => {
    const result = validateOrderSubmission(validBody({ customerName: 123 }))
    expect(result).toMatchObject({ ok: false, reason: 'A first name is required.' })
  })

  // — Items —

  it('rejects missing items', () => {
    const result = validateOrderSubmission({ customerName: 'Lincoln' })
    expect(result).toMatchObject({ ok: false, reason: 'Pick at least one item.' })
  })

  it('rejects empty items array', () => {
    const result = validateOrderSubmission(validBody({ items: [] }))
    expect(result).toMatchObject({ ok: false, reason: 'Pick at least one item.' })
  })

  it('rejects items that is not an array', () => {
    const result = validateOrderSubmission(validBody({ items: 'not-array' }))
    expect(result).toMatchObject({ ok: false, reason: 'Pick at least one item.' })
  })

  it('rejects too many items', () => {
    const items = Array.from({ length: ORDER_LIMITS.itemsMax + 1 }, (_, i) => ({
      productId: `p${i}`,
      title: `Item ${i}`,
      qty: 1,
    }))
    const result = validateOrderSubmission(validBody({ items }))
    expect(result).toMatchObject({ ok: false, reason: 'Too many items.' })
  })

  it('rejects malformed item (null)', () => {
    const result = validateOrderSubmission(validBody({ items: [null] }))
    expect(result).toMatchObject({ ok: false, reason: 'Malformed item.' })
  })

  it('rejects malformed item (string)', () => {
    const result = validateOrderSubmission(validBody({ items: ['not-an-object'] }))
    expect(result).toMatchObject({ ok: false, reason: 'Malformed item.' })
  })

  it('rejects item with empty productId', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: '', title: 'Book' }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Malformed item id.' })
  })

  it('rejects item with productId exceeding cap', () => {
    const result = validateOrderSubmission(
      validBody({
        items: [{ productId: 'x'.repeat(ORDER_LIMITS.productIdMax + 1), title: 'Book' }],
      }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Malformed item id.' })
  })

  it('rejects item with empty title (no allowlist)', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: '' }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Malformed item title.' })
  })

  it('rejects item with title exceeding cap (no allowlist)', () => {
    const result = validateOrderSubmission(
      validBody({
        items: [{ productId: 'p1', title: 'T'.repeat(ORDER_LIMITS.titleMax + 1) }],
      }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Malformed item title.' })
  })

  // — Quantity validation (FEAT-92) —

  it('defaults qty to 1 when omitted', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: 'Book' }] }),
    )
    expect(result).toMatchObject({ ok: true })
    if (result.ok && !result.spam) {
      expect(result.order.items[0].qty).toBe(1)
    }
  })

  it('defaults qty to 1 when null', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: 'Book', qty: null }] }),
    )
    expect(result).toMatchObject({ ok: true })
    if (result.ok && !result.spam) {
      expect(result.order.items[0].qty).toBe(1)
    }
  })

  it('rejects non-integer qty', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: 'Book', qty: 2.5 }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Bad item quantity.' })
  })

  it('rejects qty of 0', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: 'Book', qty: 0 }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Bad item quantity.' })
  })

  it('rejects negative qty', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: 'Book', qty: -1 }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Bad item quantity.' })
  })

  it('rejects qty exceeding per-item cap', () => {
    const result = validateOrderSubmission(
      validBody({
        items: [{ productId: 'p1', title: 'Book', qty: ORDER_LIMITS.qtyMax + 1 }],
      }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Bad item quantity.' })
  })

  it('accepts qty at exactly the per-item cap', () => {
    const result = validateOrderSubmission(
      validBody({
        items: [{ productId: 'p1', title: 'Book', qty: ORDER_LIMITS.qtyMax }],
      }),
    )
    expect(result).toMatchObject({ ok: true })
  })

  it('rejects qty that is a string', () => {
    const result = validateOrderSubmission(
      validBody({ items: [{ productId: 'p1', title: 'Book', qty: '3' }] }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Bad item quantity.' })
  })

  // — Total units cap (FEAT-92) —

  it('rejects when total units across items exceed cap', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      productId: `p${i}`,
      title: `Item ${i}`,
      qty: 5,
    }))
    const result = validateOrderSubmission(validBody({ items }))
    expect(result).toMatchObject({ ok: false, reason: 'Too many items.' })
  })

  it('accepts when total units equal the cap', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      productId: `p${i}`,
      title: `Item ${i}`,
      qty: 5,
    }))
    const result = validateOrderSubmission(validBody({ items }))
    expect(result).toMatchObject({ ok: true })
  })

  // — Note cap —

  it('rejects note exceeding cap', () => {
    const result = validateOrderSubmission(
      validBody({ note: 'N'.repeat(ORDER_LIMITS.noteMax + 1) }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Note is too long.' })
  })

  // — Contact cap —

  it('rejects contact exceeding cap', () => {
    const result = validateOrderSubmission(
      validBody({ contact: 'C'.repeat(ORDER_LIMITS.contactMax + 1) }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'Contact is too long.' })
  })

  // — Product allowlist —

  describe('with allowedProducts map', () => {
    const allowedProducts = new Map([
      ['prod-1', 'Official Sticker Pack'],
      ['prod-2', 'Handmade Book'],
    ])

    it('replaces client title with authoritative title', () => {
      const result = validateOrderSubmission(
        validBody({ items: [{ productId: 'prod-1', title: 'FAKE TITLE' }] }),
        allowedProducts,
      )
      expect(result).toMatchObject({ ok: true, spam: false })
      if (result.ok && !result.spam) {
        expect(result.order.items[0].title).toBe('Official Sticker Pack')
      }
    })

    it('drops items with unlisted productId', () => {
      const items = [
        { productId: 'prod-1', title: 'x', qty: 1 },
        { productId: 'unlisted', title: 'y', qty: 1 },
      ]
      const result = validateOrderSubmission(validBody({ items }), allowedProducts)
      expect(result).toMatchObject({ ok: true, spam: false })
      if (result.ok && !result.spam) {
        expect(result.order.items).toHaveLength(1)
        expect(result.order.items[0].productId).toBe('prod-1')
      }
    })

    it('rejects when ALL items are unlisted', () => {
      const items = [{ productId: 'unlisted', title: 'z', qty: 1 }]
      const result = validateOrderSubmission(validBody({ items }), allowedProducts)
      expect(result).toMatchObject({ ok: false, reason: 'No valid items in this order.' })
    })

    it('does not reject for empty/missing title when allowlist is present', () => {
      const result = validateOrderSubmission(
        validBody({ items: [{ productId: 'prod-1', title: '' }] }),
        allowedProducts,
      )
      expect(result).toMatchObject({ ok: true })
      if (result.ok && !result.spam) {
        expect(result.order.items[0].title).toBe('Official Sticker Pack')
      }
    })
  })
})

// ── isPlausibleFamilyId ─────────────────────────────────────────

describe('isPlausibleFamilyId', () => {
  it('accepts a 20-char Firestore-style auto-ID', () => {
    expect(isPlausibleFamilyId('A1b2C3d4E5f6G7h8I9j0')).toBe(true)
  })

  it('accepts IDs with hyphens and underscores', () => {
    expect(isPlausibleFamilyId('test_family-id')).toBe(true)
  })

  it('rejects IDs shorter than 6 chars', () => {
    expect(isPlausibleFamilyId('abc')).toBe(false)
  })

  it('rejects IDs longer than 128 chars', () => {
    expect(isPlausibleFamilyId('a'.repeat(129))).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isPlausibleFamilyId(12345)).toBe(false)
    expect(isPlausibleFamilyId(null)).toBe(false)
    expect(isPlausibleFamilyId(undefined)).toBe(false)
  })

  it('rejects IDs with special characters', () => {
    expect(isPlausibleFamilyId('abc/def/ghi')).toBe(false)
    expect(isPlausibleFamilyId('abc def')).toBe(false)
    expect(isPlausibleFamilyId('abc.def')).toBe(false)
  })
})

// ── isAllowedOrigin ─────────────────────────────────────────────

describe('isAllowedOrigin', () => {
  it('accepts each allowed origin', () => {
    for (const origin of ALLOWED_ORDER_ORIGINS) {
      expect(isAllowedOrigin(origin)).toBe(true)
    }
  })

  it('rejects undefined', () => {
    expect(isAllowedOrigin(undefined)).toBe(false)
  })

  it('rejects an unknown origin', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false)
  })

  it('rejects a substring match (must be exact)', () => {
    expect(isAllowedOrigin('https://barnesbro.web.app.evil.com')).toBe(false)
  })

  it('rejects case mismatch', () => {
    expect(isAllowedOrigin('HTTPS://BARNESBRO.WEB.APP')).toBe(false)
  })
})

// ── checkRateLimit ──────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows the first request for a new key', () => {
    const store = new Map()
    expect(checkRateLimit('ip-1', 1000, store)).toBe(true)
  })

  it('allows requests up to the limit', () => {
    const store = new Map()
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('ip-1', 1000, store)).toBe(true)
    }
  })

  it('blocks the request that exceeds the limit', () => {
    const store = new Map()
    for (let i = 0; i < 10; i++) {
      checkRateLimit('ip-1', 1000, store)
    }
    expect(checkRateLimit('ip-1', 1000, store)).toBe(false)
  })

  it('resets the window after windowMs', () => {
    const store = new Map()
    for (let i = 0; i < 10; i++) {
      checkRateLimit('ip-1', 1000, store)
    }
    expect(checkRateLimit('ip-1', 1000, store)).toBe(false)
    expect(checkRateLimit('ip-1', 61_000, store)).toBe(true)
  })

  it('tracks keys independently', () => {
    const store = new Map()
    for (let i = 0; i < 10; i++) {
      checkRateLimit('ip-1', 1000, store)
    }
    expect(checkRateLimit('ip-1', 1000, store)).toBe(false)
    expect(checkRateLimit('ip-2', 1000, store)).toBe(true)
  })

  it('respects custom limit and window', () => {
    const store = new Map()
    expect(checkRateLimit('ip-1', 0, store, 2, 5000)).toBe(true)
    expect(checkRateLimit('ip-1', 0, store, 2, 5000)).toBe(true)
    expect(checkRateLimit('ip-1', 0, store, 2, 5000)).toBe(false)
    expect(checkRateLimit('ip-1', 5000, store, 2, 5000)).toBe(true)
  })
})
