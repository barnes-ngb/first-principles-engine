import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// Firestore primitives only — the seeder itself is real. These pin UX-394: that
// two concurrent runners can no longer produce two Lincoln documents, which is
// what the family's ~20 duplicates are made of.
//
// `store` is what Firestore is holding, by id. A `set` inside the transaction
// lands there, so a SECOND run reads back what the first wrote — which is what
// makes the create-not-overwrite property testable at all.

const store = new Map<string, Record<string, unknown>>()
const sets: { id: string; data: Record<string, unknown> }[] = []

vi.mock('firebase/firestore', () => ({
  doc: (collection: unknown, id?: string) => ({ __collection: collection, id }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: async (ref: { id: string }) => ({
        exists: () => store.has(ref.id),
        data: () => store.get(ref.id),
      }),
      set: (ref: { id: string }, data: Record<string, unknown>) => {
        sets.push({ id: ref.id, data })
        store.set(ref.id, data)
      },
    }
    return fn(tx)
  },
}))

vi.mock('./firestore', () => ({
  childrenCollection: vi.fn(() => ({ __kind: 'children' })),
  db: { __db: true },
}))

import {
  seedChildData,
  seedChildDocId,
  seedProfileChildren,
  __resetProfileChildSeedState,
} from './seedProfileChildren'

const LINCOLN = {
  profile: 'lincoln',
  name: 'Lincoln',
  birthdate: '2015-09-30',
  grade: '4th grade',
}
const LONDON = {
  profile: 'london',
  name: 'London',
  birthdate: '2020-02-20',
  grade: '1st grade',
}

beforeEach(() => {
  store.clear()
  sets.length = 0
  __resetProfileChildSeedState()
  vi.clearAllMocks()
})

describe('seedChildDocId (UX-394)', () => {
  it('is derived from the PROFILE, so a renamed child keeps his id', () => {
    // Keyed on the `UserProfile` constant rather than the name: a name is a
    // field a parent may correct in Settings, and an id that moves when a name
    // is corrected is not an id.
    expect(seedChildDocId('lincoln')).toBe('seed-lincoln')
    expect(seedChildDocId('london')).toBe('seed-london')
  })

  it('keeps seeded ids in their own namespace', () => {
    // The `seed-` prefix is load-bearing in the way `seedConfigDocId`'s is: a
    // seeded document can never collide with one Firestore auto-generated for a
    // child a parent added by hand.
    expect(seedChildDocId('lincoln').startsWith('seed-')).toBe(true)
  })
})

describe('a seed is create-only under a deterministic id (UX-394)', () => {
  it('writes one document per missing profile child', async () => {
    const created = await seedProfileChildren('family-1', [LINCOLN, LONDON], 'T0')

    expect(sets.map((s) => s.id)).toEqual(['seed-lincoln', 'seed-london'])
    expect(created.map((c) => c.id)).toEqual(['seed-lincoln', 'seed-london'])
    expect(created[0]).toMatchObject({
      name: 'Lincoln',
      birthdate: '2015-09-30',
      grade: '4th grade',
      createdAt: 'T0',
    })
  })

  it('THE RACE: two runners produce one document, not two', async () => {
    // This is the defect. The old code was `addDoc` per missing name straight
    // out of an effect — a check-then-act with as many runners as there are
    // mounts, so every runner that read "missing" appended its own document.
    __resetProfileChildSeedState()
    const first = await seedProfileChildren('family-1', [LINCOLN], 'T0')
    __resetProfileChildSeedState() // a second TAB: its own module instance
    const second = await seedProfileChildren('family-1', [LINCOLN], 'T1')

    expect(sets).toHaveLength(1)
    expect(store.size).toBe(1)
    // Both callers agree on one child rather than one of them believing in a
    // document it did not make.
    expect(second[0].id).toBe(first[0].id)
  })

  it('never writes over a document already there', async () => {
    // A slow runner that read "missing" before a faster one committed must not
    // restore a blank identity over a `birthdate` the parent has since fixed.
    store.set('seed-lincoln', {
      name: 'Lincoln',
      birthdate: '2015-10-01',
      grade: '5th grade',
      createdAt: 'T0',
    })

    const result = await seedProfileChildren('family-1', [LINCOLN], 'T9')

    expect(sets).toHaveLength(0)
    expect(result[0]).toMatchObject({ grade: '5th grade', birthdate: '2015-10-01' })
    expect(store.get('seed-lincoln')).toMatchObject({ grade: '5th grade' })
  })

  it('concurrent callers in one tab share a single run', async () => {
    const [a, b] = await Promise.all([
      seedProfileChildren('family-1', [LINCOLN], 'T0'),
      seedProfileChildren('family-1', [LINCOLN], 'T0'),
    ])

    expect(sets).toHaveLength(1)
    expect(a[0].id).toBe(b[0].id)
  })

  it('writes nothing at all when no child is missing', async () => {
    expect(await seedProfileChildren('family-1', [], 'T0')).toEqual([])
    expect(await seedProfileChildren('', [LINCOLN], 'T0')).toEqual([])
    expect(sets).toHaveLength(0)
  })
})

describe('the document body is unchanged (UX-394)', () => {
  it('carries exactly the identity the retired inline seeder wrote', () => {
    // This is a fix to WHERE the document lands, not to what is in it. The
    // body is the same five fields, so a family seeded before and after this
    // change has the same record.
    expect(seedChildData(LONDON, 'T0')).toEqual({
      id: '',
      name: 'London',
      birthdate: '2020-02-20',
      grade: '1st grade',
      createdAt: 'T0',
    })
  })
})
