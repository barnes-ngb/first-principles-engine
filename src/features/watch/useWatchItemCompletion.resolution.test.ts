import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayLog, WatchVideo } from '../../core/types'

const { addDocMock } = vi.hoisted(() => ({ addDocMock: vi.fn(async () => ({ id: 'artifact-1' })) }))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  collection: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __collection: 'artifacts' })),
}))

import { useWatchItemCompletion } from './useWatchItemCompletion'

const video = (id: string, childId: WatchVideo['childId'], status?: WatchVideo['status']): WatchVideo => ({
  id,
  youtubeId: 'dQw4w9WgXcQ',
  title: 'How people first made cities',
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId,
  addedBy: 'parent',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...(status ? { status } : {}),
})

const plannedItem: ChecklistItem = {
  label: 'Watch: How people first made cities',
  completed: false,
  itemType: 'watch',
  watchVideoId: 'v1',
} as ChecklistItem

const dayLog = { checklist: [plannedItem] } as DayLog

function setup(videos: WatchVideo[]) {
  return renderHook(() =>
    useWatchItemCompletion({
      familyId: 'family-1',
      childId: 'lincoln',
      dayLog,
      persistDayLogImmediate: vi.fn(),
      videos,
      dayLogId: '2026-07-26',
    }),
  )
}

beforeEach(() => {
  addDocMock.mockClear()
})

/**
 * FEAT-129 regression (Codex P1 on PR #1637).
 *
 * The library editor lets a parent change a video's `childId` scope. Today used
 * to resolve planned items against `useWatchLibrary(childId)`, whose
 * `where('childId','in',[childId,'both'])` filter would then EXCLUDE the edited
 * document — stranding an item that was already planned for the other child:
 * the player resolved `null`, so it could be neither watched nor completed.
 *
 * The fix is at the call sites (`TodayPage` / `KidTodayView` pass the unscoped
 * library). These tests pin the contract the hook depends on: resolution is a
 * by-id lookup that must not care about scope or lifecycle.
 */
describe('useWatchItemCompletion — planned items stay resolvable (FEAT-129)', () => {
  it('resolves a video that was re-scoped to the SIBLING after it was planned', () => {
    // Planned for Lincoln while scoped 'both'; the parent later re-scoped it to London.
    const { result } = setup([video('v1', 'london')])

    act(() => result.current.openWatch(plannedItem, 0))
    expect(result.current.watchVideo).not.toBeNull()
    expect(result.current.watchVideo?.id).toBe('v1')
  })

  it('resolves a video that was RETIRED after it was planned', () => {
    const { result } = setup([video('v1', 'both', 'retired')])

    act(() => result.current.openWatch(plannedItem, 0))
    expect(result.current.watchVideo?.id).toBe('v1')
  })

  it('still resolves the ordinary in-scope case', () => {
    const { result } = setup([video('v1', 'lincoln')])

    act(() => result.current.openWatch(plannedItem, 0))
    expect(result.current.watchVideo?.id).toBe('v1')
  })

  it('resolves null when the id genuinely is not in the library (unchanged)', () => {
    const { result } = setup([video('someone-else', 'both')])

    act(() => result.current.openWatch(plannedItem, 0))
    expect(result.current.watchVideo).toBeNull()
  })

  it('opening a planned item writes nothing until it is completed', () => {
    const { result } = setup([video('v1', 'london')])
    act(() => result.current.openWatch(plannedItem, 0))
    expect(addDocMock).not.toHaveBeenCalled()
  })
})
