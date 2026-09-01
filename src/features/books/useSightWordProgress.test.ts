import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { getDocsMock } = vi.hoisted(() => ({ getDocsMock: vi.fn() }))

vi.mock('firebase/firestore', () => ({
  getDocs: getDocsMock,
  query: (c: unknown) => c,
  doc: vi.fn(() => ({ __ref: true })),
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}))

vi.mock('../../core/firebase/firestore', () => ({
  sightWordProgressCollection: () => ({ __collection: 'sightWordProgress' }),
  sightWordProgressDocId: (childId: string, word: string) => `${childId}_${word}`,
}))

import { useSightWordProgress } from './useSightWordProgress'

function docOf(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

beforeEach(() => {
  getDocsMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('useSightWordProgress — the read always settles (FEAT-169, Codex P1 on PR #1724)', () => {
  it('loads this child\'s words and clears loading', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        docOf('child-1_Water', { word: 'Water', masteryLevel: 'practicing' }),
        docOf('child-2_again', { word: 'again', masteryLevel: 'new' }),
      ],
    })
    const { result } = renderHook(() => useSightWordProgress('fam-1', 'child-1'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect([...result.current.progressMap.keys()]).toEqual(['water'])
  })

  it('a rejected read settles loading to false with an empty map — it never wedges a caller that gates on it', async () => {
    getDocsMock.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useSightWordProgress('fam-1', 'child-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.progressMap.size).toBe(0)
    expect(result.current.getWeakWords()).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load sight word progress:',
      expect.any(Error),
    )
  })
})
