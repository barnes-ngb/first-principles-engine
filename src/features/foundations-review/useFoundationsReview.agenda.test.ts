import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearnerModel, ReviewSessionMessage } from '../../core/types/learnerModel'

const chatMock = vi.fn()
const getDocMock = vi.fn()
const setDocMock = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))
vi.mock('firebase/storage', () => ({ getDownloadURL: vi.fn(), ref: vi.fn(), uploadBytes: vi.fn() }))
vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: vi.fn(() => ({})), learnerReviewSessionsCollection: vi.fn(() => ({})),
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../core/ai/useAI', () => ({
  TaskType: { FoundationsReview: 'foundationsReview' }, useAI: () => ({ chat: chatMock }),
}))
import { useFoundationsReview } from './useFoundationsReview'

const ID = 'reading.phonics.cvc'
const ARGS = { familyId: 'family-test', childId: 'child-test', childName: 'Child', domain: 'reading' as const }
const stamp = '2026-10-17T10:00:00.000Z'
const model = () => ({
  childId: ARGS.childId,
  conceptStates: {
    [ID]: {
      state: 'forming', completionReviewNeeded: true, updatedAt: stamp,
      evidence: [
        ...[1, 2, 3].map((n) => ({
          kind: 'programCompletionCoverage', completionId: `retired-${n}`,
          status: 'superseded', observedAt: stamp, note: `Withdrawn completion ${n}`,
        })),
        { kind: 'eval', readState: 'frontier', observedAt: stamp, note: 'Current direct observation' },
        { kind: 'attestation', status: 'active', observedAt: stamp, note: 'Active parent observation' },
      ],
    },
  },
}) as unknown as LearnerModel
const snapshot = (data: unknown) => ({ exists: () => data !== null, data: () => data })
const oldMarker = `[FOUNDATIONS_REVIEW]${JSON.stringify({ domain: 'reading', concepts: [{ conceptId: ID, state: 'forming', evidence: ['Withdrawn completion 1'] }] })}[/FOUNDATIONS_REVIEW]\nLet us review.`
function sentConcept() {
  const sent = chatMock.mock.calls.at(-1)![0].messages as Array<{ role: string; content: string }>
  const marker = sent.find((m) => m.role === 'user' && m.content.includes('[FOUNDATIONS_REVIEW]'))!
  const data = JSON.parse(marker.content.match(/\[FOUNDATIONS_REVIEW\]([\s\S]*?)\[\/FOUNDATIONS_REVIEW\]/)![1])
  return data.concepts.find((c: { conceptId: string }) => c.conceptId === ID)
}
beforeEach(() => {
  chatMock.mockResolvedValue({ message: 'What did you observe?' })
  setDocMock.mockResolvedValue(undefined)
})
afterEach(() => vi.resetAllMocks())

describe('Review agenda uses current completion interpretation', () => {
  it('filters withdrawn notes before limiting evidence and leaves stored history unchanged', async () => {
    const current = model()
    const before = structuredClone(current)
    getDocMock.mockResolvedValueOnce(snapshot(current)).mockResolvedValueOnce(snapshot(null))
    const { result } = renderHook(() => useFoundationsReview(ARGS))
    await act(async () => { await result.current.start() })
    expect(sentConcept()).toMatchObject({ state: 'frontier', evidence: ['Current direct observation', 'Active parent observation'] })
    expect(current).toEqual(before)
    expect(setDocMock.mock.calls.every((call) => !('conceptStates' in call[1]))).toBe(true)
  })

  it.each([false, true])('refreshes the first saved agenda on resume (persistence failure: %s)', async (fails) => {
    const visible: ReviewSessionMessage = { role: 'assistant', content: 'Earlier discussion stays visible.', at: stamp }
    const saved: ReviewSessionMessage[] = [{ role: 'user', hidden: true, content: oldMarker, at: stamp }, visible]
    const original = structuredClone(saved)
    getDocMock.mockResolvedValueOnce(snapshot(model())).mockResolvedValueOnce(snapshot({ messages: saved }))
    if (fails) setDocMock.mockRejectedValue(new Error('synthetic session-save failure'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { result } = renderHook(() => useFoundationsReview(ARGS))
      await act(async () => { await result.current.start() })
      expect(chatMock).not.toHaveBeenCalled()
      expect(result.current.messages).toEqual([visible])
      expect(setDocMock.mock.calls[0][1].messages[0].at).toBe(stamp)
      await act(async () => { await result.current.send('Continue with current evidence.') })
      expect(sentConcept()).toMatchObject({ state: 'frontier', evidence: ['Current direct observation', 'Active parent observation'] })
      expect(saved).toEqual(original)
    } finally { warn.mockRestore() }
  })

  it('adds current hidden context to a legacy conversation without a marker', async () => {
    const visible: ReviewSessionMessage = { role: 'user', content: 'My earlier observation', at: stamp }
    getDocMock.mockResolvedValueOnce(snapshot(model())).mockResolvedValueOnce(snapshot({ messages: [visible] }))
    const { result } = renderHook(() => useFoundationsReview(ARGS))
    await act(async () => { await result.current.start() })
    expect(setDocMock.mock.calls[0][1].messages[0].hidden).toBe(true)
    expect(result.current.messages).toEqual([visible])
    await act(async () => { await result.current.send('Continue') })
    expect(sentConcept().state).toBe('frontier')
  })
})
