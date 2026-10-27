import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore primitives only — the writer is real. `store` is what Firestore
// holds, by id; a `set` inside the transaction lands there, so a later run
// reads back what an earlier one wrote. Transactions are SERIALISED here, as
// Firestore's retry-on-contention makes them in effect: a concurrent loser
// re-runs against the committed document.
const store = new Map<string, Record<string, unknown>>()
const sets: { id: string; data: Record<string, unknown> }[] = []
let queue: Promise<unknown> = Promise.resolve()

vi.mock('firebase/firestore', () => ({
  doc: (_collection: unknown, id?: string) => ({ id }),
  runTransaction: (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: async (ref: { id: string }) => ({ exists: () => store.has(ref.id), data: () => store.get(ref.id) }),
      set: (ref: { id: string }, data: Record<string, unknown>) => {
        sets.push({ id: ref.id, data })
        store.set(ref.id, data)
      },
    }
    const run = queue.then(() => fn(tx))
    queue = run.catch(() => undefined)
    return run
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  activityConfigsCollection: vi.fn(() => ({ __kind: 'activityConfigs' })),
  db: { __db: true },
}))

import { ensureReadAloudConfig } from './readAloudConfigWrites'

const DARK_SEA = { id: 'dark-sea', title: 'On the Edge of the Dark Sea of Darkness', author: 'Andrew Peterson' }
const input = { familyId: 'fam', book: DARK_SEA, canEdit: true }

beforeEach(() => {
  store.clear()
  sets.length = 0
})

describe('ensureReadAloudConfig (FEAT-243 / UX-470)', () => {
  it('creates the one row for a book', async () => {
    expect(await ensureReadAloudConfig(input)).toEqual({ status: 'created', id: 'readaloud-dark-sea' })
    expect([...store.keys()]).toEqual(['readaloud-dark-sea'])
  })

  it('two Applies produce ONE row', async () => {
    await ensureReadAloudConfig(input)
    expect(await ensureReadAloudConfig(input)).toEqual({ status: 'exists', id: 'readaloud-dark-sea' })
    expect(store.size).toBe(1)
    expect(sets).toHaveLength(1)
  })

  it('two concurrent Applies (two tabs, two phones) produce ONE row', async () => {
    const results = await Promise.all([ensureReadAloudConfig(input), ensureReadAloudConfig(input)])
    expect(results.map((r) => r.status).sort()).toEqual(['created', 'exists'])
    expect(store.size).toBe(1)
    expect(sets).toHaveLength(1)
  })

  it('a renamed, re-timed row survives the next Apply untouched', async () => {
    const edited = {
      id: 'readaloud-dark-sea',
      name: 'Dark Sea',
      defaultMinutes: 30,
      subjectBucket: 'LanguageArts',
      chapterBookId: 'dark-sea',
    }
    store.set('readaloud-dark-sea', edited)
    expect((await ensureReadAloudConfig(input)).status).toBe('exists')
    expect(store.get('readaloud-dark-sea')).toBe(edited)
    expect(sets).toHaveLength(0)
  })

  it('a row marked finished stays finished', async () => {
    const done = { id: 'readaloud-dark-sea', completed: true }
    store.set('readaloud-dark-sea', done)
    await ensureReadAloudConfig(input)
    expect(store.get('readaloud-dark-sea')).toBe(done)
  })

  it('writes no position — asserted on the stored document', async () => {
    await ensureReadAloudConfig(input)
    const written = sets[0].data
    expect(written).not.toHaveProperty('currentPosition')
    expect(written).not.toHaveProperty('totalUnits')
    expect(written).toMatchObject({ type: 'routine', childId: 'both', chapterBookId: 'dark-sea' })
  })

  it('is parent-only at the write', async () => {
    expect(await ensureReadAloudConfig({ ...input, canEdit: false })).toEqual({ status: 'not-permitted' })
    expect(store.size).toBe(0)
  })
})
