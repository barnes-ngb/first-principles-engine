import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * An answer belongs to ONE subscription (LOCAL-BUILD-001).
 *
 * The hook used to tag each stored answer with a STRING built from the family,
 * child and project. Two different subscriptions for the same three values
 * therefore carried the same tag, and that is the whole defect: on `A → B → A`
 * the third subscription's tag is character-for-character the first one's, so
 * the list A answered with BEFORE the switch read as the current answer — and a
 * callback already in flight when the child changed, or when *Try again* was
 * tapped, could overwrite the newest answer with an older one.
 *
 * The real hook is exercised here, against a controllable `onSnapshot`: the
 * test decides when each subscription answers, and whether a retired one
 * answers at all.
 */

const { subs, onSnapshotMock, queryMock, whereMock } = vi.hoisted(() => {
  const subs: Array<{
    childId: string
    next: (snap: unknown) => void
    error: (err: unknown) => void
    unsubscribed: boolean
  }> = []
  return {
    subs,
    whereMock: vi.fn((field: string, op: string, value: string) => ({ field, op, value })),
    queryMock: vi.fn((coll: unknown, constraint: { value: string }) => ({
      coll,
      childId: constraint.value,
    })),
    onSnapshotMock: vi.fn(
      (
        q: { childId: string },
        next: (snap: unknown) => void,
        error: (err: unknown) => void,
      ) => {
        const sub = { childId: q.childId, next, error, unsubscribed: false }
        subs.push(sub)
        return () => {
          sub.unsubscribed = true
        }
      },
    ),
  }
})

vi.mock('firebase/firestore', () => ({
  onSnapshot: onSnapshotMock,
  query: queryMock,
  where: whereMock,
}))
vi.mock('../../core/firebase/firestore', () => ({
  buildStudioVersionsCollection: (familyId: string) => ({ __col: 'versions', familyId }),
}))

import { buildStudioVersionDocId } from '../../core/types/buildStudio'
import { useBuildStudioVersions } from './useBuildStudioVersions'

const PROJECT = 'apple-dash-starter'
const FAMILY = 'fam1'

/** A stored row, with the document id the writer would have given it. */
const row = (
  childId: string,
  versionId: string,
  label: string,
  createdAt = '2026-11-17T01:00:00.000Z',
) => ({
  id: buildStudioVersionDocId(childId, PROJECT, versionId),
  data: () => ({
    childId,
    projectId: PROJECT,
    versionId,
    label,
    createdAt,
    sourceArchive: '{}',
    byteSize: 2,
    fileCount: 1,
    sourceDigest: 'digest',
  }),
})

const snapshot = (docs: ReturnType<typeof row>[]) => ({ docs })

beforeEach(() => {
  subs.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('an answer is tagged with the subscription it came from', () => {
  it('does not reuse A’s first list on A → B → A', () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useBuildStudioVersions(FAMILY, childId, PROJECT),
      { initialProps: { childId: 'cA' } },
    )
    act(() => {
      subs[0].next(snapshot([row('cA', 'v1', 'A one')]))
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.versions.map((v) => v.label)).toEqual(['A one'])

    rerender({ childId: 'cB' })
    // The switch retired A's callbacks before unsubscribing.
    expect(subs[0].unsubscribed).toBe(true)
    expect(result.current.status).toBe('loading')
    expect(result.current.versions).toEqual([])

    // Back to A before its FRESH subscription has answered. This is the case
    // the string tag got wrong: nothing here is settled.
    rerender({ childId: 'cA' })
    expect(result.current.status).toBe('loading')
    expect(result.current.versions).toEqual([])
    expect(result.current.childId).toBeNull()

    // A's first callback, arriving late, is not an answer about this one.
    act(() => {
      subs[0].next(snapshot([row('cA', 'v1', 'A one')]))
    })
    expect(result.current.status).toBe('loading')

    // Only the live subscription's own answer settles it.
    expect(subs).toHaveLength(3)
    act(() => {
      subs[2].next(snapshot([row('cA', 'v2', 'A two')]))
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.versions.map((v) => v.label)).toEqual(['A two'])
  })

  it('lets no retired callback override the newest answer after a retry', () => {
    const { result } = renderHook(() => useBuildStudioVersions(FAMILY, 'cA', PROJECT))
    act(() => {
      subs[0].error(new Error('offline'))
    })
    expect(result.current.status).toBe('failed')

    act(() => {
      result.current.retry()
    })
    expect(subs[0].unsubscribed).toBe(true)
    expect(result.current.status).toBe('loading')

    expect(subs).toHaveLength(2)
    act(() => {
      subs[1].next(snapshot([row('cA', 'v9', 'after retry')]))
    })
    expect(result.current.status).toBe('ready')

    // The retried-away subscription answering — either way — changes nothing.
    act(() => {
      subs[0].next(snapshot([]))
      subs[0].error(new Error('late'))
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.versions.map((v) => v.label)).toEqual(['after retry'])
  })

  it('still asks ONE equality filter on the child, and sorts newest first', () => {
    const { result } = renderHook(() => useBuildStudioVersions(FAMILY, 'cA', PROJECT))
    expect(whereMock).toHaveBeenCalledWith('childId', '==', 'cA')
    // One constraint, so no composite index is implied.
    expect(queryMock.mock.calls[0]).toHaveLength(2)
    act(() => {
      subs[0].next(
        snapshot([
          row('cA', 'old', 'older', '2026-11-01T01:00:00.000Z'),
          row('cA', 'new', 'newer'),
        ]),
      )
    })
    expect(result.current.versions.map((v) => v.label)).toEqual(['newer', 'older'])
  })
})
