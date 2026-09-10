import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SkillStatus } from './skillStatus'

/**
 * UX-344 — one child's whole skill map must never be written onto another
 * child's `childSkillMaps` document.
 *
 * `updateNodeStatus` builds `{ childId, skills: { ...skillMap?.skills, [node]:
 * entry } }` and `setDoc`s it merge onto a reference rebuilt from the LIVE
 * `childId`. The reference followed the switch; the payload did not. `LearningMap`
 * calls it on every status tap, and Progress has its own `ChildSelector`, so
 * this is reachable with the header switcher off.
 *
 * The second half is the failed read: the load's only `catch` covered the
 * initialise-from-history branch, so a rejected `getDoc` escaped `load()` while
 * `finally` still cleared `isLoading` — leaving the previous child's map in
 * state and presented as settled.
 *
 * The POSITIVE CONTROL is each block's assertion: remove the render-time clear,
 * the outer `catch`, or the `isEditable` guard, and they fail.
 */

const setDoc = vi.fn<(ref: unknown, data: unknown, opts?: unknown) => Promise<void>>(
  async () => {},
)
const getDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (_col: unknown, id: string) => ({ id }),
  getDoc: (ref: unknown) => getDoc(ref),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(() => ({})),
  setDoc: (ref: unknown, data: unknown, opts?: unknown) => setDoc(ref, data, opts),
}))

vi.mock('../auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

vi.mock('../firebase/firestore', () => ({
  childSkillMapsCollection: () => ({}),
  sightWordProgressCollection: () => ({}),
  skillSnapshotsCollection: () => ({}),
}))

vi.mock('./updateSkillMapFromFindings', () => ({
  initializeSkillMapFromHistory: vi.fn(async (_f: string, childId: string) => ({
    childId,
    skills: {},
    updatedAt: '2026-09-10T00:00:00.000Z',
  })),
}))

const LINCOLN_SKILLS = {
  'reading.cvc': {
    nodeId: 'reading.cvc',
    status: SkillStatus.Mastered,
    source: 'manual' as const,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
}

function mapSnap(childId: string, skills: unknown) {
  return {
    id: childId,
    exists: () => true,
    data: () => ({ childId, skills, updatedAt: '2026-09-01T00:00:00.000Z' }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('useSkillMap binds its payload to the child it read for', () => {
  it('drops the loaded map on a child change, before the new read opens', async () => {
    const { useSkillMap } = await import('./useSkillMap')
    // The stored map, then the snapshot read inside the re-derivation pass.
    getDoc.mockImplementation(async (ref: { id: string }) =>
      ref.id === 'lincoln'
        ? mapSnap('lincoln', LINCOLN_SKILLS)
        : { exists: () => false, id: ref.id, data: () => ({}) },
    )

    const { result, rerender } = renderHook(({ childId }: { childId: string }) => useSkillMap(childId), {
      initialProps: { childId: 'lincoln' },
    })
    await waitFor(() => expect(result.current.isEditable).toBe(true))
    expect(result.current.skillMap?.skills['reading.cvc']).toBeDefined()

    // A read that never resolves — the window the defect lived in.
    getDoc.mockReturnValue(new Promise(() => {}))
    rerender({ childId: 'london' })

    // POSITIVE CONTROL — without the render-time clear this still held
    // Lincoln's map while `updateNodeStatus` addressed London's document.
    expect(result.current.skillMap).toBeNull()
    expect(result.current.isEditable).toBe(false)

    await act(async () => {
      await result.current.updateNodeStatus('reading.blends', SkillStatus.InProgress)
    })
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('stays un-editable after a FAILED read, and writes nothing', async () => {
    const { useSkillMap } = await import('./useSkillMap')
    getDoc.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useSkillMap('lincoln'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // POSITIVE CONTROL — before the outer `catch`, the rejection escaped
    // `load()` while `finally` cleared `isLoading`, so the hook reported a
    // settled map it did not have.
    expect(result.current.loadFailed).toBe(true)
    expect(result.current.isEditable).toBe(false)

    await act(async () => {
      await result.current.updateNodeStatus('reading.cvc', SkillStatus.Mastered)
    })
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('writes the new child’s own map once their read has settled', async () => {
    const { useSkillMap } = await import('./useSkillMap')
    const londonSkills = {
      'reading.letters': {
        nodeId: 'reading.letters',
        status: SkillStatus.InProgress,
        source: 'manual' as const,
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    }
    getDoc.mockImplementation(async (ref: { id: string }) => {
      if (ref.id === 'lincoln') return mapSnap('lincoln', LINCOLN_SKILLS)
      if (ref.id === 'london') return mapSnap('london', londonSkills)
      return { exists: () => false, id: ref.id, data: () => ({}) }
    })

    const { result, rerender } = renderHook(({ childId }: { childId: string }) => useSkillMap(childId), {
      initialProps: { childId: 'lincoln' },
    })
    await waitFor(() => expect(result.current.isEditable).toBe(true))

    rerender({ childId: 'london' })
    await waitFor(() => expect(result.current.skillMap?.childId).toBe('london'))

    setDoc.mockClear()
    await act(async () => {
      await result.current.updateNodeStatus('reading.blends', SkillStatus.Mastered)
    })

    // The gate closes a hole; it does not disable the feature.
    expect(setDoc).toHaveBeenCalledTimes(1)
    const [ref, data, opts] = setDoc.mock.calls[0] as unknown as [
      { id: string },
      { childId: string; skills: Record<string, unknown> },
      unknown,
    ]
    expect(ref.id).toBe('london')
    expect(data.childId).toBe('london')
    // London's own map, plus the node just tapped — and NOT Lincoln's.
    expect(Object.keys(data.skills).sort()).toEqual(['reading.blends', 'reading.letters'])
    expect(data.skills['reading.cvc']).toBeUndefined()
    // Nothing about the written shape changed: same merge, same entry.
    expect(opts).toEqual({ merge: true })
  })
})
