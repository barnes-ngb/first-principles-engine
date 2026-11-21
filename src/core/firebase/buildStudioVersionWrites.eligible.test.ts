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
  // The ONLY other helper this writer may reach: the pending credit job queue.
  buildStudioCreditJobsCollection: (familyId: string) => ({ __col: 'buildStudioCreditJobs', __family: familyId }),
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

  describe('the pending automatic-credit job', () => {
    const JOB_KEY = 'buildStudioCreditJobs/child-lincoln.apple-dash-starter.v-abc123'
    const jobSets = () => sets.filter((s) => (s.ref.__col as { __col: string }).__col === 'buildStudioCreditJobs')

    it('is created in the SAME transaction as a NEW eligible version, as a tiny exact reference', async () => {
      await saveBuildStudioVersion(args({ creditEligible: true }))
      expect(sets.map((s) => (s.ref.__col as { __col: string }).__col)).toEqual([
        'buildStudioVersions',
        'buildStudioCreditJobs',
      ])
      expect(jobSets()[0].ref.__id).toBe('child-lincoln.apple-dash-starter.v-abc123')
      expect(stored[JOB_KEY]).toEqual({
        schema: 1,
        childId: 'child-lincoln',
        projectId: 'apple-dash-starter',
        versionId: 'v-abc123',
        versionDocId: 'child-lincoln__apple-dash-starter__v-abc123',
        createdAt: { __sentinel: 'serverTimestamp' },
      })
      // A reference, not a decision: no minutes, date, subject, source or archive.
      expect(Object.keys(stored[JOB_KEY]).sort()).toEqual(
        ['childId', 'createdAt', 'projectId', 'schema', 'versionDocId', 'versionId'],
      )
    })

    it('is never created for a save that is not credit-eligible', async () => {
      await saveBuildStudioVersion(args())
      expect(jobSets()).toHaveLength(0)
      expect(stored[JOB_KEY]).toBeUndefined()
    })

    it('is never created, re-created or backfilled by a retry of an older (ineligible) version', async () => {
      await saveBuildStudioVersion(args())
      sets = []
      const retry = await saveBuildStudioVersion(args({ creditEligible: true }))
      expect(retry.outcome).toBe('alreadySaved')
      expect(sets).toHaveLength(0)
      expect(stored[JOB_KEY]).toBeUndefined()
    })

    it('a retry of an eligible save that already landed never creates a second job', async () => {
      await saveBuildStudioVersion(args({ creditEligible: true }))
      const job = { ...stored[JOB_KEY] }
      sets = []
      const retry = await saveBuildStudioVersion(args({ creditEligible: true }))
      expect(retry.outcome).toBe('alreadySaved')
      expect(sets).toHaveLength(0)
      expect(stored[JOB_KEY]).toEqual(job)
    })

    it('a consumed job is not recreated by a retry of the same saved version', async () => {
      await saveBuildStudioVersion(args({ creditEligible: true }))
      delete stored[JOB_KEY] // the credit attempt finished and removed it
      sets = []
      const retry = await saveBuildStudioVersion(args({ creditEligible: true }))
      expect(retry.outcome).toBe('alreadySaved')
      expect(jobSets()).toHaveLength(0)
    })

    it('has no job for another project, or for an id the credit paths cannot address', async () => {
      await saveBuildStudioVersion(args({ creditEligible: true, projectId: 'other-game' }))
      await saveBuildStudioVersion(args({ creditEligible: true, childId: 'child.with.dots' }))
      expect(jobSets()).toHaveLength(0)
    })
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
