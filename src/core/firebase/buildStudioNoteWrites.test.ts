import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The reflection writer's boundary (LOCAL-BUILD-001).
 *
 * The `./firestore` mock exports exactly THREE things: `db`,
 * `artifactsCollection`, and the versions collection — the last one because the
 * repair requires reading the version a note CLAIMS to be about, in the same
 * transaction. Vitest throws on access to any other export of a mocked module,
 * so a future edit reaching for `hoursCollection`, `xpLedgerCollection`,
 * `skillSnapshotsCollection`, `learnerModelsCollection`,
 * `evaluationsCollection` or `activityConfigsCollection` would fail at that
 * line.
 *
 * The version read is a READ. Only one document is ever written here, and the
 * last block asserts it.
 */

const artifactsFor = vi.fn((familyId: string) => ({
  __col: 'artifacts',
  __family: familyId,
}))
const versionsFor = vi.fn((familyId: string) => ({
  __col: 'buildStudioVersions',
  __family: familyId,
}))

vi.mock('./firestore', () => ({
  db: { __db: true },
  artifactsCollection: (familyId: string) => artifactsFor(familyId),
  buildStudioVersionsCollection: (familyId: string) => versionsFor(familyId),
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
  BUILD_STUDIO_NOTE_CONFLICT,
  BUILD_STUDIO_NOTE_NO_VERSION,
  BuildStudioNoteRefused,
  buildStudioNoteDocId,
  saveBuildStudioNote,
  type SaveBuildStudioNoteArgs,
} from './buildStudioNoteWrites'

const CHILD = 'child-lincoln'
const PROJECT = 'apple-dash-starter'
const VERSION = 'v-abc123'
const VERSION_DOC = `${CHILD}__${PROJECT}__${VERSION}`

/** Put the version the note points at on the record. */
function seedVersion(overrides: Record<string, unknown> = {}) {
  stored[`buildStudioVersions/${VERSION_DOC}`] = {
    id: VERSION_DOC,
    childId: CHILD,
    projectId: PROJECT,
    versionId: VERSION,
    label: 'One more life',
    ...overrides,
  }
}

function args(overrides: Partial<SaveBuildStudioNoteArgs> = {}): SaveBuildStudioNoteArgs {
  return {
    familyId: 'family-1',
    childId: CHILD,
    projectId: PROJECT,
    versionId: VERSION,
    versionDocId: VERSION_DOC,
    noteActionId: 'n-tap-one',
    text: 'I gave him four lives because three was too hard.',
    capture: 'voice',
    help: 'hints-offered',
    hintsOffered: 2,
    createdAt: '2026-11-17T21:05:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  stored = {}
  sets = []
  artifactsFor.mockClear()
  versionsFor.mockClear()
  seedVersion()
})

describe('a reflection is an artifact, bound to one exact version and one tap', () => {
  it('writes one Note artifact, keyed by child, version AND action', () => {
    expect(buildStudioNoteDocId(CHILD, VERSION, 'n-tap-one')).toBe(
      `bs-note-${CHILD}__${VERSION}__n-tap-one`,
    )
  })

  it('writes to the family’s artifacts collection', async () => {
    const result = await saveBuildStudioNote(args())
    expect(sets).toHaveLength(1)
    expect(keyOf(sets[0].ref)).toBe(
      `artifacts/${buildStudioNoteDocId(CHILD, VERSION, 'n-tap-one')}`,
    )
    expect(artifactsFor).toHaveBeenCalledWith('family-1')
    expect(result.note.type).toBe(EvidenceType.Note)
    expect(result.alreadySaved).toBe(false)
  })

  it('references the version by id, not by "his latest game"', async () => {
    const result = await saveBuildStudioNote(args())
    expect(result.note.buildStudio).toMatchObject({
      projectId: PROJECT,
      versionId: VERSION,
      versionDocId: VERSION_DOC,
      noteActionId: 'n-tap-one',
    })
    expect(result.note.projectId).toBe(PROJECT)
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

/**
 * The P1 repair. The document id used to be derived from the VERSION alone, so
 * the transaction reported `alreadySaved` for any existing note on that
 * version — a second, different note was silently dropped while the UI cleared
 * the draft and said "Saved".
 *
 * POSITIVE CONTROL: drop `noteActionId` from `buildStudioNoteDocId` and the
 * second-note case fails.
 */
describe('a second note is never reported as already saved', () => {
  it('is safe to retry the SAME tap with the SAME words', async () => {
    await saveBuildStudioNote(args())
    sets = []
    const again = await saveBuildStudioNote(args())
    expect(again.alreadySaved).toBe(true)
    expect(sets).toHaveLength(0)
    expect(again.note.content).toBe('I gave him four lives because three was too hard.')
  })

  it('REFUSES the same tap arriving with different words', async () => {
    await saveBuildStudioNote(args())
    sets = []
    await expect(
      saveBuildStudioNote(args({ text: 'something else entirely' })),
    ).rejects.toThrow(BUILD_STUDIO_NOTE_CONFLICT)
    // His first words are the record and are not rewritten.
    expect(sets).toHaveLength(0)
    expect(stored[`artifacts/${buildStudioNoteDocId(CHILD, VERSION, 'n-tap-one')}`].content).toBe(
      'I gave him four lives because three was too hard.',
    )
  })

  it('stores a genuinely NEW note about the same version as its own document', async () => {
    await saveBuildStudioNote(args())
    const second = await saveBuildStudioNote(
      args({ noteActionId: 'n-tap-two', text: 'Actually five was better.' }),
    )
    expect(second.alreadySaved).toBe(false)
    expect(sets).toHaveLength(2)
    expect(keyOf(sets[1].ref)).toBe(
      `artifacts/${buildStudioNoteDocId(CHILD, VERSION, 'n-tap-two')}`,
    )
    expect(second.note.content).toBe('Actually five was better.')
  })

  it('refuses an action id that could not be a document path', async () => {
    for (const bad of ['', 'ab', 'a/b', 'a b']) {
      await expect(saveBuildStudioNote(args({ noteActionId: bad }))).rejects.toThrow(
        BuildStudioNoteRefused,
      )
    }
    expect(sets).toHaveLength(0)
  })
})

/**
 * The referenced version is verified IN the transaction. A note's whole value
 * is what it is about.
 */
describe('the version a note claims is checked, by id', () => {
  it('refuses when the version does not exist', async () => {
    stored = {}
    await expect(saveBuildStudioNote(args())).rejects.toThrow(BUILD_STUDIO_NOTE_NO_VERSION)
    expect(sets).toHaveLength(0)
  })

  it('refuses a version belonging to another child', async () => {
    seedVersion({ childId: 'child-london' })
    await expect(saveBuildStudioNote(args())).rejects.toThrow(BUILD_STUDIO_NOTE_NO_VERSION)
    expect(sets).toHaveLength(0)
  })

  it('refuses a version belonging to another project', async () => {
    seedVersion({ projectId: 'some-other-project' })
    await expect(saveBuildStudioNote(args())).rejects.toThrow(BUILD_STUDIO_NOTE_NO_VERSION)
    expect(sets).toHaveLength(0)
  })

  it('refuses when the stored version id disagrees with the claim', async () => {
    seedVersion({ versionId: 'v-different' })
    await expect(saveBuildStudioNote(args())).rejects.toThrow(BUILD_STUDIO_NOTE_NO_VERSION)
    expect(sets).toHaveLength(0)
  })

  it('reads the version from the versions collection of the same family', async () => {
    await saveBuildStudioNote(args())
    expect(versionsFor).toHaveBeenCalledWith('family-1')
  })
})

describe('provenance stays honest, and says OFFERED not heard', () => {
  it('records the rung count when help really was offered', async () => {
    const result = await saveBuildStudioNote(args({ help: 'hints-offered', hintsOffered: 3 }))
    expect(result.note.buildStudio?.help).toBe('hints-offered')
    expect(result.note.buildStudio?.hintsOffered).toBe(3)
  })

  it('stores UNKNOWN as unknown, never as "no help"', async () => {
    const result = await saveBuildStudioNote(args({ help: 'unknown', hintsOffered: 2 }))
    expect(result.note.buildStudio?.help).toBe('unknown')
    expect(result.note.buildStudio?.hintsOffered).toBeUndefined()
  })

  it('stores no rung count beside "none offered" either', async () => {
    const result = await saveBuildStudioNote(args({ help: 'none-offered', hintsOffered: 4 }))
    expect(result.note.buildStudio?.hintsOffered).toBeUndefined()
  })

  it('records how the words were captured', async () => {
    const typed = await saveBuildStudioNote(args({ capture: 'typed' }))
    expect(typed.note.buildStudio?.capture).toBe('typed')
  })

  it('refuses the retired "heard" vocabulary', async () => {
    // The app knows it asked the browser to speak, not that he listened.
    await expect(
      saveBuildStudioNote(args({ help: 'hints-heard' as never })),
    ).rejects.toThrow(BuildStudioNoteRefused)
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
