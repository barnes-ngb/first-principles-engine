import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `creditEligible` on an explicit Save (LOCAL-VISION-007, slice 3): a NEW version
 * gets Firestore's server acceptance time; nothing else about the save changes,
 * and a retry of an older version never gains one. Same stand-ins as
 * `buildStudioVersionWrites.challenge.test.ts`, plus the one extra export.
 */

vi.mock('./firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: (familyId: string) => ({ __col: 'buildStudioVersions', __family: familyId }),
}))

interface Ref {
  __col: unknown
  __id: string
}
let stored: Record<string, Record<string, unknown>> = {}
let sets: Array<{ ref: Ref; data: Record<string, unknown> }> = []
const keyOf = (ref: Ref): string => `${(ref.__col as { __col?: string })?.__col ?? 'unknown'}/${ref.__id}`

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => ({ __col: col, __id: id }),
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  runTransaction: async (
    _db: unknown,
    body: (tx: {
      get: (ref: Ref) => Promise<{ exists: () => boolean; data: () => unknown }>
      set: (ref: Ref, data: Record<string, unknown>) => void
    }) => Promise<unknown>,
  ) =>
    body({
      get: async (ref: Ref) => {
        const data = stored[keyOf(ref)]
        return { exists: () => data !== undefined, data: () => data }
      },
      set: (ref: Ref, data: Record<string, unknown>) => {
        sets.push({ ref, data })
        stored[keyOf(ref)] = data
      },
    }),
}))

import { saveBuildStudioVersion, type SaveBuildStudioVersionArgs } from './buildStudioVersionWrites'

const FILES = {
  'pxt.json': JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] }),
  'main.ts': 'info.setLife(3)\nsprites.create(img``, SpriteKind.Player)\n',
  'main.blocks': '<xml><block type="pxt-on-start"><statement/></block></xml>',
}
const args = (overrides: Record<string, unknown> = {}) =>
  ({
    familyId: 'family-1',
    childId: 'child-lincoln',
    projectId: 'apple-dash-starter',
    versionId: 'v-abc123',
    files: FILES,
    createdAt: '2026-11-20T10:05:00.000Z',
    ...overrides,
  }) as SaveBuildStudioVersionArgs

beforeEach(() => {
  stored = {}
  sets = []
})

describe('creditEligible', () => {
  it('stamps the server acceptance time on a NEW version only when asked', async () => {
    await saveBuildStudioVersion(args({ creditEligible: true }))
    expect(sets[0].data.acceptedAt).toEqual({ __sentinel: 'serverTimestamp' })

    sets = []
    await saveBuildStudioVersion(args({ versionId: 'v-other99' }))
    expect('acceptedAt' in sets[0].data).toBe(false)
  })

  it('does not return the sentinel to the caller as if it were a time', async () => {
    const result = await saveBuildStudioVersion(args({ creditEligible: true }))
    expect(result.outcome).toBe('created')
    expect('acceptedAt' in result.version).toBe(false)
  })

  it('never adds, changes or backfills it on a retry of an older version', async () => {
    await saveBuildStudioVersion(args()) // an older, ineligible save
    const before = { ...stored[keyOf(sets[0].ref)] }
    sets = []

    const retry = await saveBuildStudioVersion(args({ creditEligible: true }))
    expect(retry.outcome).toBe('alreadySaved')
    expect(sets).toHaveLength(0) // no write at all
    expect(stored[keyOf({ __col: { __col: 'buildStudioVersions' }, __id: 'child-lincoln__apple-dash-starter__v-abc123' })]).toEqual(before)
    expect('acceptedAt' in before).toBe(false)
  })

  it('does not change the retry identity or the rest of the document', async () => {
    await saveBuildStudioVersion(args({ creditEligible: true }))
    const rest = Object.fromEntries(Object.entries(sets[0].data).filter(([k]) => k !== 'acceptedAt'))
    sets = []
    stored = {}
    await saveBuildStudioVersion(args())
    expect(sets[0].data).toEqual(rest)
  })
})
