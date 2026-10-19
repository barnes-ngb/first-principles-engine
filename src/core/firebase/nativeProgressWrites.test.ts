import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The writer boundary for FEAT-241.
 *
 * ── How the boundary is asserted ────────────────────────────────────────────
 *
 * The `./firestore` mock below exports **three** things: `db`, the native
 * observations collection, and the doc-id helper. Vitest throws on access to any
 * other export of a mocked module, so if this writer ever reaches for
 * `activityConfigsCollection`, `skillSnapshotsCollection`, `hoursCollection`,
 * `xpLedgerCollection`, `learnerModelsCollection` or any other helper, these
 * tests fail at that line rather than quietly passing. The same goes for
 * `firebase/firestore`: only `doc` and `runTransaction` exist here, so an
 * `addDoc`, `updateDoc`, `deleteDoc`, `increment` or `writeBatch` would fail too.
 *
 * That is deliberately a stronger claim than "the imports look right", and it is
 * paired with `nativeProgressWriterBoundary.source.test.ts`, which pins the same
 * boundary across the feature's other modules.
 */

/**
 * The collection stand-in carries the family it was resolved for, so an
 * assertion can say *this write went to the native collection of the family the
 * caller pinned* rather than merely *to some collection*.
 */
const collectionFor = vi.fn((familyId: string) => ({
  __col: 'nativeProgressObservations',
  __family: familyId,
}))
const docIdFor = vi.fn((childId: string, entryKey: string) => `${childId}__${entryKey}`)

const markerCollectionFor = vi.fn((familyId: string) => ({
  __col: 'nativeProgressCorrectionMarkers',
  __family: familyId,
}))

vi.mock('./firestore', () => ({
  db: { __db: true },
  nativeProgressObservationsCollection: (familyId: string) => collectionFor(familyId),
  nativeProgressObservationDocId: (childId: string, entryKey: string) =>
    docIdFor(childId, entryKey),
  // FEAT-242 — the one collection added to this boundary, and the ONLY one: a
  // correction marker, so a completion transaction can learn by id that the row
  // it is about to cite has been corrected. Still no `learnerModelsCollection`
  // here; the authorized completion revocation goes through the coordinator
  // mocked below, which is where that lane lives.
  nativeProgressCorrectionMarkersCollection: (familyId: string) =>
    markerCollectionFor(familyId),
}))

/**
 * The authorized coordinator — mocked so its own transaction stays its own.
 *
 * Typed by its own plan shape rather than inferred from the first
 * implementation, so a test can hand back `revoked` / `pending` without the
 * mock's return type having narrowed to `'none'`.
 */
interface RevokePlanStub {
  status: 'none' | 'revoked' | 'pending'
  detail?: string
  commit: (tx: unknown) => void
}
/** The coordinator's own signature, as this writer calls it: `(tx, args)`. */
type PlanRevokeFn = (...args: unknown[]) => Promise<RevokePlanStub>
const noRevoke: PlanRevokeFn = async () => ({ status: 'none', commit: () => {} })
const planRevokeMock = vi.fn(noRevoke)
/** The recovery read for a retry whose first attempt already revoked (item 5). */
type RecordedRevokeFn = (
  ...args: unknown[]
) => Promise<{ status: 'revoked' | 'pending'; detail?: string } | null>
const noRecordedRevoke: RecordedRevokeFn = async () => null
const recordedRevokeMock = vi.fn(noRecordedRevoke)
vi.mock('./programCompletionWrites', () => ({
  planCompletionRevokeForCorrection: (...args: unknown[]) =>
    planRevokeMock(...(args as [])),
  readRecordedCorrectionRevocation: (...args: unknown[]) =>
    recordedRevokeMock(...(args as [])),
}))

interface Ref {
  __col: unknown
  __id: string
}

/**
 * The key one document is stored under: its COLLECTION and its id.
 *
 * The collection is part of the key because two of this writer's documents
 * share an id by design — the marker for a corrected row is written at that
 * row's own id, in the markers collection. A store keyed by id alone made the
 * corrected observation masquerade as its own marker, so a retry read a marker
 * that was not there and skipped writing one.
 */
const keyOf = (ref: Ref): string =>
  `${(ref.__col as { __col?: string })?.__col ?? 'unknown'}/${ref.__id}`
/** The same key for a seeded observation row. */
const obsKey = (id: string): string => `nativeProgressObservations/${id}`

/** The documents the transaction can see, by collection and id. */
let stored: Record<string, Record<string, unknown>> = {}
/** Every `tx.set` this run performed. */
let sets: Array<{ ref: Ref; data: Record<string, unknown> }> = []
/** Set to make the transaction itself fail. */
let transactionThrows: Error | null = null

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => ({ __col: col, __id: id }),
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: Ref) => Promise<{ exists: () => boolean; data: () => unknown }>
      set: (ref: Ref, data: Record<string, unknown>) => void
    }) => Promise<unknown>,
  ) => {
    if (transactionThrows) throw transactionThrows
    return fn({
      get: async (ref: Ref) => ({
        exists: () => stored[keyOf(ref)] !== undefined,
        data: () => stored[keyOf(ref)],
      }),
      set: (ref: Ref, data: Record<string, unknown>) => {
        sets.push({ ref, data })
        stored[keyOf(ref)] = data
      },
    })
  },
}))

import { NOTE_MAX_LENGTH } from '../../features/progress/native-progress/nativeProgressRule'
import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
} from '../types/nativeProgress'
import {
  NATIVE_PROGRESS_CORRECTION_GONE,
  NATIVE_PROGRESS_CORRECTION_OTHER_CHILD,
  NATIVE_PROGRESS_CORRECTION_OTHER_PROGRAM,
  NativeProgressRefused,
  saveNativeProgressObservation,
  type SaveNativeProgressArgs,
} from './nativeProgressWrites'

const ENTRY_KEY = 'draft-key-0001'
/** Today, pinned — the writer refuses a future observation, so the clock cannot be real. */
const TODAY = '2026-10-16'

function args(overrides: Partial<SaveNativeProgressArgs> = {}): SaveNativeProgressArgs {
  return {
    familyId: 'fam-1',
    childId: 'lincoln',
    entryKey: ENTRY_KEY,
    today: TODAY,
    recordedAt: '2026-10-16T14:00:00.000Z',
    observation: {
      program: NativeProgressProgram.Mathseeds,
      nativeNumber: 42,
      meaning: NativeProgressMeaning.WorkingOn,
      observedOn: '2026-10-12',
      source: NativeProgressSource.ParentReport,
    },
    ...overrides,
  }
}

beforeEach(() => {
  stored = {}
  sets = []
  transactionThrows = null
  collectionFor.mockClear()
  docIdFor.mockClear()
  markerCollectionFor.mockClear()
  planRevokeMock.mockClear()
  planRevokeMock.mockImplementation(noRevoke)
  recordedRevokeMock.mockClear()
  recordedRevokeMock.mockImplementation(noRecordedRevoke)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** The writes that landed in the observations collection — the row itself. */
const rowSets = () =>
  sets.filter(
    (s) => (s.ref.__col as { __col?: string })?.__col === 'nativeProgressObservations',
  )
/** ...and the ones that landed in the correction-marker collection. */
const markerSets = () =>
  sets.filter(
    (s) =>
      (s.ref.__col as { __col?: string })?.__col === 'nativeProgressCorrectionMarkers',
  )

// ── FEAT-242: the correction marker, and the one authorized integration ────
describe('a correction also writes its marker', () => {
  const ORIGINAL = 'lincoln__original'

  /**
   * The corrected row is a Fast Phonics peak — the row a completion can cite —
   * so the correction is one too: a correction may not move an entry to another
   * program, and a cross-program fixture would be refused before it ever
   * reached the marker.
   */
  const correction = (overrides: Partial<SaveNativeProgressArgs> = {}) => {
    const base = args(overrides)
    return {
      ...base,
      observation: {
        ...base.observation,
        program: NativeProgressProgram.FastPhonics,
        nativeNumber: 12,
        meaning: NativeProgressMeaning.CompletedThrough,
      },
    }
  }

  beforeEach(() => {
    stored[obsKey(ORIGINAL)] = {
      id: ORIGINAL,
      childId: 'lincoln',
      program: 'fastPhonics',
      nativeNumber: 20,
      meaning: 'completedThrough',
      observedOn: '2026-09-30',
      source: 'programReport',
      recordedAt: '2026-10-01T00:00:00.000Z',
      entryKey: 'original-entry-key',
    }
  })

  it('writes the marker for the corrected row, with no completion anywhere', async () => {
    await saveNativeProgressObservation(correction({ correctsObservationId: ORIGINAL }))
    const marker = markerSets()[0]
    expect(marker).toBeDefined()
    expect(marker!.ref.__id).toBe(ORIGINAL)
    expect(marker!.data.childId).toBe('lincoln')
    expect(marker!.data.correctionEntryKey).toBe(ENTRY_KEY)
    // The coordinator was consulted and had nothing to do; the marker is not
    // conditional on it.
    expect(planRevokeMock).toHaveBeenCalledTimes(1)
  })

  it('writes NO marker for an ordinary (non-correction) entry', async () => {
    await saveNativeProgressObservation(args())
    expect(markerSets()).toHaveLength(0)
    expect(planRevokeMock).not.toHaveBeenCalled()
  })

  it('a retry of a landed correction still ensures the marker exists', async () => {
    // The row is already on the record (first attempt landed, answer lost) and
    // the marker is missing — the exact gap a silent early return would leave.
    const docId = `lincoln__${ENTRY_KEY}`
    stored[obsKey(docId)] = {
      id: docId,
      childId: 'lincoln',
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: '2026-10-02T00:00:00.000Z',
      entryKey: ENTRY_KEY,
      correctsObservationId: ORIGINAL,
    }
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(result.alreadyRecorded).toBe(true)
    const marker = markerSets()[0]
    expect(marker).toBeDefined()
    expect(marker!.ref.__id).toBe(ORIGINAL)
    expect(marker!.data.correctionObservationId).toBe(docId)
    // The stored row is still the record: the retry added no second row.
    expect(rowSets()).toHaveLength(0)
  })

  it('commits the coordinator\'s revocation in the SAME transaction, after the row', async () => {
    const commit = vi.fn()
    planRevokeMock.mockImplementation(async () => ({ status: 'revoked' as const, commit }))
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(commit).toHaveBeenCalledTimes(1)
    expect(result.completionRevoked).toEqual({ status: 'revoked' })
  })

  it('a retry of a landed correction asks the coordinator again and reports its answer', async () => {
    // The first attempt's ANSWER was lost, so what it did to a completion
    // citing the row is unknown. A retry that stayed silent would let the
    // receipt claim nothing else changed while a record had been withdrawn.
    const docId = `lincoln__${ENTRY_KEY}`
    stored[obsKey(docId)] = {
      id: docId,
      childId: 'lincoln',
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: '2026-10-02T00:00:00.000Z',
      entryKey: ENTRY_KEY,
      correctsObservationId: ORIGINAL,
    }
    const commit = vi.fn()
    planRevokeMock.mockImplementation(async () => ({ status: 'revoked' as const, commit }))
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(result.alreadyRecorded).toBe(true)
    expect(result.completionRevoked).toEqual({ status: 'revoked' })
    expect(commit).toHaveBeenCalledTimes(1)
    // The program it was asked about is the STORED row's, not the payload's.
    expect(planRevokeMock.mock.calls[0][1]).toMatchObject({
      program: 'fastPhonics',
      correctedObservationId: ORIGINAL,
    })
    // ...and the row is still untouched.
    expect(rowSets()).toHaveLength(0)
  })

  it('recovers the revocation its OWN first attempt performed when the answer was lost', async () => {
    // Review item 5. The first attempt committed and withdrew the linked
    // coverage; its answer never came home. On the retry the completion is
    // already gone, so the coordinator has nothing to plan — and a silent
    // `none` would let the receipt say nothing else changed.
    const docId = `lincoln__${ENTRY_KEY}`
    stored[obsKey(docId)] = {
      id: docId,
      childId: 'lincoln',
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: '2026-10-02T00:00:00.000Z',
      entryKey: ENTRY_KEY,
      correctsObservationId: ORIGINAL,
    }
    recordedRevokeMock.mockImplementation(async () => ({
      status: 'revoked' as const,
      detail: 'Withdrawn because the entry it rested on was corrected.',
    }))
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(result.alreadyRecorded).toBe(true)
    expect(result.completionRevoked?.status).toBe('revoked')
    // Asked about THIS correction's own recorded act — its row id and its
    // stored draft key — never about whatever is active now.
    expect(recordedRevokeMock.mock.calls[0][1]).toMatchObject({
      correctionObservationId: docId,
      correctionEntryKey: ENTRY_KEY,
      program: 'fastPhonics',
    })
    // Nothing was re-written: the row and the history stay as they are.
    expect(rowSets()).toHaveLength(0)
  })

  it('does not ask for a recorded revocation when the retry itself revoked one', async () => {
    const docId = `lincoln__${ENTRY_KEY}`
    stored[obsKey(docId)] = {
      id: docId,
      childId: 'lincoln',
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: '2026-10-02T00:00:00.000Z',
      entryKey: ENTRY_KEY,
      correctsObservationId: ORIGINAL,
    }
    planRevokeMock.mockImplementation(async () => ({
      status: 'pending' as const,
      commit: () => {},
    }))
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(result.completionRevoked?.status).toBe('pending')
    expect(recordedRevokeMock).not.toHaveBeenCalled()
  })

  it('claims nothing when this correction never revoked anything', async () => {
    // A newer, unrelated confirmation may be active; the retry must not speak
    // for it. `null` from the recovery read means exactly that.
    const docId = `lincoln__${ENTRY_KEY}`
    stored[obsKey(docId)] = {
      id: docId,
      childId: 'lincoln',
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: '2026-10-02T00:00:00.000Z',
      entryKey: ENTRY_KEY,
      correctsObservationId: ORIGINAL,
    }
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(result.alreadyRecorded).toBe(true)
    expect(result.completionRevoked).toBeUndefined()
  })

  it('reports a PENDING revocation as pending, not as revoked', async () => {
    // There was no learner model to retract the coverage from. The receipt has
    // to carry that difference: the surface offers the apply retry rather than
    // claiming the learning picture was updated.
    planRevokeMock.mockImplementation(async () => ({
      status: 'pending' as const,
      detail: 'Withdrawn here. The learning picture could not be updated.',
      commit: () => {},
    }))
    const result = await saveNativeProgressObservation(
      correction({ correctsObservationId: ORIGINAL }),
    )
    expect(result.completionRevoked?.status).toBe('pending')
    expect(result.completionRevoked?.detail).toMatch(/could not be updated/)
  })
})

describe('what it writes, and where', () => {
  it('writes ONE document, into the native observations collection only', async () => {
    const result = await saveNativeProgressObservation(args())

    expect(sets).toHaveLength(1)
    expect(sets[0].ref.__col).toEqual({
      __col: 'nativeProgressObservations',
      __family: 'fam-1',
    })
    expect(collectionFor).toHaveBeenCalledWith('fam-1')
    expect(result.alreadyRecorded).toBe(false)
  })

  it('builds the id from the child and the draft key', async () => {
    await saveNativeProgressObservation(args())
    expect(docIdFor).toHaveBeenCalledWith('lincoln', ENTRY_KEY)
    expect(sets[0].ref.__id).toBe(`lincoln__${ENTRY_KEY}`)
  })

  it('stores the number verbatim, with the meaning beside it', async () => {
    await saveNativeProgressObservation(
      args({
        observation: {
          program: NativeProgressProgram.FastPhonics,
          nativeNumber: 7,
          meaning: NativeProgressMeaning.CompletedThrough,
          observedOn: '2026-10-12',
          source: NativeProgressSource.Certificate,
        },
      }),
    )
    expect(sets[0].data).toMatchObject({
      program: 'fastPhonics',
      nativeNumber: 7,
      meaning: 'completedThrough',
      source: 'certificate',
    })
  })

  it('keeps the day observed separate from the time of entry', async () => {
    await saveNativeProgressObservation(args())
    expect(sets[0].data.observedOn).toBe('2026-10-12')
    expect(sets[0].data.recordedAt).toBe('2026-10-16T14:00:00.000Z')
  })

  it('writes no field that belongs to a planning rail', async () => {
    await saveNativeProgressObservation(args())
    for (const forbidden of [
      'currentPosition',
      'totalUnits',
      'unitLabel',
      'completed',
      'lastMilestone',
      'masteredSkills',
      'workingLevels',
      'minutes',
      'hours',
      'xp',
      'skillTags',
      'projectedThrough',
    ]) {
      expect(sets[0].data).not.toHaveProperty(forbidden)
    }
    // The whole stored shape, named rather than counted.
    expect(Object.keys(sets[0].data).sort()).toEqual([
      'childId',
      'correctsObservationId',
      'entryKey',
      'id',
      'meaning',
      'nativeNumber',
      'note',
      'observedOn',
      'program',
      'recordedAt',
      'source',
    ])
  })

  it('leaves an absent note and link undefined for the converter to strip', async () => {
    await saveNativeProgressObservation(args())
    expect(sets[0].data.note).toBeUndefined()
    expect(sets[0].data.correctsObservationId).toBeUndefined()
  })
})

describe('idempotency', () => {
  it('a retry of the same confirmed entry writes nothing more', async () => {
    const first = await saveNativeProgressObservation(args())
    const second = await saveNativeProgressObservation(args())

    expect(sets).toHaveLength(1)
    expect(second.alreadyRecorded).toBe(true)
    expect(second.observation.id).toBe(first.observation.id)
  })

  it('does not overwrite the stored row when a retry carries different content', async () => {
    await saveNativeProgressObservation(args())
    const retry = await saveNativeProgressObservation(
      args({
        observation: {
          program: NativeProgressProgram.Mathseeds,
          nativeNumber: 99,
          meaning: NativeProgressMeaning.WorkingOn,
          observedOn: '2026-10-12',
          source: NativeProgressSource.ParentReport,
        },
      }),
    )
    // The first write of an entry key IS the record — the receipt reports what is
    // stored, not what was just sent.
    expect(sets).toHaveLength(1)
    expect(retry.alreadyRecorded).toBe(true)
    expect(retry.observation.nativeNumber).toBe(42)
  })

  it('a different draft key is a different row', async () => {
    await saveNativeProgressObservation(args())
    await saveNativeProgressObservation(args({ entryKey: 'draft-key-0002' }))
    expect(sets).toHaveLength(2)
  })
})

describe('child isolation', () => {
  it('stamps the child it was given, not an ambient one', async () => {
    await saveNativeProgressObservation(args({ childId: 'london' }))
    expect(sets[0].data.childId).toBe('london')
    expect(sets[0].ref.__id).toBe(`london__${ENTRY_KEY}`)
  })

  it('the same draft key under two children is two separate rows', async () => {
    await saveNativeProgressObservation(args({ childId: 'lincoln' }))
    await saveNativeProgressObservation(args({ childId: 'london' }))
    expect(sets.map((s) => s.ref.__id)).toEqual([
      `lincoln__${ENTRY_KEY}`,
      `london__${ENTRY_KEY}`,
    ])
  })
})

describe('refusals — nothing is written', () => {
  const cases: Array<[string, Partial<SaveNativeProgressArgs>]> = [
    ['no family', { familyId: '' }],
    ['no child', { childId: '' }],
    ['a child id that would change the path', { childId: 'a/b' }],
    ['an unusable draft key', { entryKey: 'short' }],
    ['a draft key with a slash', { entryKey: 'aaaa/bbbb' }],
  ]
  for (const [name, overrides] of cases) {
    it(`refuses ${name}`, async () => {
      await expect(saveNativeProgressObservation(args(overrides))).rejects.toThrow(
        NativeProgressRefused,
      )
      expect(sets).toHaveLength(0)
    })
  }

  const badObservations: Array<[string, Record<string, unknown>]> = [
    ['a fractional number', { nativeNumber: 4.5 }],
    ['zero', { nativeNumber: 0 }],
    ['a negative number', { nativeNumber: -3 }],
    // The ONLY upper bound: a number that cannot be stored exactly. There is no
    // invented program ceiling — see the "stores a big number" case below.
    ['a number past exact integer storage', { nativeNumber: Number.MAX_SAFE_INTEGER + 2 }],
    ['infinity', { nativeNumber: Number.POSITIVE_INFINITY }],
    ['not a number at all', { nativeNumber: Number.NaN }],
    ['a date that is not a day', { observedOn: '2026-02-30' }],
    ['a date of the wrong shape', { observedOn: '12/10/2026' }],
    ['a day that has not happened', { observedOn: '2026-10-17' }],
    ['an unknown program', { program: 'readingEggs' }],
    ['an unknown meaning', { meaning: 'nearly' }],
    ['an unknown source', { source: 'a friend' }],
  ]
  for (const [name, patch] of badObservations) {
    it(`refuses ${name}`, async () => {
      const base = args()
      await expect(
        saveNativeProgressObservation({
          ...base,
          // Deliberately bad input from the writer's point of view: these are the
          // values a caller must not be trusted with.
          observation: { ...base.observation, ...patch } as unknown as typeof base.observation,
        }),
      ).rejects.toThrow(NativeProgressRefused)
      expect(sets).toHaveLength(0)
    })
  }

  it('stores a number far above any plausible lesson — there is no invented ceiling', async () => {
    const base = args()
    await saveNativeProgressObservation({
      ...base,
      observation: { ...base.observation, nativeNumber: 250_000 },
    })
    expect(sets).toHaveLength(1)
    expect(sets[0].data.nativeNumber).toBe(250_000)
  })

  it('accepts today and any past day', async () => {
    const base = args()
    for (const observedOn of [TODAY, '2026-01-01', '2019-06-30']) {
      sets = []
      stored = {}
      await saveNativeProgressObservation({
        ...base,
        entryKey: `key-${observedOn}`,
        observation: { ...base.observation, observedOn },
      })
      expect(sets[0].data.observedOn).toBe(observedOn)
    }
  })

  it('refuses an entry time it cannot read', async () => {
    await expect(
      saveNativeProgressObservation(args({ recordedAt: 'half past tuesday' })),
    ).rejects.toThrow(NativeProgressRefused)
    expect(sets).toHaveLength(0)
  })

  it('refuses a today it cannot read rather than storing against no bound', async () => {
    await expect(saveNativeProgressObservation(args({ today: 'not-a-day' }))).rejects.toThrow(
      NativeProgressRefused,
    )
    expect(sets).toHaveLength(0)
  })

  it('surfaces a failed write as a failure, having written nothing', async () => {
    transactionThrows = new Error('offline')
    await expect(saveNativeProgressObservation(args())).rejects.toThrow('offline')
    expect(sets).toHaveLength(0)
  })
})

describe('the note length the form checks is the one the writer stores by', () => {
  /** A note with `n` characters in it. */
  const noteOf = (n: number) => 'n'.repeat(n)

  const withNote = (note: string | undefined) => {
    const base = args()
    return { ...base, observation: { ...base.observation, note } }
  }

  it('refuses a note one character over the limit, before the transaction', async () => {
    await expect(
      saveNativeProgressObservation(withNote(noteOf(NOTE_MAX_LENGTH + 1))),
    ).rejects.toThrow(NativeProgressRefused)
    expect(sets).toHaveLength(0)
    // Refused before anything was addressed, not inside the transaction: neither
    // the collection nor the document id was resolved.
    expect(collectionFor).not.toHaveBeenCalled()
    expect(docIdFor).not.toHaveBeenCalled()
  })

  it('stores a note of exactly the limit, trimmed rather than truncated', async () => {
    const note = noteOf(NOTE_MAX_LENGTH)
    // Outer whitespace is trimmed first, so a note that is exactly the limit once
    // trimmed is stored whole — the same reading the form's rule makes.
    await saveNativeProgressObservation(withNote(`  ${note}\n`))
    expect(sets).toHaveLength(1)
    expect(sets[0].data.note).toBe(note)
  })

  it('leaves an empty or whitespace-only note undefined, as before', async () => {
    const base = args()
    for (const [name, note] of [
      ['empty', ''],
      ['whitespace', '   '],
      ['absent', undefined],
    ] as Array<[string, string | undefined]>) {
      sets = []
      stored = {}
      await saveNativeProgressObservation({
        ...base,
        entryKey: `key-note-${name}`,
        observation: { ...base.observation, note },
      })
      expect(sets[0].data.note).toBeUndefined()
    }
  })
})

describe('corrections', () => {
  const original = {
    id: 'lincoln__original',
    childId: 'lincoln',
    program: NativeProgressProgram.Mathseeds,
    nativeNumber: 42,
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn: '2026-10-12',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-12T10:00:00.000Z',
    entryKey: 'original',
  }

  it('links a correction to the original and leaves the original alone', async () => {
    stored[obsKey('lincoln__original')] = { ...original }
    await saveNativeProgressObservation(
      args({ correctsObservationId: 'lincoln__original' }),
    )
    // ONE row, plus the correction marker beside it (FEAT-242) — and nothing
    // else. The marker is a new document in its own collection, never an edit.
    expect(rowSets()).toHaveLength(1)
    expect(markerSets()).toHaveLength(1)
    expect(sets).toHaveLength(2)
    expect(rowSets()[0].data.correctsObservationId).toBe('lincoln__original')
    // The corrected row itself is untouched: no write addressed that document in
    // the observations collection, and what is stored there is byte-identical.
    expect(rowSets()[0].ref.__id).not.toBe('lincoln__original')
    expect(stored[obsKey('lincoln__original')]).toEqual(original)
  })

  it('refuses a correction of a row that is gone', async () => {
    await expect(
      saveNativeProgressObservation(args({ correctsObservationId: 'lincoln__missing' })),
    ).rejects.toThrow(NATIVE_PROGRESS_CORRECTION_GONE)
    expect(sets).toHaveLength(0)
  })

  it("refuses a correction of another child's row", async () => {
    stored[obsKey('london__original')] = {
      ...original,
      id: 'london__original',
      childId: 'london',
    }
    await expect(
      saveNativeProgressObservation(args({ correctsObservationId: 'london__original' })),
    ).rejects.toThrow(NATIVE_PROGRESS_CORRECTION_OTHER_CHILD)
    expect(sets).toHaveLength(0)
  })

  it('refuses a correction that moves the entry to another program', async () => {
    // Review item 7. The program decides the unit the number is read in, so a
    // cross-program "correction" would restate lesson 42 as peak 41 and leave
    // both rows reading as though both had been observed.
    stored[obsKey('lincoln__original')] = {
      ...original,
      program: NativeProgressProgram.FastPhonics,
    }
    await expect(
      saveNativeProgressObservation(args({ correctsObservationId: 'lincoln__original' })),
    ).rejects.toThrow(NATIVE_PROGRESS_CORRECTION_OTHER_PROGRAM)
    expect(sets).toHaveLength(0)
  })

  it('allows a correction within the same program', async () => {
    stored[obsKey('lincoln__original')] = { ...original }
    const base = args({ correctsObservationId: 'lincoln__original' })
    await saveNativeProgressObservation({
      ...base,
      observation: { ...base.observation, nativeNumber: 41 },
    })
    expect(rowSets()).toHaveLength(1)
    expect(rowSets()[0].data).toMatchObject({
      program: NativeProgressProgram.Mathseeds,
      nativeNumber: 41,
      correctsObservationId: 'lincoln__original',
    })
  })

  it('refuses an entry that corrects itself', async () => {
    await expect(
      saveNativeProgressObservation(
        args({ correctsObservationId: `lincoln__${ENTRY_KEY}` }),
      ),
    ).rejects.toThrow(NativeProgressRefused)
    expect(sets).toHaveLength(0)
  })
})
