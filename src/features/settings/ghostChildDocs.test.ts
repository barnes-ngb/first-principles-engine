import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// Firestore primitives only. `refs` is the family's data as this survey sees
// it: a set of `children` documents, a set of ids that OTHER collections point
// at, and a set of probes told to fail.

let childDocs: { id: string; data: () => unknown }[] = []
/** `${probeLabel}:${childId}` for every reference that exists. */
let references = new Set<string>()
/** Probe labels whose read throws. */
let failingProbes = new Set<string>()
const deleted: string[] = []

function kindOf(collection: unknown): string {
  return (collection as { __kind?: string })?.__kind ?? '?'
}

vi.mock('firebase/firestore', () => ({
  doc: (collection: unknown, id?: string) => ({ __kind: kindOf(collection), id }),
  getDoc: async (ref: { __kind: string; id: string }) => {
    if (failingProbes.has(ref.__kind)) throw new Error('permission-denied')
    return { exists: () => references.has(`${ref.__kind}:${ref.id}`) }
  },
  getDocs: async (q: { __kind: string; __childId?: string }) => {
    if (q.__kind === 'children') return { docs: childDocs }
    if (failingProbes.has(q.__kind)) throw new Error('permission-denied')
    const hit = references.has(`${q.__kind}:${q.__childId}`)
    return { empty: !hit, docs: [] }
  },
  deleteDoc: async (ref: { id: string }) => {
    if (ref.id === 'explode') throw new Error('nope')
    deleted.push(ref.id)
  },
  limit: () => ({ __limit: true }),
  query: (collection: unknown, where: { __childId?: string }) => ({
    __kind: kindOf(collection),
    __childId: where.__childId,
  }),
  where: (_field: string, _op: string, value: string) => ({ __childId: value }),
}))

vi.mock('../../core/firebase/firestore', () => {
  const stub = (kind: string) => () => ({ __kind: kind })
  return {
    childrenCollection: stub('children'),
    skillSnapshotsCollection: stub('skillSnapshots'),
    learnerModelsCollection: stub('learnerModels'),
    xpLedgerCollection: stub('xpLedger'),
    avatarProfilesCollection: stub('avatarProfiles'),
    activityConfigsCollection: stub('activityConfigs'),
    daysCollection: stub('days'),
    hoursCollection: stub('hours'),
    artifactsCollection: stub('artifacts'),
  }
})

import {
  CHILD_REFERENCE_PROBES,
  classifyChildDocs,
  deleteGhostChildDocs,
  findGhostChildDocs,
  isDeletableGhost,
} from './ghostChildDocs'

function childDoc(id: string, name: string, createdAt?: string) {
  return { id, data: () => ({ name, createdAt }) }
}

/** The shape the family was actually in: two real boys, many strays. */
const REAL_LINCOLN = childDoc('c1', 'Lincoln', '2025-01-01T00:00:00.000Z')
const REAL_LONDON = childDoc('c2', 'London', '2025-01-01T00:00:01.000Z')

beforeEach(() => {
  childDocs = []
  references = new Set()
  failingProbes = new Set()
  deleted.length = 0
})

describe('classifyChildDocs — the app’s own rule, not a second copy (UX-394)', () => {
  it('keeps the OLDEST document per name and calls the rest ghosts', () => {
    // The canonical id is the one `skillSnapshots`, `learnerModels`, `xpLedger`
    // and every `childId` field already key on, so "oldest wins" is not a
    // preference — it is the id that must not move.
    const { canonical, ghosts } = classifyChildDocs([
      { id: 'ghost-a', name: 'Lincoln', createdAt: '2025-06-01T00:00:00.000Z' },
      { id: 'c1', name: 'Lincoln', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'ghost-b', name: 'lincoln', createdAt: '2025-07-01T00:00:00.000Z' },
      { id: 'c2', name: 'London', createdAt: '2025-01-01T00:00:00.000Z' },
    ])

    expect(canonical.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(ghosts.map((g) => g.id).sort()).toEqual(['ghost-a', 'ghost-b'])
  })

  it('never calls a child with a name of his own a ghost', () => {
    // A third child someone added by hand is a child, not a duplicate. This
    // survey has no opinion about him.
    const { canonical, ghosts } = classifyChildDocs([
      { id: 'c1', name: 'Lincoln', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'c3', name: 'Cousin Ada', createdAt: '2026-01-01T00:00:00.000Z' },
    ])

    expect(ghosts).toEqual([])
    expect(canonical).toHaveLength(2)
  })
})

describe('findGhostChildDocs probes before offering anything (UX-394)', () => {
  it('offers a ghost that nothing references', async () => {
    childDocs = [REAL_LINCOLN, REAL_LONDON, childDoc('ghost-a', 'Lincoln', '2025-06-01T00:00:00.000Z')]

    const survey = await findGhostChildDocs('family-1')

    expect(survey.canonical.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(survey.deletable.map((g) => g.id)).toEqual(['ghost-a'])
    expect(survey.referenced).toEqual([])
    expect(survey.ghosts[0].referencedBy).toEqual([])
  })

  it('LISTS a referenced ghost and does NOT offer it — that is UX-395', async () => {
    // A ghost with records under it means something was written to an id no
    // screen has shown. That is a different and worse finding than a stray
    // document, and correcting history is its own decision.
    childDocs = [REAL_LINCOLN, childDoc('ghost-a', 'Lincoln', '2025-06-01T00:00:00.000Z')]
    references.add('hours:ghost-a')

    const survey = await findGhostChildDocs('family-1')

    expect(survey.referenced.map((g) => g.id)).toEqual(['ghost-a'])
    expect(survey.referenced[0].referencedBy).toEqual(['hours'])
    expect(survey.deletable).toEqual([])
  })

  it('FAILS CLOSED: a probe that throws withholds the ghost exactly as a match does', async () => {
    // A guard that passes on an error it could not run is worse than no guard,
    // and here the cost of being wrong is a deleted record.
    childDocs = [REAL_LINCOLN, childDoc('ghost-a', 'Lincoln', '2025-06-01T00:00:00.000Z')]
    failingProbes.add('learnerModels')

    const survey = await findGhostChildDocs('family-1')

    expect(survey.ghosts[0].unreadable).toEqual(['learnerModels'])
    expect(survey.deletable).toEqual([])
    // …and it is not reported as a reference either, because it is not one.
    expect(survey.referenced).toEqual([])
  })

  it('asks every declared probe, by document id and by childId field', async () => {
    childDocs = [REAL_LINCOLN, childDoc('ghost-a', 'Lincoln', '2025-06-01T00:00:00.000Z')]
    for (const probe of CHILD_REFERENCE_PROBES) references.add(`${probe.label}:ghost-a`)

    const survey = await findGhostChildDocs('family-1')

    expect(survey.ghosts[0].referencedBy).toEqual(
      CHILD_REFERENCE_PROBES.map((p) => p.label),
    )
  })

  it('finds nothing on a clean family', async () => {
    childDocs = [REAL_LINCOLN, REAL_LONDON]

    const survey = await findGhostChildDocs('family-1')

    expect(survey.ghosts).toEqual([])
    expect(survey.deletable).toEqual([])
    expect(survey.canonical).toHaveLength(2)
  })
})

describe('the delete is gated at the write, not only in the UI (UX-394)', () => {
  it('deletes only the documents nothing points at', async () => {
    const clean = { id: 'ghost-a', name: 'Lincoln', referencedBy: [], unreadable: [] }
    const held = { id: 'ghost-b', name: 'Lincoln', referencedBy: ['hours'], unreadable: [] }
    const unknown = { id: 'ghost-c', name: 'Lincoln', referencedBy: [], unreadable: ['days'] }

    const result = await deleteGhostChildDocs('family-1', [clean, held, unknown])

    expect(result.deleted).toEqual(['ghost-a'])
    expect(deleted).toEqual(['ghost-a'])
    expect(result.failed.map((f) => f.id).sort()).toEqual(['ghost-b', 'ghost-c'])
  })

  it('reports a failed delete rather than implying it landed', async () => {
    const result = await deleteGhostChildDocs('family-1', [
      { id: 'explode', name: 'Lincoln', referencedBy: [], unreadable: [] },
    ])

    expect(result.deleted).toEqual([])
    expect(result.failed[0]).toMatchObject({ id: 'explode', error: 'nope' })
  })

  it('isDeletableGhost needs BOTH halves', () => {
    expect(isDeletableGhost({ id: 'g', name: 'n', referencedBy: [], unreadable: [] })).toBe(true)
    expect(isDeletableGhost({ id: 'g', name: 'n', referencedBy: ['days'], unreadable: [] })).toBe(false)
    expect(isDeletableGhost({ id: 'g', name: 'n', referencedBy: [], unreadable: ['days'] })).toBe(false)
  })
})
