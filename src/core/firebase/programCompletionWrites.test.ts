import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A fake Firestore with REAL transaction semantics, built for the two things a
 * single-pass mock cannot show:
 *
 *   1. **Contention.** `store.bumpOnNextRead` lets a test commit a conflicting
 *      write between the callback's first read and its commit, exactly as
 *      another device would. The callback is then re-run against the newer
 *      document — which is the whole claim these writers make.
 *   2. **Read-before-write.** The transaction refuses a `get` after a `set`, so
 *      a writer that ordered its reads wrongly fails here instead of in
 *      production.
 */
class FakeStore {
  docs = new Map<string, Record<string, unknown>>()
  /**
   * A conflicting write, committed by "another device" AFTER the given number of
   * reads in a transaction attempt — then cleared, so the retry sees a settled
   * world. Positioning it after a specific read is what lets a test make the
   * callback read a document and THEN have it change, which is the only way to
   * prove the retry rather than assume it.
   */
  interleave: { afterReads: number; run: () => void } | null = null
  attempts = 0
  writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []

  set(path: string, data: Record<string, unknown>) {
    this.docs.set(path, data)
  }
  get(path: string): Record<string, unknown> | undefined {
    return this.docs.get(path)
  }
}

const store = new FakeStore()

vi.mock('firebase/firestore', () => ({
  doc: (col: { __path: string }, id: string) => ({ path: `${col.__path}/${id}` }),
  getDoc: async (ref: { path: string }) => snapOf(ref.path),
  getDocs: async (q: { __docs: Array<Record<string, unknown>> }) => ({
    empty: q.__docs.length === 0,
    docs: q.__docs.map((d) => ({ id: String(d.id ?? ''), data: () => d })),
  }),
  query: (col: { __path: string }, ...clauses: Array<(d: Record<string, unknown>) => boolean>) => ({
    __docs: [...store.docs.entries()]
      .filter(([path]) => path.startsWith(`${col.__path}/`))
      .map(([, d]) => d)
      .filter((d) => clauses.every((c) => c(d))),
  }),
  where: (field: string, _op: string, value: unknown) => (d: Record<string, unknown>) =>
    d[field] === value,
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: { path: string }) => Promise<ReturnType<typeof snapOf>>
      set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => void
    }) => unknown,
  ) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      store.attempts += 1
      const staged: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []
      let wrote = false
      let reads = 0
      const readVersions = new Map<string, string>()
      const out = await fn({
        get: async (ref) => {
          if (wrote) throw new Error('transaction read after write')
          reads += 1
          readVersions.set(ref.path, JSON.stringify(store.get(ref.path) ?? null))
          const snap = snapOf(ref.path)
          if (store.interleave && reads >= store.interleave.afterReads) {
            const { run } = store.interleave
            store.interleave = null
            run()
          }
          return snap
        },
        set: (ref, data, opts) => {
          wrote = true
          staged.push({ path: ref.path, data, merge: Boolean(opts?.merge) })
        },
      })
      // Commit only if nothing read has changed since it was read.
      const stale = [...readVersions.entries()].some(
        ([path, seen]) => JSON.stringify(store.get(path) ?? null) !== seen,
      )
      if (stale) continue // re-run the callback against the newer document
      for (const w of staged) {
        const prev = w.merge ? (store.get(w.path) ?? {}) : {}
        store.set(w.path, { ...prev, ...w.data })
        store.writes.push(w)
      }
      return out
    }
    throw new Error('transaction failed after retries')
  },
}))

function snapOf(path: string) {
  const data = store.get(path)
  return {
    exists: () => data !== undefined,
    data: () => data,
    id: path.split('/').pop() ?? '',
  }
}

vi.mock('./firestore', () => ({
  db: {},
  learnerModelsCollection: () => ({ __path: 'learnerModels' }),
  nativeProgressObservationsCollection: () => ({ __path: 'nativeProgress' }),
  nativeProgressCorrectionMarkersCollection: () => ({ __path: 'markers' }),
  programCompletionEventsCollection: () => ({ __path: 'events' }),
  programCompletionStateCollection: () => ({ __path: 'state' }),
}))

import {
  PROGRAM_COMPLETION_ALREADY_ACTIVE,
  PROGRAM_COMPLETION_CITATION_CHANGED,
  PROGRAM_COMPLETION_REPORT_CORRECTED,
  PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE,
  ProgramCompletionRefused,
  applyProgramCompletionProjection,
  confirmProgramCompletion,
  withdrawProgramCompletion,
} from './programCompletionWrites'
import { FAST_PHONICS_COMPLETION_CONCEPT_IDS } from '../foundations/fastPhonicsCompletion'

const FAMILY = 'f1'
const CHILD = 'c1'
const CVC = 'reading.phonics.cvc'
const KEY = 'draft-key-0001'
const NOW = '2026-10-17T12:00:00.000Z'

function seedModel(extra: Record<string, unknown> = {}) {
  store.set(`learnerModels/${CHILD}`, {
    childId: CHILD,
    status: 'seeded',
    conceptStates: {},
    changeFeed: [],
    openQuestions: [],
    modalityCalibration: {},
    seededAt: NOW,
    updatedAt: NOW,
    ...extra,
  })
}

function seedReport(id = `${CHILD}__r1`, over: Record<string, unknown> = {}) {
  store.set(`nativeProgress/${id}`, {
    id,
    childId: CHILD,
    program: 'fastPhonics',
    nativeNumber: 20,
    meaning: 'completedThrough',
    observedOn: '2026-09-30',
    source: 'programReport',
    recordedAt: NOW,
    entryKey: 'r1-entry-key',
    ...over,
  })
  return id
}

const confirm = (over: Record<string, unknown> = {}, entryKey = KEY) =>
  confirmProgramCompletion({
    familyId: FAMILY,
    childId: CHILD,
    program: 'fastPhonics',
    entryKey,
    completion: {
      observedOn: '2026-10-01',
      source: 'programReport',
      ...over,
    },
    recordedAt: NOW,
    today: '2026-10-17',
  } as Parameters<typeof confirmProgramCompletion>[0])

beforeEach(() => {
  store.docs.clear()
  store.writes = []
  store.attempts = 0
  store.interleave = null
})

describe('confirmProgramCompletion', () => {
  it('records the act, the projection and the coverage in one transaction', async () => {
    seedModel()
    const result = await confirm()
    expect(result.applied).toBe(true)
    expect(result.applicationPending).toBe(false)
    expect(result.conceptIds.sort()).toEqual([...FAST_PHONICS_COMPLETION_CONCEPT_IDS].sort())

    const event = store.get(`events/${CHILD}__fastPhonics__${KEY}`)
    expect(event?.kind).toBe('confirm')
    const state = store.get(`state/${CHILD}__fastPhonics`)
    expect(state?.activeEntryKey).toBe(KEY)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string; evidence: Array<{ observedAt: string }> }>
    }
    expect(model.conceptStates[CVC].state).toBe('forming')
    // The OBSERVED day, not the save clock.
    expect(model.conceptStates[CVC].evidence[0].observedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('needs no numeric report at all', async () => {
    seedModel()
    const result = await confirm()
    const state = store.get(`state/${CHILD}__fastPhonics`) as {
      activeAssertion: { reportObservationId?: string; assistance: string; reportedProgramVersion: string }
    }
    expect(result.applied).toBe(true)
    expect(state.activeAssertion.reportObservationId).toBeUndefined()
    expect(state.activeAssertion.assistance).toBe('unknown')
    expect(state.activeAssertion.reportedProgramVersion).toBe('unknown')
  })

  it('refuses an invalid source or assistance before any write', async () => {
    seedModel()
    await expect(confirm({ source: 'telepathy' })).rejects.toBeInstanceOf(
      ProgramCompletionRefused,
    )
    await expect(confirm({ assistance: 'maybe' })).rejects.toBeInstanceOf(
      ProgramCompletionRefused,
    )
    expect(store.writes).toHaveLength(0)
  })

  it('accepts a final-peak completedThrough citation and refuses anything else', async () => {
    seedModel()
    const good = seedReport()
    const result = await confirm({ reportObservationId: good })
    expect(result.applied).toBe(true)

    // A SECOND confirmation is a new act: its own draft key, and the first one
    // withdrawn from the record (a new key while one is active is refused for
    // its own reason, which is not the one under test here).
    store.docs.delete(`state/${CHILD}__fastPhonics`)
    const workingOn = seedReport(`${CHILD}__r2`, { meaning: 'workingOn' })
    await expect(
      confirm({ reportObservationId: workingOn }, 'draft-key-0002'),
    ).rejects.toThrow(PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE)
    const tooBig = seedReport(`${CHILD}__r3`, { nativeNumber: 24 })
    await expect(
      confirm({ reportObservationId: tooBig }, 'draft-key-0003'),
    ).rejects.toThrow(PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE)
  })

  it('refuses a RETRY whose citation disagrees with the stored confirmation', async () => {
    // The same key re-sent with a different citation is not a retry of what was
    // confirmed. Re-confirming against another entry is a new act.
    const cited = seedReport()
    await confirm({ reportObservationId: cited })
    const other = seedReport(`${CHILD}__r4`)
    await expect(confirm({ reportObservationId: other })).rejects.toThrow(
      PROGRAM_COMPLETION_CITATION_CHANGED,
    )
  })

  it('a same-key retry checks the STORED citation, even when the caller omits one', async () => {
    // The independent review's countertest. A pending confirmation cites a row;
    // a correction written before markers existed supersedes that row; the retry
    // arrives with no citation at all. The record is what was CONFIRMED, so the
    // stored citation is what gets checked — and the legacy correction needs the
    // query, which has to run against it.
    const cited = seedReport()
    const first = await confirm({ reportObservationId: cited })
    expect(first.applicationPending).toBe(true)
    store.set(`nativeProgress/${CHILD}__legacy`, {
      id: `${CHILD}__legacy`,
      childId: CHILD,
      program: 'fastPhonics',
      nativeNumber: 19,
      meaning: 'workingOn',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: NOW,
      entryKey: 'legacy-entry-key',
      correctsObservationId: cited,
    })
    seedModel()
    await expect(confirm()).rejects.toThrow(PROGRAM_COMPLETION_REPORT_CORRECTED)
    // Nothing was applied: the model carries no coverage from the pending act.
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, unknown>
    }
    expect(model.conceptStates[CVC]).toBeUndefined()
  })

  it('refuses a citation whose row was ALREADY corrected — legacy row, no marker', async () => {
    seedModel()
    const cited = seedReport()
    // A correction written before markers existed: only the descendant row.
    store.set(`nativeProgress/${CHILD}__r9`, {
      id: `${CHILD}__r9`,
      childId: CHILD,
      program: 'fastPhonics',
      nativeNumber: 12,
      meaning: 'completedThrough',
      observedOn: '2026-10-02',
      source: 'parentReport',
      recordedAt: NOW,
      entryKey: 'r9-entry-key',
      correctsObservationId: cited,
    })
    await expect(confirm({ reportObservationId: cited })).rejects.toThrow(
      PROGRAM_COMPLETION_REPORT_CORRECTED,
    )
    expect(store.writes).toHaveLength(0)
  })

  it('refuses a citation corrected CONCURRENTLY — the marker lands mid-transaction', async () => {
    seedModel()
    const cited = seedReport()
    // After the first read, and before the marker is read.
    store.interleave = {
      afterReads: 1,
      run: () => {
        store.set(`markers/${cited}`, {
          id: cited,
          childId: CHILD,
          correctionObservationId: `${CHILD}__r9`,
          correctionEntryKey: 'r9-entry-key',
          correctedAt: NOW,
        })
      },
    }
    await expect(confirm({ reportObservationId: cited })).rejects.toThrow(
      PROGRAM_COMPLETION_REPORT_CORRECTED,
    )
    expect(store.get(`state/${CHILD}__fastPhonics`)).toBeUndefined()
  })

  it('refuses a correction marker even when the replacement still says peak 20', async () => {
    seedModel()
    const cited = seedReport()
    store.set(`markers/${cited}`, {
      id: cited,
      childId: CHILD,
      correctionObservationId: `${CHILD}__r8`,
      correctionEntryKey: 'r8-entry-key',
      correctedAt: NOW,
    })
    seedReport(`${CHILD}__r8`, { correctsObservationId: cited })
    await expect(confirm({ reportObservationId: cited })).rejects.toThrow(
      PROGRAM_COMPLETION_REPORT_CORRECTED,
    )
  })

  it('is idempotent on the same entry key, and refuses a NEW key while one is active', async () => {
    seedModel()
    await confirm()
    const again = await confirm()
    expect(again.alreadyRecorded).toBe(true)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { evidence: unknown[] }>
    }
    expect(model.conceptStates[CVC].evidence).toHaveLength(1)

    await expect(
      confirmProgramCompletion({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        entryKey: 'draft-key-0002',
        completion: { observedOn: '2026-10-02', source: 'parentReport' },
        recordedAt: NOW,
        today: '2026-10-17',
      }),
    ).rejects.toThrow(PROGRAM_COMPLETION_ALREADY_ACTIVE)
  })

  it('records the act and reports application PENDING when there is no model', async () => {
    const result = await confirm()
    expect(result.applied).toBe(false)
    expect(result.applicationPending).toBe(true)
    expect(store.get(`events/${CHILD}__fastPhonics__${KEY}`)).toBeDefined()
    expect(store.get(`learnerModels/${CHILD}`)).toBeUndefined()
    const state = store.get(`state/${CHILD}__fastPhonics`) as { projection: { status: string } }
    expect(state.projection.status).toBe('pending')

    // ...and the retry finishes it once a model exists.
    seedModel()
    const retry = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      expectedEntryKey: KEY,
      recordedAt: NOW,
    })
    expect(retry.applied).toBe(true)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string }>
    }
    expect(model.conceptStates[CVC].state).toBe('forming')
  })

  it('re-runs against a model written mid-transaction and keeps the newer evidence', async () => {
    seedModel()
    // After the model has been READ — so the callback has the old copy in hand
    // when the eval lands, which is the lost-update window this closes.
    store.interleave = {
      afterReads: 3,
      run: () => {
        store.set(`learnerModels/${CHILD}`, {
          childId: CHILD,
          status: 'seeded',
          conceptStates: {
            [CVC]: {
              state: 'frontier',
              evidence: [
                {
                  kind: 'eval',
                  sourceId: 'sess-9',
                  note: 'guided eval',
                  observedAt: '2026-10-16T00:00:00.000Z',
                  readState: 'frontier',
                },
              ],
            },
          },
          changeFeed: [],
          openQuestions: [],
          modalityCalibration: {},
          seededAt: NOW,
          updatedAt: '2026-10-16T00:00:00.000Z',
        })
      },
    }
    await confirm()
    expect(store.attempts).toBeGreaterThan(1)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string; evidence: Array<{ kind: string }> }>
    }
    // The eval survives, and governs: the completion records evidence only.
    const kinds = model.conceptStates[CVC].evidence.map((e) => e.kind)
    expect(kinds).toContain('eval')
    expect(kinds).toContain('programCompletionCoverage')
    expect(model.conceptStates[CVC].state).toBe('frontier')
  })

  it('writes no hours, XP or skill snapshot', async () => {
    seedModel()
    await confirm()
    for (const w of store.writes) {
      expect(w.path).not.toMatch(/hours|xp|skillSnapshot|days|activityConfig/i)
    }
  })
})

describe('withdrawProgramCompletion and the apply retry', () => {
  it('withdraws, supersedes its own refs and reverts its own promotion', async () => {
    seedModel()
    await confirm()
    const result = await withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'notComplete',
      recordedAt: NOW,
    })
    expect(result.state.activeEntryKey).toBeNull()
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { state: string; evidence: Array<{ status?: string }> }>
    }
    expect(model.conceptStates[CVC].state).toBe('not-yet')
    expect(model.conceptStates[CVC].evidence.every((e) => e.status === 'superseded')).toBe(true)
    expect(store.get(`events/${CHILD}__fastPhonics__withdraw-key-001`)).toBeDefined()
  })

  it('refuses a stale correction naming a confirmation that is no longer active', async () => {
    seedModel()
    await confirm()
    await withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'mistake',
      recordedAt: NOW,
    })
    await expect(
      withdrawProgramCompletion({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        entryKey: 'withdraw-key-002',
        withdrawsEntryKey: KEY,
        reason: 'mistake',
        recordedAt: NOW,
      }),
    ).rejects.toBeInstanceOf(ProgramCompletionRefused)
  })

  it('is idempotent on the withdrawal key — a repeat tap is a retry', async () => {
    seedModel()
    await confirm()
    const args = {
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics' as const,
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'partial' as const,
      recordedAt: NOW,
    }
    await withdrawProgramCompletion(args)
    const again = await withdrawProgramCompletion(args)
    expect(again.alreadyRecorded).toBe(true)
  })

  it('a pending application REVALIDATES its stored source before applying', async () => {
    const cited = seedReport()
    await confirm({ reportObservationId: cited })
    // The citation is corrected while the application is still pending.
    store.set(`markers/${cited}`, {
      id: cited,
      childId: CHILD,
      correctionObservationId: `${CHILD}__r9`,
      correctionEntryKey: 'r9-entry-key',
      correctedAt: NOW,
    })
    seedModel()
    await expect(
      applyProgramCompletionProjection({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        expectedEntryKey: KEY,
        recordedAt: NOW,
      }),
    ).rejects.toThrow(PROGRAM_COMPLETION_REPORT_CORRECTED)
    const model = store.get(`learnerModels/${CHILD}`) as { conceptStates: Record<string, unknown> }
    expect(model.conceptStates[CVC]).toBeUndefined()
  })

  it('never rewrites the reapply act a repeat repair reuses', async () => {
    // The reviewer's red fixture. The reapply event id is deterministic, so a
    // SECOND repair at the same mapping version addresses the same document —
    // writing it blind moved the `recordedAt` of an act that had happened, and
    // left `eventCount` / `lastEventAt` disagreeing with the history.
    seedModel()
    await confirm()
    const eventPath = `events/${CHILD}__fastPhonics__${KEY}-v1`
    const statePath = `state/${CHILD}__fastPhonics`
    /** A ref goes missing under the model — the graph repair this button is for. */
    const loseARef = () => {
      const model = store.get(`learnerModels/${CHILD}`) as {
        conceptStates: Record<string, { evidence: unknown[] }>
      }
      model.conceptStates[CVC].evidence = []
      store.set(`learnerModels/${CHILD}`, model as unknown as Record<string, unknown>)
    }

    loseARef()
    const first = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T13:00:00.000Z',
    })
    expect(first.alreadyRecorded).toBe(false)
    expect(first.applied).toBe(true)
    const recordedAt = (store.get(eventPath) as { recordedAt: string }).recordedAt
    expect(recordedAt).toBe('2026-10-17T13:00:00.000Z')
    const eventCount = (store.get(statePath) as { eventCount: number }).eventCount
    const lastEventAt = (store.get(statePath) as { lastEventAt: string }).lastEventAt

    loseARef()
    const second = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: '2026-10-17T14:00:00.000Z',
    })
    // The act is the FIRST one, byte-for-byte...
    expect((store.get(eventPath) as { recordedAt: string }).recordedAt).toBe(recordedAt)
    expect(second.event?.recordedAt).toBe(recordedAt)
    // ...no second act was counted or dated...
    expect((store.get(statePath) as { eventCount: number }).eventCount).toBe(eventCount)
    expect((store.get(statePath) as { lastEventAt: string }).lastEventAt).toBe(lastEventAt)
    // ...and the coverage WAS restored, so this is not reported as a no-op.
    expect(second.alreadyRecorded).toBe(false)
    expect(second.applied).toBe(true)
    const model = store.get(`learnerModels/${CHILD}`) as {
      conceptStates: Record<string, { evidence: unknown[] }>
    }
    expect(model.conceptStates[CVC].evidence).toHaveLength(1)
  })

  it('a withdrawal with no model to update stays PENDING, not finished', async () => {
    // Review item 2: the stored status says `withdrawalPending`, so a result
    // claiming nothing is outstanding contradicts the record.
    seedModel()
    await confirm()
    store.docs.delete(`learnerModels/${CHILD}`)
    const withdrawn = await withdrawProgramCompletion({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      entryKey: 'withdraw-key-001',
      withdrawsEntryKey: KEY,
      reason: 'notComplete',
      recordedAt: NOW,
    })
    expect(withdrawn.applicationPending).toBe(true)
    const retry = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      recordedAt: NOW,
    })
    expect(retry.applied).toBe(false)
    expect(retry.applicationPending).toBe(true)
    expect(
      (store.get(`state/${CHILD}__fastPhonics`) as { projection: { status: string } })
        .projection.status,
    ).toBe('withdrawalPending')
  })

  it('refuses to apply when the stored citation is not the one that was prechecked', async () => {
    // Review item 7: the markerless-correction query ran before the transaction
    // about the citation the state carried THEN. If another confirmation became
    // active in between, applying would rest coverage on an unchecked source.
    const cited = seedReport()
    seedModel()
    await confirm({ reportObservationId: cited })
    store.interleave = {
      afterReads: 0,
      run: () => {
        const state = store.get(`state/${CHILD}__fastPhonics`) as {
          activeAssertion: { reportObservationId: string }
        }
        state.activeAssertion.reportObservationId = `${CHILD}__r7`
        store.set(
          `state/${CHILD}__fastPhonics`,
          state as unknown as Record<string, unknown>,
        )
      },
    }
    await expect(
      applyProgramCompletionProjection({
        familyId: FAMILY,
        childId: CHILD,
        program: 'fastPhonics',
        recordedAt: NOW,
      }),
    ).rejects.toBeInstanceOf(ProgramCompletionRefused)
  })

  it('re-applying at the same version writes nothing new', async () => {
    seedModel()
    await confirm()
    const before = store.writes.length
    const again = await applyProgramCompletionProjection({
      familyId: FAMILY,
      childId: CHILD,
      program: 'fastPhonics',
      expectedEntryKey: KEY,
      recordedAt: NOW,
    })
    expect(again.alreadyRecorded).toBe(true)
    expect(store.writes.length).toBe(before)
  })
})
