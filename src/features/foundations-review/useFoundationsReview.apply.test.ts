// UX-287 — a confirm tap that cannot be written must SAY so. This path used to be
// `console.warn` + return: no error, no state change, the card still reading
// *pending*, and a parent with no way to tell the tap had done nothing.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const chatMock = vi.fn()
const getDocMock = vi.fn()
const setDocMock = vi.fn(async () => {})

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => getDocMock(...(args as [])),
  setDoc: (...args: unknown[]) => setDocMock(...(args as [])),
}))
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: vi.fn(() => ({})),
  learnerReviewSessionsCollection: vi.fn(() => ({})),
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../core/ai/useAI', () => ({
  TaskType: { FoundationsReview: 'foundationsReview' },
  useAI: () => ({ chat: chatMock }),
}))

import { useFoundationsReview } from './useFoundationsReview'
import type { FoundationsReviewAction } from './foundationsReviewActions'

const ARGS = { familyId: 'fam-1', childId: 'c1', childName: 'Lincoln', domain: 'reading' as const }
const CVC = 'reading.phonics.cvc'

/** One assistant turn carrying an attest proposal, so a card is staged. */
const ATTEST_REPLY = `Great.
<action>${JSON.stringify({
  kind: 'attest',
  childId: 'c1',
  conceptId: CVC,
  state: 'solid',
  note: 'He read cat, run, sit',
})}</action>`

afterEach(() => vi.clearAllMocks())

/** Start a session with no learner model, and stage one proposal. */
async function sessionWithNoModel() {
  getDocMock.mockResolvedValue({ exists: () => false, data: () => ({}) })
  chatMock.mockResolvedValue({ message: ATTEST_REPLY })
  const { result } = renderHook(() => useFoundationsReview(ARGS))
  await act(async () => {
    await result.current.start()
  })
  return result
}

describe('useFoundationsReview.applyAction with no learner model (UX-287)', () => {
  it('stages a proposal even though there is no model to write to', async () => {
    const result = await sessionWithNoModel()
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].status).toBe('pending')
  })

  it('surfaces an error and marks the card failed instead of failing silently', async () => {
    const result = await sessionWithNoModel()
    const action = result.current.pending[0].action as FoundationsReviewAction

    await act(async () => {
      await result.current.applyAction(action)
    })

    expect(result.current.error).toMatch(/isn’t set up yet/)
    expect(result.current.error).toMatch(/Foundations tab/)
    expect(result.current.pending[0].status).toBe('failed')
    // Nothing partial reached Firestore.
    expect(setDocMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ conceptStates: expect.anything() }),
      expect.anything(),
    )
  })
})
