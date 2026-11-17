import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The writer boundary for LOCAL-BUILD-001.
 *
 * ── How the boundary is ASSERTED rather than described ─────────────────────
 *
 * The `./firestore` mock below exports exactly TWO things: `db` and the
 * versions collection. Vitest throws on access to any other export of a mocked
 * module, so if this writer ever reaches for `hoursCollection`,
 * `xpLedgerCollection`, `skillSnapshotsCollection`, `learnerModelsCollection`,
 * `artifactsCollection`, `activityConfigsCollection` or anything else, these
 * tests fail at that line instead of quietly passing. The same goes for
 * `firebase/firestore`: only `doc` and `runTransaction` exist here, so an
 * `addDoc`, `updateDoc`, `deleteDoc`, `increment` or `writeBatch` would fail
 * too.
 *
 * That is a stronger claim than "the imports look right", and it is the
 * `nativeProgressWrites` precedent.
 */

const collectionFor = vi.fn((familyId: string) => ({
  __col: 'buildStudioVersions',
  __family: familyId,
}))

vi.mock('./firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: (familyId: string) => collectionFor(familyId),
}))

interface Ref {
  __col: unknown
  __id: string
}

/** Documents the transaction can see, keyed by collection and id. */
let stored: Record<string, Record<string, unknown>> = {}
/** Every `tx.set` this run performed. */
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

import { serializeBuildStudioSource } from '../types/buildStudio'
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

function args(overrides: Record<string, unknown> = {}) {
  return {
    familyId: 'family-1',
    childId: 'child-lincoln',
    projectId: 'apple-dash-starter',
    versionId: 'v-abc123',
    files: FILES,
    label: 'One more life',
    createdAt: '2026-11-17T21:00:00.000Z',
    ...overrides,
  } as SaveBuildStudioVersionArgs
}

beforeEach(() => {
  stored = {}
  sets = []
  collectionFor.mockClear()
})

describe('one Save writes one version, to the one collection', () => {
  it('creates the version and reports that it did', async () => {
    const result = await saveBuildStudioVersion(args())
    expect(result.outcome).toBe('created')
    expect(sets).toHaveLength(1)
    expect(keyOf(sets[0].ref)).toBe(
      'buildStudioVersions/child-lincoln__apple-dash-starter__v-abc123',
    )
    expect(collectionFor).toHaveBeenCalledWith('family-1')
  })

  it('stores the source as ONE text field, not a map of file names', async () => {
    // `pxt.json` as a Firestore map key is the field path `pxt` → `json`. The
    // whole reason the archive is a string.
    const result = await saveBuildStudioVersion(args())
    expect(typeof result.version.sourceArchive).toBe('string')
    expect(result.version.sourceArchive).toBe(serializeBuildStudioSource(FILES))
    expect(result.version.fileCount).toBe(3)
    expect(result.version.byteSize).toBe(result.version.sourceArchive.length)
    expect(result.version).not.toHaveProperty('text')
  })

  it('carries the owner, the project and the save identity', async () => {
    const result = await saveBuildStudioVersion(args({ visitId: 's-1', goalId: 'one-more-life' }))
    expect(result.version.childId).toBe('child-lincoln')
    expect(result.version.projectId).toBe('apple-dash-starter')
    expect(result.version.versionId).toBe('v-abc123')
    expect(result.version.visitId).toBe('s-1')
    expect(result.version.goalId).toBe('one-more-life')
  })
})

describe('a retry of the same action is not a second version', () => {
  it('reports alreadySaved and writes nothing', async () => {
    await saveBuildStudioVersion(args())
    sets = []
    const again = await saveBuildStudioVersion(args())
    expect(again.outcome).toBe('alreadySaved')
    expect(sets).toHaveLength(0)
    // The receipt is for the STORED row, which is the one on the record.
    expect(again.version.sourceArchive).toBe(serializeBuildStudioSource(FILES))
  })

  it('is idempotent on the SAME bytes even when the label differs', async () => {
    // The identity check is the archive, so a retry that happens to carry a
    // different label is still the same source and is not refused. The stored
    // label stands — the first write of a version id is the record.
    await saveBuildStudioVersion(args())
    const again = await saveBuildStudioVersion(args({ label: 'typed something else' }))
    expect(again.outcome).toBe('alreadySaved')
    expect(again.version.label).toBe('One more life')
  })

  it('REFUSES different bytes under the same id rather than overwriting', async () => {
    await saveBuildStudioVersion(args())
    sets = []
    await expect(
      saveBuildStudioVersion(
        args({ files: { ...FILES, 'main.ts': 'info.setLife(9)\nsprites.create(1)\n' } }),
      ),
    ).rejects.toThrow(BUILD_STUDIO_VERSION_CONFLICT)
    // A version is the record of a moment. Nothing was written over it.
    expect(sets).toHaveLength(0)
  })
})

describe('what it will not store', () => {
  it.each([
    ['no family', { familyId: '' }],
    ['no child', { childId: '' }],
    ['a child id with a slash', { childId: 'a/b' }],
    ['a project id with a slash', { projectId: 'a/b' }],
    ['a version id with a slash', { versionId: 'a/b' }],
    ['an unparseable stamp', { createdAt: 'not a date' }],
    ['an empty file map', { files: {} }],
    ['a label nobody can store', { label: 'x'.repeat(61) }],
  ])('refuses %s, and writes nothing', async (_label, override) => {
    await expect(saveBuildStudioVersion(args(override))).rejects.toThrow(BuildStudioRefused)
    expect(sets).toHaveLength(0)
  })

  it('refuses a project with no manifest — it could never be reopened', async () => {
    await expect(
      saveBuildStudioVersion(args({ files: { 'main.ts': 'info.setLife(3)' } })),
    ).rejects.toThrow(BuildStudioRefused)
  })

  it('refuses a project with no `main.ts` — that is not a playable program', async () => {
    await expect(
      saveBuildStudioVersion(args({ files: { 'pxt.json': PXT, 'main.blocks': '<xml/>' } })),
    ).rejects.toThrow(BuildStudioRefused)
  })

  it('refuses an archive over the cap, and points at the download', async () => {
    // Three files, each under the per-file cap, together over the archive cap —
    // so this exercises the ARCHIVE limit rather than the per-file one.
    const huge = {
      'pxt.json': PXT,
      'main.ts': 'a'.repeat(250_000),
      'b.ts': 'b'.repeat(250_000),
      'c.ts': 'c'.repeat(250_000),
    }
    await expect(saveBuildStudioVersion(args({ files: huge }))).rejects.toThrow(
      /Download a copy/,
    )
  })

  it('refuses a single file over the per-file cap', async () => {
    await expect(
      saveBuildStudioVersion(
        args({ files: { 'pxt.json': PXT, 'main.ts': 'a'.repeat(300_001) } }),
      ),
    ).rejects.toThrow(BuildStudioRefused)
  })
})

describe('a blank label gets a name rather than an empty one', () => {
  it('falls back, and does not store whitespace', async () => {
    const result = await saveBuildStudioVersion(args({ label: '   ' }))
    expect(result.version.label.trim()).toBe(result.version.label)
    expect(result.version.label.length).toBeGreaterThan(0)
  })
})
