import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { addDocMock, updateDocMock, onSnapshotMock, whereMock, queryMock } = vi.hoisted(() => ({
  addDocMock: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'watch-new' })),
  updateDocMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  onSnapshotMock: vi.fn<(...args: unknown[]) => () => void>(() => () => undefined),
  whereMock: vi.fn((...args: unknown[]) => ({ __where: args })),
  queryMock: vi.fn((coll: unknown, ...rest: unknown[]) => ({ __query: rest, coll })),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  updateDoc: updateDocMock,
  onSnapshot: onSnapshotMock,
  doc: vi.fn((_coll: unknown, id: string) => ({ __doc: id })),
  query: queryMock,
  where: whereMock,
}))

vi.mock('../../core/firebase/firestore', () => ({
  watchLibraryCollection: vi.fn(() => ({ __collection: 'watchLibrary' })),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

import type { WatchVideo } from '../../core/types'
import { useWatchLibrary } from './useWatchLibrary'

/** Drive the stored onSnapshot success callback with fake docs. */
function emitSnapshot(videos: WatchVideo[]) {
  const onNext = onSnapshotMock.mock.calls[0][1] as (snap: unknown) => void
  onNext({ docs: videos.map((v) => ({ id: v.id, data: () => v })) })
}

const videoAt = (id: string, updatedAt: string, childId: WatchVideo['childId'] = 'lincoln'): WatchVideo => ({
  id,
  youtubeId: 'dQw4w9WgXcQ',
  title: id,
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId,
  addedBy: 'parent',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt,
})

beforeEach(() => {
  addDocMock.mockClear()
  updateDocMock.mockClear()
  onSnapshotMock.mockReset()
  onSnapshotMock.mockReturnValue(() => undefined)
  whereMock.mockClear()
  queryMock.mockClear()
})

describe('useWatchLibrary', () => {
  it('lists videos from the snapshot (id after the spread), newest-updated first', async () => {
    const { result } = renderHook(() => useWatchLibrary('lincoln'))
    expect(result.current.loading).toBe(true)

    act(() => {
      emitSnapshot([
        videoAt('older', '2026-07-15T00:00:00.000Z'),
        videoAt('newest', '2026-07-17T00:00:00.000Z'),
        videoAt('middle', '2026-07-16T00:00:00.000Z'),
      ])
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.videos.map((v) => v.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('scopes the subscription with an in-filter over [childId, "both"] (D7)', () => {
    renderHook(() => useWatchLibrary('lincoln'))
    expect(whereMock).toHaveBeenCalledWith('childId', 'in', ['lincoln', 'both'])
  })

  it('surfaces a "both"-scoped video to each child (visible via the in-filter)', async () => {
    // London's subscription filters on [london, both]; a `both` video passes.
    const { result } = renderHook(() => useWatchLibrary('london'))
    expect(whereMock).toHaveBeenCalledWith('childId', 'in', ['london', 'both'])

    act(() => {
      emitSnapshot([videoAt('shared', '2026-07-17T00:00:00.000Z', 'both')])
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.videos.map((v) => v.childId)).toEqual(['both'])
  })

  it('clears prior results immediately when the child scope changes (no sibling bleed)', async () => {
    const { result, rerender } = renderHook(({ child }) => useWatchLibrary(child), {
      initialProps: { child: 'lincoln' as string },
    })

    act(() => {
      emitSnapshot([videoAt('lincolns', '2026-07-17T00:00:00.000Z', 'lincoln')])
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.videos).toHaveLength(1)

    // Switching to London must reset scoped state before the new snapshot lands.
    rerender({ child: 'london' })
    expect(result.current.videos).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('lists the whole family library (no filter) when childId is omitted', () => {
    renderHook(() => useWatchLibrary())
    expect(whereMock).not.toHaveBeenCalled()
    expect(onSnapshotMock).toHaveBeenCalled()
  })

  it('vets a video in via addDoc, stamping vettedAt/createdAt/updatedAt', async () => {
    const { result } = renderHook(() => useWatchLibrary('lincoln'))

    let newId = ''
    await act(async () => {
      newId = await result.current.addVideo({
        youtubeId: 'dQw4w9WgXcQ',
        title: 'How people first made cities',
        plannedMinutes: 12,
        subjectBucket: 'SocialStudies',
        childId: 'both',
        addedBy: 'parent',
      })
    })

    expect(newId).toBe('watch-new')
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.youtubeId).toBe('dQw4w9WgXcQ')
    expect(payload.title).toBe('How people first made cities') // verbatim parent voice
    expect(payload.childId).toBe('both')
    expect(payload.vettedAt).toBeTruthy()
    expect(payload.createdAt).toBeTruthy()
    expect(payload.updatedAt).toBeTruthy()
  })

  it('updates a video via updateDoc, re-stamping updatedAt', async () => {
    const { result } = renderHook(() => useWatchLibrary('lincoln'))
    await act(async () => {
      await result.current.updateVideo('watch-1', { title: 'renamed' })
    })
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const patch = updateDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(patch.title).toBe('renamed')
    expect(patch.updatedAt).toBeTruthy()
  })

  it('exposes no delete affordance (no retired flag this slice)', () => {
    const { result } = renderHook(() => useWatchLibrary('lincoln'))
    expect(result.current).not.toHaveProperty('deleteVideo')
    expect(result.current).not.toHaveProperty('removeVideo')
  })
})
