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

vi.mock('./firestore', () => ({
  db: { __db: true },
  nativeProgressObservationsCollection: (familyId: string) => collectionFor(familyId),
  nativeProgressObservationDocId: (childId: string, entryKey: string) =>
    docIdFor(childId, entryKey),
}))

interface Ref {
  __col: unknown
  __id: string
}

/** The documents the transaction can see, by id. */
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
        exists: () => stored[ref.__id] !== undefined,
        data: () => stored[ref.__id],
      }),
      set: (ref: Ref, data: Record<string, unknown>) => {
        sets.push({ ref, data })
        stored[ref.__id] = data
      },
    })
  },
}))

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
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
    stored['lincoln__original'] = { ...original }
    await saveNativeProgressObservation(
      args({ correctsObservationId: 'lincoln__original' }),
    )
    expect(sets).toHaveLength(1)
    expect(sets[0].data.correctsObservationId).toBe('lincoln__original')
    // The corrected row is untouched: one set, and it is not that document.
    expect(sets[0].ref.__id).not.toBe('lincoln__original')
    expect(stored['lincoln__original']).toEqual(original)
  })

  it('refuses a correction of a row that is gone', async () => {
    await expect(
      saveNativeProgressObservation(args({ correctsObservationId: 'lincoln__missing' })),
    ).rejects.toThrow(NATIVE_PROGRESS_CORRECTION_GONE)
    expect(sets).toHaveLength(0)
  })

  it("refuses a correction of another child's row", async () => {
    stored['london__original'] = { ...original, id: 'london__original', childId: 'london' }
    await expect(
      saveNativeProgressObservation(args({ correctsObservationId: 'london__original' })),
    ).rejects.toThrow(NATIVE_PROGRESS_CORRECTION_OTHER_CHILD)
    expect(sets).toHaveLength(0)
  })

  it('refuses a correction that moves the entry to another program', async () => {
    // Review item 7. The program decides the unit the number is read in, so a
    // cross-program "correction" would restate lesson 42 as peak 41 and leave
    // both rows reading as though both had been observed.
    stored['lincoln__original'] = {
      ...original,
      program: NativeProgressProgram.FastPhonics,
    }
    await expect(
      saveNativeProgressObservation(args({ correctsObservationId: 'lincoln__original' })),
    ).rejects.toThrow(NATIVE_PROGRESS_CORRECTION_OTHER_PROGRAM)
    expect(sets).toHaveLength(0)
  })

  it('allows a correction within the same program', async () => {
    stored['lincoln__original'] = { ...original }
    const base = args({ correctsObservationId: 'lincoln__original' })
    await saveNativeProgressObservation({
      ...base,
      observation: { ...base.observation, nativeNumber: 41 },
    })
    expect(sets).toHaveLength(1)
    expect(sets[0].data).toMatchObject({
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
