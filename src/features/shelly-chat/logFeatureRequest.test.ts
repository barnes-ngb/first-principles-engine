import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────
// Mock Firestore + the collection helper so the silent dedup'd-write
// contract is testable without touching real Firebase (per CLAUDE.md).
const addDoc = vi.fn()
const getDocs = vi.fn()
const where = vi.fn((...a: unknown[]) => ({ __where: a }))
const query = vi.fn((...a: unknown[]) => ({ __query: a }))
const limit = vi.fn((...a: unknown[]) => ({ __limit: a }))
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  where: (...args: unknown[]) => where(...args),
  query: (...args: unknown[]) => query(...args),
  limit: (...args: unknown[]) => limit(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  featureRequestsCollection: vi.fn(() => ({ __collection: true })),
}))

import { hashWant, logFeatureRequest } from './logFeatureRequest'

beforeEach(() => {
  vi.clearAllMocks()
  addDoc.mockResolvedValue({ id: 'fr1' })
  getDocs.mockResolvedValue({ empty: true })
})

describe('hashWant', () => {
  it('is stable for the same normalized want (case/whitespace-insensitive)', () => {
    expect(hashWant('See all missed words')).toBe(hashWant('  see   ALL  missed words '))
  })

  it('differs for different wants', () => {
    expect(hashWant('reorder the checklist')).not.toBe(hashWant('see all missed words'))
  })
})

describe('logFeatureRequest', () => {
  it('writes a new entry with status "new" when no duplicate exists', async () => {
    const ok = await logFeatureRequest('fam1', {
      quote: 'I wish I could see all his missed words in one place',
      interpretedWant: 'A single view of all missed sight words',
      childId: 'lincoln1',
      context: 'shelly-chat',
    })

    expect(ok).toBe(true)
    expect(addDoc).toHaveBeenCalledTimes(1)
    const payload = addDoc.mock.calls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('new')
    expect(payload.quote).toBe('I wish I could see all his missed words in one place')
    expect(payload.interpretedWant).toBe('A single view of all missed sight words')
    expect(payload.childId).toBe('lincoln1')
    expect(payload.context).toBe('shelly-chat')
    expect(typeof payload.createdAt).toBe('string')
    expect(payload.dedupKey).toBe(hashWant('A single view of all missed sight words'))
  })

  it('omits childId from the payload when not provided', async () => {
    await logFeatureRequest('fam1', {
      quote: 'general friction',
      interpretedWant: 'something general',
      context: 'shelly-chat',
    })
    const payload = addDoc.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('childId')
  })

  it('skips the write when a doc with the same dedupKey already exists', async () => {
    getDocs.mockResolvedValue({ empty: false })

    const ok = await logFeatureRequest('fam1', {
      quote: 'said differently',
      interpretedWant: 'A single view of all missed sight words',
      context: 'shelly-chat',
    })

    expect(ok).toBe(false)
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('swallows a write failure and returns false (never breaks the chat turn)', async () => {
    addDoc.mockRejectedValue(new Error('permission denied'))

    let ok: boolean | undefined
    await expect(
      (async () => {
        ok = await logFeatureRequest('fam1', {
          quote: 'q',
          interpretedWant: 'w',
          context: 'shelly-chat',
        })
      })(),
    ).resolves.toBeUndefined()

    expect(ok).toBe(false)
  })

  it('swallows a dedup-read failure and returns false', async () => {
    getDocs.mockRejectedValue(new Error('offline'))

    const ok = await logFeatureRequest('fam1', {
      quote: 'q',
      interpretedWant: 'w',
      context: 'shelly-chat',
    })

    expect(ok).toBe(false)
    expect(addDoc).not.toHaveBeenCalled()
  })
})
