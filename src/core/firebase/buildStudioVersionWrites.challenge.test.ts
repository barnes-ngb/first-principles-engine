import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The optional challenge attempt on an explicitly saved version
 * (LOCAL-VISION-007, slice 2), at the writer boundary.
 *
 * Same two-export `./firestore` mock and the same transaction stand-in as
 * `buildStudioVersionWrites.test.ts`, so this still proves the write reaches
 * nothing but `buildStudioVersions`.
 */

vi.mock('./firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: (familyId: string) => ({
    __col: 'buildStudioVersions',
    __family: familyId,
  }),
}))

interface Ref {
  __col: unknown
  __id: string
}
let stored: Record<string, Record<string, unknown>> = {}
let sets: Array<{ ref: Ref; data: Record<string, unknown> }> = []
const keyOf = (ref: Ref): string =>
  `${(ref.__col as { __col?: string })?.__col ?? 'unknown'}/${ref.__id}`

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => ({ __col: col, __id: id }),
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

import type { BuildStudioChallengeAttempt } from '../types/buildStudio'
import {
  BUILD_STUDIO_VERSION_CONFLICT,
  BuildStudioRefused,
  saveBuildStudioVersion,
  type SaveBuildStudioVersionArgs,
} from './buildStudioVersionWrites'

const PXT = JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] })
const FILES = {
  'pxt.json': PXT,
  'main.ts': 'info.setLife(3)\nsprites.create(img``, SpriteKind.Player)\n',
  'main.blocks': '<xml><block type="pxt-on-start"><statement/></block></xml>',
}

const attemptFor = (
  overrides: Partial<BuildStudioChallengeAttempt> = {},
): BuildStudioChallengeAttempt => ({
  childId: 'child-lincoln',
  projectId: 'apple-dash-starter',
  versionId: 'v-abc123',
  attemptId: 'a-attempt1',
  challengeId: 'faster-hero',
  challengeRevision: 1,
  subjectBucket: 'PracticalArts',
  prediction: { optionId: 'faster', at: '2026-11-20T10:00:00.000Z' },
  playRequest: { at: '2026-11-20T10:01:00.000Z' },
  ...overrides,
})

function args(overrides: Record<string, unknown> = {}) {
  return {
    familyId: 'family-1',
    childId: 'child-lincoln',
    projectId: 'apple-dash-starter',
    versionId: 'v-abc123',
    files: FILES,
    label: 'Faster hero',
    createdAt: '2026-11-20T10:05:00.000Z',
    goalId: 'one-more-life',
    ...overrides,
  } as SaveBuildStudioVersionArgs
}

beforeEach(() => {
  stored = {}
  sets = []
})

describe('a version without a challenge is exactly the document it always was', () => {
  it('writes no challengeAttempt key — legacy goalId or not', async () => {
    await saveBuildStudioVersion(args())
    expect(sets).toHaveLength(1)
    expect('challengeAttempt' in sets[0].data).toBe(false)
    expect(sets[0].data.goalId).toBe('one-more-life')
  })
})

describe('a challenge attempt rides on the explicit Save', () => {
  it('stores the validated attempt on the one version document', async () => {
    const result = await saveBuildStudioVersion(args({ challengeAttempt: attemptFor() }))
    expect(result.outcome).toBe('created')
    expect(sets).toHaveLength(1)
    expect(sets[0].data.challengeAttempt).toEqual(attemptFor())
    expect(keyOf(sets[0].ref)).toBe(
      'buildStudioVersions/child-lincoln__apple-dash-starter__v-abc123',
    )
  })

  it('refuses an attempt scoped to another child, project or version', async () => {
    for (const bad of [
      attemptFor({ childId: 'child-london' }),
      attemptFor({ projectId: 'other-project' }),
      attemptFor({ versionId: 'v-other-1' }),
    ]) {
      await expect(saveBuildStudioVersion(args({ challengeAttempt: bad }))).rejects.toBeInstanceOf(
        BuildStudioRefused,
      )
    }
    expect(sets).toHaveLength(0)
  })

  it('refuses a malformed attempt rather than saving the game without it', async () => {
    await expect(
      saveBuildStudioVersion(args({ challengeAttempt: { ...attemptFor(), score: 99 } })),
    ).rejects.toBeInstanceOf(BuildStudioRefused)
    await expect(
      saveBuildStudioVersion(args({ challengeAttempt: 'a note' })),
    ).rejects.toBeInstanceOf(BuildStudioRefused)
    expect(sets).toHaveLength(0)
  })

  it('refuses a missing or non-canonical subject, and stores the authored one', async () => {
    for (const subjectBucket of [undefined, 'Reading', 'Other', 'math']) {
      await expect(
        saveBuildStudioVersion(
          args({ challengeAttempt: { ...attemptFor(), subjectBucket } }),
        ),
      ).rejects.toBeInstanceOf(BuildStudioRefused)
    }
    expect(sets).toHaveLength(0)
    await saveBuildStudioVersion(
      args({ challengeAttempt: attemptFor({ subjectBucket: 'Math' }) }),
    )
    expect(sets[0].data.challengeAttempt).toMatchObject({ subjectBucket: 'Math' })
  })
})

describe('an exact retry compares the identical shape', () => {
  it('resolves alreadySaved when the same bytes and the same record come back', async () => {
    await saveBuildStudioVersion(args({ challengeAttempt: attemptFor() }))
    const again = await saveBuildStudioVersion(args({ challengeAttempt: attemptFor() }))
    expect(again.outcome).toBe('alreadySaved')
    expect(sets).toHaveLength(1)
  })

  it('treats the same record in a different key order as the same', async () => {
    await saveBuildStudioVersion(args({ challengeAttempt: attemptFor() }))
    const a = attemptFor()
    const reordered = {
      reportedOutcome: undefined,
      playRequest: a.playRequest,
      prediction: a.prediction,
      challengeRevision: a.challengeRevision,
      subjectBucket: a.subjectBucket,
      challengeId: a.challengeId,
      attemptId: a.attemptId,
      versionId: a.versionId,
      projectId: a.projectId,
      childId: a.childId,
    }
    delete (reordered as Record<string, unknown>).reportedOutcome
    const again = await saveBuildStudioVersion(args({ challengeAttempt: reordered }))
    expect(again.outcome).toBe('alreadySaved')
  })

  it('never rewrites a stored version to add, change or drop a record', async () => {
    await saveBuildStudioVersion(args({ challengeAttempt: attemptFor() }))
    const outcome = {
      reportedOutcome: { result: 'matched' as const, at: '2026-11-20T10:02:00.000Z' },
    }
    await expect(
      saveBuildStudioVersion(args({ challengeAttempt: attemptFor(outcome) })),
    ).rejects.toThrow(BUILD_STUDIO_VERSION_CONFLICT)
    await expect(saveBuildStudioVersion(args())).rejects.toThrow(BUILD_STUDIO_VERSION_CONFLICT)
    expect(sets).toHaveLength(1)
    expect(sets[0].data.challengeAttempt).toEqual(attemptFor())
  })

  it('a legacy version and a legacy retry still match with no record on either side', async () => {
    await saveBuildStudioVersion(args())
    const again = await saveBuildStudioVersion(args())
    expect(again.outcome).toBe('alreadySaved')
    // …and a record is not quietly added to a legacy row.
    await expect(
      saveBuildStudioVersion(args({ challengeAttempt: attemptFor() })),
    ).rejects.toThrow(BUILD_STUDIO_VERSION_CONFLICT)
  })
})
