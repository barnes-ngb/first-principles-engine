import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Artifact, HoursEntry } from '../../core/types'

type Constraint = { field: string; op: '>=' | '<='; value: string }
type Query = { familyId: string; collection: string; constraints: Constraint[] }
type SavedDocument = { familyId: string; collection: string; id: string; data: Record<string, unknown> }
type Snapshot = { docs: { id: string; data: () => Record<string, unknown> }[] }
type PendingRead = { query: Query; resolve: () => void; reject: () => void }
const store = vi.hoisted(() => ({
  rows: [] as SavedDocument[], pending: [] as PendingRead[],
  holdEvidence: false, failField: '',
}))

// Mock only storage/config boundaries. Both real range-reading hooks, their
// document mapping and the real shared hours fold execute against these rows.
vi.mock('firebase/firestore', () => ({
  where: (field: string, op: Constraint['op'], value: string) => ({ field, op, value }),
  query: (ref: Query, ...constraints: Constraint[]) => ({ ...ref, constraints }),
  getDocs: (query: Query): Promise<Snapshot> => {
    const snapshot = {
      docs: store.rows.filter((row) => row.familyId === query.familyId
        && row.collection === query.collection
        && query.constraints.every(({ field, op, value }) => {
          const actual = row.data[field]
          return typeof actual === 'string' && (op === '>=' ? actual >= value : actual <= value)
        })).map((row) => ({ id: row.id, data: () => row.data })),
    }
    if (query.collection !== 'artifacts') return Promise.resolve(snapshot)
    if (store.holdEvidence) return new Promise((resolve, reject) => {
      store.pending.push({ query, resolve: () => resolve(snapshot), reject: () => reject(new Error('read failed')) })
    })
    if (query.constraints.some(({ field }) => field === store.failField)) {
      return Promise.reject(new Error('read failed'))
    }
    return Promise.resolve(snapshot)
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: (familyId: string) => ({ familyId, collection: 'artifacts' }),
  hoursCollection: (familyId: string) => ({ familyId, collection: 'hours' }),
  daysCollection: (familyId: string) => ({ familyId, collection: 'days' }),
  hoursAdjustmentsCollection: (familyId: string) => ({ familyId, collection: 'hoursAdjustments' }),
}))
const CONFIGS: never[] = []
vi.mock('../shelly-chat/useChatActivityConfigs', () => ({ useChatActivityConfigs: () => CONFIGS }))

import { useWeekBySubject } from './useWeekBySubject'

const PAST = '2026-09-06'
const UPLOAD = '2026-09-13'
const DEFAULT = { familyId: 'f1', childId: 'c1', weekKey: PAST }
const useSubject = (props = DEFAULT) => useWeekBySubject(props.familyId, props.childId, props.weekKey)
const note = (over: Partial<Artifact> = {}): Artifact => ({
  childId: 'c1', dayLogId: '2026-09-08', title: 'Reading note', type: 'Note',
  createdAt: '2026-09-15T17:00:00.000Z',
  tags: { engineStage: 'Build', domain: '', subjectBucket: 'Reading', location: 'Home' },
  ...over,
})
const hours = (over: Partial<HoursEntry> = {}): HoursEntry => ({
  childId: 'c1', date: '2026-09-08', minutes: 25,
  subjectBucket: 'Reading', location: 'Home', source: 'unified-capture', ...over,
})
function save(collection: string, id: string, data: Artifact | HoursEntry, familyId = 'f1') {
  store.rows.push({ collection, id, data: { ...data }, familyId })
}
function counts(subjects: ReturnType<typeof useWeekBySubject>['subjects']) {
  return {
    minutes: subjects.reduce((sum, row) => sum + row.totalMinutes, 0),
    evidence: subjects.reduce((sum, row) => sum + (row.artifactCount ?? 0), 0),
  }
}

beforeEach(() => {
  store.rows = []
  store.pending = []
  store.holdEvidence = false
  store.failField = ''
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the actual weekly artifact reader (UX-413a)', () => {
  it('retrieves a later-uploaded past-day note with its 25 minutes, and excludes it from the upload week', async () => {
    save('artifacts', 'note', note())
    save('hours', 'time', hours())
    const { result, rerender } = renderHook(useSubject, { initialProps: DEFAULT })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(counts(result.current.subjects)).toEqual({ minutes: 25, evidence: 1 })
    rerender({ ...DEFAULT, weekKey: UPLOAD })
    expect(result.current.subjects).toEqual([])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(counts(result.current.subjects)).toEqual({ minutes: 0, evidence: 0 })
    expect(store.rows.find((row) => row.id === 'time')?.data).toEqual(hours())
  })

  it('keeps same-day evidence once per real document, even with conflicting stored IDs', async () => {
    const sameDay = note({ id: 'misleading', createdAt: '2026-09-08T17:00:00.000Z' })
    save('artifacts', 'doc-a', sameDay)
    save('artifacts', 'doc-b', sameDay)
    save('hours', 'time', hours())
    const { result } = renderHook(useSubject)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(counts(result.current.subjects)).toEqual({ minutes: 25, evidence: 2 })
  })

  it('preserves current unlinked book/sketch evidence through a reload without inventing hours', async () => {
    save('artifacts', 'book', note({ dayLogId: undefined, title: 'Completed book' }))
    save('artifacts', 'sketch', note({ dayLogId: undefined, title: 'Hand-drawn sketch' }))
    const props = { ...DEFAULT, weekKey: UPLOAD }
    const first = renderHook(useSubject, { initialProps: props })
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(counts(first.result.current.subjects)).toEqual({ minutes: 0, evidence: 2 })
    first.unmount()
    const reload = renderHook(useSubject, { initialProps: props })
    await waitFor(() => expect(reload.result.current.loading).toBe(false))
    expect(counts(reload.result.current.subjects)).toEqual({ minutes: 0, evidence: 2 })
  })

  it('does not include another child or family from either source', async () => {
    save('artifacts', 'other-child', note({ childId: 'c2' }))
    save('hours', 'other-child-time', hours({ childId: 'c2' }))
    save('artifacts', 'other-family', note(), 'f2')
    save('hours', 'other-family-time', hours(), 'f2')
    const { result } = renderHook(useSubject)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.subjects).toEqual([])
  })

  it.each(['note', 'time'])('keeps %s-only logging separate from the other claim', async (kind) => {
    if (kind === 'note') save('artifacts', 'note', note())
    else save('hours', 'time', hours())
    const { result } = renderHook(useSubject)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(counts(result.current.subjects)).toEqual({
      minutes: kind === 'time' ? 25 : 0, evidence: kind === 'note' ? 1 : 0,
    })
  })

  it.each(['dayLogId', 'createdAt'])('reports unknown evidence if the %s query fails', async (field) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.failField = field
    save('artifacts', 'note', note())
    save('hours', 'time', hours())
    const { result } = renderHook(useSubject)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.evidenceFailed).toBe(true)
    expect(result.current.hoursFailed).toBe(false)
    expect(result.current.subjects[0]).toMatchObject({ totalMinutes: 25, artifactCount: null, topics: null })
  })

  it('stays loading until both evidence queries resolve', async () => {
    store.holdEvidence = true
    save('artifacts', 'note', note())
    const { result } = renderHook(useSubject)
    await act(async () => { store.pending[0].resolve() })
    expect(result.current.loading).toBe(true)
    expect(result.current.subjects).toEqual([])
    await act(async () => { store.pending[1].resolve() })
    expect(result.current.loading).toBe(false)
    expect(counts(result.current.subjects).evidence).toBe(1)
  })

  it.each([
    { ...DEFAULT, weekKey: UPLOAD },
    { ...DEFAULT, childId: 'c2' },
    { ...DEFAULT, familyId: 'f2' },
  ])('ignores late results and failures across a scope change to %j and back', async (otherScope) => {
    store.holdEvidence = true
    save('artifacts', 'old-note', note())
    const { result, rerender } = renderHook(useSubject, { initialProps: DEFAULT })
    const oldReads = [...store.pending]
    rerender(otherScope)
    const otherReads = store.pending.slice(oldReads.length)
    store.rows = []
    rerender(DEFAULT)
    const currentReads = store.pending.slice(oldReads.length + otherReads.length)
    await act(async () => { currentReads.forEach((read) => read.resolve()) })
    expect(result.current.loading).toBe(false)
    expect(result.current.subjects).toEqual([])
    await act(async () => {
      oldReads.forEach((read) => read.resolve())
      otherReads.forEach((read) => read.reject())
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.evidenceFailed).toBe(false)
    expect(result.current.subjects).toEqual([])
  })
})
