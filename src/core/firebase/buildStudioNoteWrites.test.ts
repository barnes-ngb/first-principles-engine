import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The reflection writer's boundary (LOCAL-BUILD-001).
 *
 * The `./firestore` mock exports exactly TWO things: `db` and
 * `artifactsCollection`. Vitest throws on access to any other export of a
 * mocked module, so a future edit that reached for `hoursCollection`,
 * `xpLedgerCollection`, `skillSnapshotsCollection`, `learnerModelsCollection`,
 * `evaluationsCollection`, `activityConfigsCollection` or even
 * `buildStudioVersionsCollection` would fail at that line. The last one matters
 * as much as the rails: a note and a version are two separate acts, in two
 * separate transactions, so a failed note can never take a saved version with
 * it.
 */

const artifactsFor = vi.fn((familyId: string) => ({
  __col: 'artifacts',
  __family: familyId,
}))

vi.mock('./firestore', () => ({
  db: { __db: true },
  artifactsCollection: (familyId: string) => artifactsFor(familyId),
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

import { EvidenceType } from '../types/enums'
import {
  BuildStudioNoteRefused,
  buildStudioNoteDocId,
  saveBuildStudioNote,
  type SaveBuildStudioNoteArgs,
} from './buildStudioNoteWrites'

function args(overrides: Partial<SaveBuildStudioNoteArgs> = {}): SaveBuildStudioNoteArgs {
  return {
    familyId: 'family-1',
    childId: 'child-lincoln',
    projectId: 'apple-dash-starter',
    versionId: 'v-abc123',
    versionDocId: 'child-lincoln__apple-dash-starter__v-abc123',
    text: 'I gave him four lives because three was too hard.',
    capture: 'voice',
    help: 'hints-heard',
    hintsHeard: 2,
    createdAt: '2026-11-17T21:05:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  stored = {}
  sets = []
  artifactsFor.mockClear()
})

describe('a reflection is an artifact, bound to one exact version', () => {
  it('writes one Note artifact to the family’s artifacts collection', async () => {
    const result = await saveBuildStudioNote(args())
    expect(sets).toHaveLength(1)
    expect(keyOf(sets[0].ref)).toBe(
      `artifacts/${buildStudioNoteDocId('child-lincoln', 'v-abc123')}`,
    )
    expect(artifactsFor).toHaveBeenCalledWith('family-1')
    expect(result.note.type).toBe(EvidenceType.Note)
    expect(result.alreadySaved).toBe(false)
  })

  it('references the version by id, not by "his latest game"', async () => {
    const result = await saveBuildStudioNote(args())
    expect(result.note.buildStudio).toMatchObject({
      projectId: 'apple-dash-starter',
      versionId: 'v-abc123',
      versionDocId: 'child-lincoln__apple-dash-starter__v-abc123',
    })
    // The existing optional join is set too, for readers that know it.
    expect(result.note.projectId).toBe('apple-dash-starter')
  })

  it('stores the words as he gave them, trimmed and not re-cased', async () => {
    const result = await saveBuildStudioNote(args({ text: '  I made it harder.  ' }))
    expect(result.note.content).toBe('I made it harder.')
  })

  it('carries the voice module’s own event id, when there was one', async () => {
    const result = await saveBuildStudioNote(args({ voiceEventId: 'ev-1' }))
    expect(result.note.notes).toBe('voiceEventId:ev-1')
  })
})

describe('provenance stays honest', () => {
  it('records the rung count when help really was heard', async () => {
    const result = await saveBuildStudioNote(args({ help: 'hints-heard', hintsHeard: 3 }))
    expect(result.note.buildStudio?.help).toBe('hints-heard')
    expect(result.note.buildStudio?.hintsHeard).toBe(3)
  })

  it('stores UNKNOWN as unknown, never as "no help"', async () => {
    const result = await saveBuildStudioNote(args({ help: 'unknown', hintsHeard: 2 }))
    expect(result.note.buildStudio?.help).toBe('unknown')
    // ...and no number beside it, because there is none to stand behind.
    expect(result.note.buildStudio?.hintsHeard).toBeUndefined()
  })

  it('stores no rung count beside "none heard" either', async () => {
    const result = await saveBuildStudioNote(args({ help: 'none-heard', hintsHeard: 4 }))
    expect(result.note.buildStudio?.hintsHeard).toBeUndefined()
  })

  it('records how the words were captured', async () => {
    const typed = await saveBuildStudioNote(args({ capture: 'typed' }))
    expect(typed.note.buildStudio?.capture).toBe('typed')
  })
})

describe('a retry is not a second note, and never rewrites the first', () => {
  it('returns the stored note and writes nothing', async () => {
    await saveBuildStudioNote(args())
    sets = []
    const again = await saveBuildStudioNote(args({ text: 'something else entirely' }))
    expect(again.alreadySaved).toBe(true)
    expect(sets).toHaveLength(0)
    // His words are a thing he said. The second attempt may not replace them.
    expect(again.note.content).toBe('I gave him four lives because three was too hard.')
  })
})

describe('what it will not store', () => {
  it.each([
    ['no family', { familyId: '' }],
    ['no child', { childId: '' }],
    ['a child id with a slash', { childId: 'a/b' }],
    ['no version to attach to', { versionId: '' }],
    ['no version document', { versionDocId: '' }],
    ['empty words', { text: '   ' }],
    ['words over the cap', { text: 'x'.repeat(601) }],
    ['an unknown capture', { capture: 'telepathy' as never }],
    ['an unknown help value', { help: 'some' as never }],
    ['an unparseable stamp', { createdAt: 'nope' }],
  ])('refuses %s, and writes nothing', async (_label, override) => {
    await expect(saveBuildStudioNote(args(override))).rejects.toThrow(BuildStudioNoteRefused)
    expect(sets).toHaveLength(0)
  })
})

describe('a note awards nothing', () => {
  it('writes exactly ONE document, and it is an artifact', async () => {
    await saveBuildStudioNote(args())
    expect(sets).toHaveLength(1)
    expect(keyOf(sets[0].ref).startsWith('artifacts/')).toBe(true)
  })
})
