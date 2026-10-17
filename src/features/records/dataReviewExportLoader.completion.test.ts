import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The finished-program record is read under a REAL cap (FEAT-242 review item 3).
 *
 * The earlier version read every act a child had and then sliced 200 off the
 * front: the output was bounded and the read was not. These pin the read itself
 * — a `cap + 1` Firestore limit, the state document addressed by id, honest
 * truncation, child isolation, and a failed read that stays distinct from an
 * empty one.
 */

interface Constraint {
  kind: string
  field?: string
  value?: unknown
  count?: number
}
const captured: {
  getDocPath: string | null
  constraints: Constraint[]
  collection: string | null
} = { getDocPath: null, constraints: [], collection: null }

const getDocMock = vi.fn()
const getDocsMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (col: { __col: string }, id: string) => {
    captured.getDocPath = `${col.__col}/${id}`
    return { __col: col.__col, id }
  },
  getDoc: (ref: unknown) => getDocMock(ref),
  getDocs: (q: unknown) => getDocsMock(q),
  query: (col: { __col: string }, ...constraints: Constraint[]) => {
    captured.collection = col.__col
    captured.constraints = constraints
    return { __col: col.__col, constraints }
  },
  where: (field: string, _op: string, value: unknown): Constraint => ({
    kind: 'where',
    field,
    value,
  }),
  limit: (count: number): Constraint => ({ kind: 'limit', count }),
  orderBy: (field: string): Constraint => ({ kind: 'orderBy', field }),
  startAfter: (): Constraint => ({ kind: 'startAfter' }),
  getCountFromServer: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => {
  // Declared INSIDE the factory: `vi.mock` is hoisted above every top-level
  // binding in this file, so a helper defined outside it is not initialised yet.
  const col = (name: string) => () => ({ __col: name })
  return {
    activityConfigsCollection: col('activityConfigs'),
    artifactsCollection: col('artifacts'),
    childrenCollection: col('children'),
    dadLabReportsCollection: col('dadLabReports'),
    daysCollection: col('days'),
    evaluationSessionsCollection: col('evaluationSessions'),
    hoursAdjustmentsCollection: col('hoursAdjustments'),
    hoursCollection: col('hours'),
    learnerModelsCollection: col('learnerModels'),
    programCompletionEventsCollection: col('programCompletionEvents'),
    programCompletionStateCollection: col('programCompletionState'),
    sightWordProgressCollection: col('sightWordProgress'),
    skillSnapshotsCollection: col('skillSnapshots'),
    workbookConfigsCollection: col('workbookConfigs'),
    xpLedgerCollection: col('xpLedger'),
  }
})

import { COMPLETION_EVENT_CAP, loadCompletionRecord } from './dataReviewExportLoader'

/** `n` act documents, named the way the writer names them. */
const acts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c1__fastPhonics__key-${i}`,
    data: () => ({ childId: 'c1', program: 'fastPhonics', entryKey: `key-${i}` }),
  }))

beforeEach(() => {
  captured.getDocPath = null
  captured.constraints = []
  captured.collection = null
  getDocMock.mockReset()
  getDocsMock.mockReset()
  getDocMock.mockResolvedValue({ exists: () => false, id: 'c1__fastPhonics', data: () => ({}) })
  getDocsMock.mockResolvedValue({ docs: [] })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('loadCompletionRecord — the read is what is bounded', () => {
  it('asks Firestore for at most the cap PLUS ONE act, for this child only', async () => {
    await loadCompletionRecord('fam-1', 'c1')
    expect(captured.collection).toBe('programCompletionEvents')
    expect(captured.constraints).toEqual([
      { kind: 'where', field: 'childId', value: 'c1' },
      { kind: 'limit', count: COMPLETION_EVENT_CAP + 1 },
    ])
    // No ordering constraint: document-id order needs no composite index, and
    // the section text makes no newest-first claim.
    expect(captured.constraints.some((c) => c.kind === 'orderBy')).toBe(false)
  })

  it('addresses the state document by id, never by a query', async () => {
    await loadCompletionRecord('fam-1', 'c1')
    expect(captured.getDocPath).toBe('programCompletionState/c1__fastPhonics')
    expect(getDocMock).toHaveBeenCalledTimes(1)
    // One history query and nothing else.
    expect(getDocsMock).toHaveBeenCalledTimes(1)
  })

  it('reports the history as limited only when the extra document came back', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: acts(COMPLETION_EVENT_CAP) })
    const exact = await loadCompletionRecord('fam-1', 'c1')
    expect(exact.events).toHaveLength(COMPLETION_EVENT_CAP)
    expect(exact.truncated).toBe(false)

    getDocsMock.mockResolvedValueOnce({ docs: acts(COMPLETION_EVENT_CAP + 1) })
    const over = await loadCompletionRecord('fam-1', 'c1')
    // The cap+1 document is the SIGNAL, not content: it is not exported.
    expect(over.events).toHaveLength(COMPLETION_EVENT_CAP)
    expect(over.truncated).toBe(true)
  })

  it('carries the state document when it exists', async () => {
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      id: 'c1__fastPhonics',
      data: () => ({ childId: 'c1', program: 'fastPhonics', activeEntryKey: 'k1' }),
    })
    const loaded = await loadCompletionRecord('fam-1', 'c1')
    expect(loaded.state).toMatchObject({ id: 'c1__fastPhonics', activeEntryKey: 'k1' })
    expect(loaded.readFailed).toBe(false)
  })

  it('keeps a FAILED read distinct from an empty record', async () => {
    getDocsMock.mockRejectedValueOnce(new Error('permission-denied'))
    const failed = await loadCompletionRecord('fam-1', 'c1')
    expect(failed.readFailed).toBe(true)
    expect(failed.state).toBeNull()
    expect(failed.events).toEqual([])

    const empty = await loadCompletionRecord('fam-1', 'c1')
    expect(empty.readFailed).toBe(false)
    expect(empty.state).toBeNull()
    expect(empty.events).toEqual([])
  })
})
