import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { LearnerModel } from '../types/learnerModel'

type SnapHandler = (snap: {
  exists: () => boolean
  data: () => LearnerModel | undefined
}) => void

let lastOnNext: SnapHandler | null = null
const mockUnsub = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => ({ col, id }),
  onSnapshot: (_ref: unknown, onNext: SnapHandler) => {
    lastOnNext = onNext
    return mockUnsub
  },
}))

vi.mock('../firebase/firestore', () => ({
  learnerModelsCollection: (familyId: string) => ({ familyId }),
}))

import { useLearnerModel } from './useLearnerModel'

const model = (childId: string): LearnerModel => ({
  childId,
  graphVersion: 'reading@1+math@1',
  status: 'synthesized',
  conceptStates: {},
  modalityCalibration: {
    reading: { note: '' },
    writing: { note: '' },
    math: { note: '' },
  },
  whatMattersNext: [],
  changeFeed: [],
  openQuestions: [],
  seededAt: '2026-07-01',
  updatedAt: '2026-07-01',
})

describe('useLearnerModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastOnNext = null
  })

  it('starts loading, then returns the subscribed model', () => {
    const { result } = renderHook(() => useLearnerModel('fam-1', 'c1'))
    expect(result.current.loading).toBe(true)
    expect(result.current.model).toBeNull()

    act(() => {
      lastOnNext?.({ exists: () => true, data: () => model('c1') })
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.model?.childId).toBe('c1')
  })

  it('returns null (not loading) when the doc is absent', () => {
    const { result } = renderHook(() => useLearnerModel('fam-1', 'c1'))
    act(() => {
      lastOnNext?.({ exists: () => false, data: () => undefined })
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.model).toBeNull()
  })

  it('does not subscribe and is not loading when childId is missing', () => {
    const { result } = renderHook(() => useLearnerModel('fam-1', undefined))
    expect(result.current.loading).toBe(false)
    expect(result.current.model).toBeNull()
    expect(lastOnNext).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useLearnerModel('fam-1', 'c1'))
    unmount()
    expect(mockUnsub).toHaveBeenCalled()
  })
})
