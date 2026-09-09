import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrap = vi.fn(async () => ({}) as never)
vi.mock('../../core/foundations/bootstrapLearnerModel', () => ({
  bootstrapLearnerModel: (...args: unknown[]) => bootstrap(...(args as [])),
}))

import { useFoundationsBootstrap } from './useFoundationsBootstrap'
import type { LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-09-09T12:00:00.000Z'
const model = (): LearnerModel => ({
  childId: 'c1',
  graphVersion: 'reading@1+math@1',
  status: 'seeded',
  conceptStates: {},
  modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
  whatMattersNext: [],
  changeFeed: [],
  openQuestions: [],
  seededAt: NOW,
  updatedAt: NOW,
})

const args = (over = {}) => ({
  familyId: 'fam-1',
  childId: 'c1',
  canEdit: true,
  model: null as LearnerModel | null,
  loading: false,
  ...over,
})

beforeEach(() => {
  bootstrap.mockReset()
  bootstrap.mockResolvedValue({} as never)
})

describe('useFoundationsBootstrap (UX-286)', () => {
  it('creates the model once when the snapshot resolves absent', async () => {
    renderHook(() => useFoundationsBootstrap(args()))
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1))
    expect(bootstrap).toHaveBeenCalledWith('fam-1', 'c1')
  })

  it('does not seed twice when the snapshot delivers again', async () => {
    const { rerender } = renderHook((p: ReturnType<typeof args>) => useFoundationsBootstrap(p), {
      initialProps: args(),
    })
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1))
    // A second delivery of the same absent snapshot (a re-render, a loading flip).
    rerender(args())
    rerender(args({ loading: true }))
    rerender(args())
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1))
  })

  it('never seeds when a model already exists', async () => {
    renderHook(() => useFoundationsBootstrap(args({ model: model() })))
    await waitFor(() => expect(bootstrap).not.toHaveBeenCalled())
  })

  it('never seeds for a profile that may not write', async () => {
    renderHook(() => useFoundationsBootstrap(args({ canEdit: false })))
    await waitFor(() => expect(bootstrap).not.toHaveBeenCalled())
  })

  it('never seeds mid-load', async () => {
    renderHook(() => useFoundationsBootstrap(args({ loading: true })))
    await waitFor(() => expect(bootstrap).not.toHaveBeenCalled())
  })

  it('reports a failure instead of swallowing it, and retry re-runs', async () => {
    bootstrap.mockRejectedValueOnce(new Error('firestore down') as never)
    const { result } = renderHook(() => useFoundationsBootstrap(args()))

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.bootstrapping).toBe(false)

    act(() => result.current.retry())
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.failed).toBe(false))
  })

  it('seeds the newly selected child when the active child changes', async () => {
    const { rerender } = renderHook((p: ReturnType<typeof args>) => useFoundationsBootstrap(p), {
      initialProps: args(),
    })
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1))
    rerender(args({ childId: 'c2' }))
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2))
    expect(bootstrap).toHaveBeenLastCalledWith('fam-1', 'c2')
  })
})
