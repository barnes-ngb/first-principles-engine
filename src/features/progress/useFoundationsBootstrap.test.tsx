import { StrictMode } from 'react'
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
    // Always create-only from the tab — the ?diag=1 button owns the re-seed.
    expect(bootstrap).toHaveBeenCalledWith('fam-1', 'c1', 'create-only')
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

  // Codex round 1, P1 — the regression the first cut of these tests missed
  // because none of them delivered the snapshot the write itself causes.
  it('clears bootstrapping when the created model arrives on the snapshot', async () => {
    let release: (() => void) | undefined
    bootstrap.mockImplementationOnce(
      () => new Promise<never>((resolve) => { release = () => resolve({} as never) }),
    )
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof args>) => useFoundationsBootstrap(p),
      { initialProps: args() },
    )
    await waitFor(() => expect(result.current.bootstrapping).toBe(true))

    // The write creates the document; useLearnerModel's onSnapshot delivers it
    // BEFORE setDoc settles, which is the ordinary Firestore ordering. A
    // dep-change cancellation here left the tab on "Setting up …" forever.
    rerender(args({ model: { ...model(), status: 'no-data' } }))
    await act(async () => {
      release?.()
    })

    await waitFor(() => expect(result.current.bootstrapping).toBe(false))
    expect(result.current.failed).toBe(false)
    // And it did not start a second seed for the same child.
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })

  it('reports a failure even though the snapshot re-rendered mid-write', async () => {
    let reject: ((e: Error) => void) | undefined
    bootstrap.mockImplementationOnce(
      () => new Promise<never>((_r, rej) => { reject = rej }),
    )
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof args>) => useFoundationsBootstrap(p),
      { initialProps: args() },
    )
    await waitFor(() => expect(result.current.bootstrapping).toBe(true))

    rerender(args({ loading: true }))
    await act(async () => {
      reject?.(new Error('firestore down'))
    })

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.bootstrapping).toBe(false)
  })

  // ── Codex round 2 ──────────────────────────────────────────────────────
  // Both findings were about the round-1 fix's own state handling: a mounted
  // ref that StrictMode latched off, and a shared boolean a child switch left
  // stuck on. Every piece of state is keyed now, so both are gone by shape.

  it('reports its result under StrictMode’s setup → cleanup → setup', async () => {
    let release: (() => void) | undefined
    bootstrap.mockImplementationOnce(
      () => new Promise<never>((resolve) => { release = () => resolve({} as never) }),
    )
    const { result } = renderHook(() => useFoundationsBootstrap(args()), {
      wrapper: StrictMode,
    })
    await waitFor(() => expect(result.current.bootstrapping).toBe(true))
    // The attempted-key ref survives the replay, so exactly one seed runs.
    expect(bootstrap).toHaveBeenCalledTimes(1)

    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(result.current.bootstrapping).toBe(false))
  })

  it('surfaces a StrictMode failure instead of hiding it in development', async () => {
    bootstrap.mockRejectedValueOnce(new Error('firestore down') as never)
    const { result } = renderHook(() => useFoundationsBootstrap(args()), {
      wrapper: StrictMode,
    })
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.bootstrapping).toBe(false)
  })

  it('does not show the new child as bootstrapping when the old one is mid-write', async () => {
    let release: (() => void) | undefined
    bootstrap.mockImplementationOnce(
      () => new Promise<never>((resolve) => { release = () => resolve({} as never) }),
    )
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof args>) => useFoundationsBootstrap(p),
      { initialProps: args() },
    )
    await waitFor(() => expect(result.current.bootstrapping).toBe(true))

    // c2 already has a model, so its effect returns early and starts nothing.
    // A shared boolean left the tab reading "Setting up c2's map…" forever.
    rerender(args({ childId: 'c2', model: model() }))
    expect(result.current.bootstrapping).toBe(false)
    expect(bootstrap).toHaveBeenCalledTimes(1)

    await act(async () => {
      release?.()
    })
    expect(result.current.bootstrapping).toBe(false)
  })

  // Codex round 3 — two overlapping bootstraps, switching back before either
  // settles. A single running key was replaced by the second child's, so the
  // first reported `bootstrapping: false` while its transaction was still
  // running and its attempted guard blocked a re-run — the tab showed the empty
  // state for a child it was actively creating.
  it('keeps each concurrently running child’s state its own', async () => {
    const release: Record<string, (() => void) | undefined> = {}
    bootstrap.mockImplementation(((...a: unknown[]) =>
      new Promise<never>((resolve) => {
        release[a[1] as string] = () => resolve({} as never)
      })) as never)
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof args>) => useFoundationsBootstrap(p),
      { initialProps: args() },
    )
    await waitFor(() => expect(result.current.bootstrapping).toBe(true))

    // Both children absent, switched quickly: two overlapping bootstraps.
    rerender(args({ childId: 'c2' }))
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2))
    expect(result.current.bootstrapping).toBe(true)

    // Back to c1 before either settles — c1 is still being created.
    rerender(args())
    expect(result.current.bootstrapping).toBe(true)

    // c2 settling does not clear c1's state.
    await act(async () => {
      release['c2']?.()
    })
    expect(result.current.bootstrapping).toBe(true)

    await act(async () => {
      release['c1']?.()
    })
    await waitFor(() => expect(result.current.bootstrapping).toBe(false))
    rerender(args({ childId: 'c2' }))
    expect(result.current.bootstrapping).toBe(false)
  })

  it('keeps one child’s failure off another child’s view', async () => {
    bootstrap.mockRejectedValueOnce(new Error('firestore down') as never)
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof args>) => useFoundationsBootstrap(p),
      { initialProps: args() },
    )
    await waitFor(() => expect(result.current.failed).toBe(true))

    rerender(args({ childId: 'c2', model: model() }))
    expect(result.current.failed).toBe(false)

    // And c1 still shows its own failure when the parent goes back.
    rerender(args())
    expect(result.current.failed).toBe(true)
  })

  it('drops the result when the active child changed mid-write', async () => {
    let release: (() => void) | undefined
    bootstrap.mockImplementationOnce(
      () => new Promise<never>((_r, rej) => { release = () => rej(new Error('too late')) }),
    )
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof args>) => useFoundationsBootstrap(p),
      { initialProps: args() },
    )
    await waitFor(() => expect(result.current.bootstrapping).toBe(true))

    // c1's run settles after the tab moved to c2 — it must not report c2 failed.
    rerender(args({ childId: 'c2', model: model() }))
    await act(async () => {
      release?.()
    })

    expect(result.current.failed).toBe(false)
  })

  it('seeds the newly selected child when the active child changes', async () => {
    const { rerender } = renderHook((p: ReturnType<typeof args>) => useFoundationsBootstrap(p), {
      initialProps: args(),
    })
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1))
    rerender(args({ childId: 'c2' }))
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2))
    expect(bootstrap).toHaveBeenLastCalledWith('fam-1', 'c2', 'create-only')
  })
})
