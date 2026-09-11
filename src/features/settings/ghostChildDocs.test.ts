import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// Firestore primitives only. The family's data is modelled as: a set of
// `children` documents, a set of `${collection}:${kind}:${childId}` references
// that exist, and a set of probes told to fail.

let childDocs: { id: string; data: () => unknown }[] = []
/** `${collectionName}:${'doc-id'|'child-field'}:${childId}` for each reference. */
let references = new Set<string>()
/** `${collectionName}:${kind}` probes whose read throws. */
let failingProbes = new Set<string>()
const deleted: string[] = []
/** Bumped by the test to simulate another tab writing during the confirm. */
let onProbe: (() => void) | null = null

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __name: path.split('/').pop() }),
  doc: (col: { __name?: string }, id?: string) => ({ __name: col?.__name, id }),
  documentId: () => '__id',
  deleteDoc: async (ref: { id: string }) => {
    if (ref.id === 'explode') throw new Error('nope')
    deleted.push(ref.id)
  },
  limit: () => ({ __limit: true }),
  where: (field: string, _op: string, value: string) => ({ field, value }),
  query: (
    col: { __name?: string },
    ...clauses: { field: string; value: string }[]
  ) => {
    const byId = clauses.some((c) => c.field === '__id')
    const childId = clauses.find((c) => c.field !== '__id')?.value
    return {
      __name: col?.__name,
      __kind: byId ? 'doc-id' : 'child-field',
      __childId: byId ? clauses[0].value : childId,
    }
  },
  getDocs: async (q: {
    __name: string
    __kind?: string
    __childId?: string
    __children?: boolean
  }) => {
    if (q.__name === 'children') return { docs: childDocs }
    onProbe?.()
    if (failingProbes.has(`${q.__name}:${q.__kind}`)) throw new Error('permission-denied')
    return { empty: !references.has(`${q.__name}:${q.__kind}:${q.__childId}`), docs: [] }
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  childrenCollection: () => ({ __name: 'children' }),
  db: { __db: true },
}))

import {
  PROBED_COLLECTIONS,
  classifyChildDocs,
  deleteGhostChildDocs,
  findGhostChildDocs,
  isDeletableGhost,
  probeChildReferences,
} from './ghostChildDocs'

function childDoc(id: string, name: string, createdAt?: string) {
  return { id, data: () => ({ name, createdAt }) }
}

/** The shape the family was actually in: two real boys, strays beside them. */
const REAL_LINCOLN = childDoc('c1', 'Lincoln', '2025-01-01T00:00:00.000Z')
const REAL_LONDON = childDoc('c2', 'London', '2025-01-01T00:00:01.000Z')
const GHOST = childDoc('ghost-a', 'Lincoln', '2025-06-01T00:00:00.000Z')

beforeEach(() => {
  childDocs = []
  references = new Set()
  failingProbes = new Set()
  deleted.length = 0
  onProbe = null
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

describe('the probe asks every collection BOTH questions (UX-394, Codex round 1)', () => {
  it('catches a composite document id, not only an exact one', async () => {
    // THE ROUND 1 P1. `addXpEvent` writes per-event records as
    // `xpLedger/{childId}_{dedupKey}`; a diamond award never writes the
    // cumulative `xpLedger/{childId}` document at all. An exact-id probe reads
    // that ghost as unreferenced and offers an irreversible currency record for
    // deletion. The doc-id probe is a PREFIX RANGE, so the composite key hits.
    references.add('xpLedger:doc-id:ghost-a')

    const { referencedBy } = await probeChildReferences('family-1', 'ghost-a')
    expect(referencedBy).toEqual(['xpLedger (doc-id)'])
  })

  it('catches a childId FIELD on a collection whose ids are not the child', async () => {
    references.add('hours:child-field:ghost-a')

    const { referencedBy } = await probeChildReferences('family-1', 'ghost-a')
    expect(referencedBy).toEqual(['hours (child-field)'])
  })

  it('asks both questions of every declared collection and nothing else', async () => {
    for (const name of PROBED_COLLECTIONS) {
      references.add(`${name}:doc-id:ghost-a`)
      references.add(`${name}:child-field:ghost-a`)
    }

    const { referencedBy } = await probeChildReferences('family-1', 'ghost-a')
    expect(referencedBy).toHaveLength(PROBED_COLLECTIONS.length * 2)
    // `children` is never probed — the ghost is a document in it, so probing it
    // would match itself and nothing would ever be deletable.
    expect(PROBED_COLLECTIONS).not.toContain('children')
  })
})

describe('findGhostChildDocs probes before offering anything (UX-394)', () => {
  it('offers a ghost that nothing references', async () => {
    childDocs = [REAL_LINCOLN, REAL_LONDON, GHOST]

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
    childDocs = [REAL_LINCOLN, GHOST]
    references.add('hours:child-field:ghost-a')

    const survey = await findGhostChildDocs('family-1')

    expect(survey.referenced.map((g) => g.id)).toEqual(['ghost-a'])
    expect(survey.referenced[0].referencedBy).toEqual(['hours (child-field)'])
    expect(survey.deletable).toEqual([])
  })

  it('FAILS CLOSED: a probe that throws withholds the ghost exactly as a match does', async () => {
    // A guard that passes on an error it could not run is worse than no guard,
    // and here the cost of being wrong is a deleted record.
    childDocs = [REAL_LINCOLN, GHOST]
    failingProbes.add('learnerModels:doc-id')

    const survey = await findGhostChildDocs('family-1')

    expect(survey.ghosts[0].unreadable).toEqual(['learnerModels (doc-id)'])
    expect(survey.deletable).toEqual([])
    // …and it is not reported as a reference either, because it is not one.
    expect(survey.referenced).toEqual([])
  })

  it('finds nothing on a clean family', async () => {
    childDocs = [REAL_LINCOLN, REAL_LONDON]

    const survey = await findGhostChildDocs('family-1')

    expect(survey.ghosts).toEqual([])
    expect(survey.deletable).toEqual([])
    expect(survey.canonical).toHaveLength(2)
  })
})

describe('the delete revalidates against live data (UX-394, Codex round 1)', () => {
  it('deletes a ghost that is still a ghost and still unreferenced', async () => {
    childDocs = [REAL_LINCOLN, GHOST]

    const result = await deleteGhostChildDocs('family-1', ['ghost-a'])

    expect(result.deleted).toEqual(['ghost-a'])
    expect(deleted).toEqual(['ghost-a'])
  })

  it('THE ROUND 1 P1: a reference written DURING the confirm stops the delete', async () => {
    // The survey is a snapshot. Another tab can write a reference between the
    // survey and the tap, and the cached `referencedBy: []` would have let the
    // delete through — presenting a stale array as a write-time gate.
    childDocs = [REAL_LINCOLN, GHOST]
    onProbe = () => {
      references.add('artifacts:child-field:ghost-a')
      onProbe = null
    }

    const result = await deleteGhostChildDocs('family-1', ['ghost-a'])

    expect(deleted).toEqual([])
    expect(result.failed[0].error).toContain('now referenced by')
  })

  it('refuses a document that is no longer a duplicate of another child', async () => {
    // A rename in another tab can make the document the canonical child of a
    // name of its own. The delete re-derives the split rather than trusting the
    // ids the survey handed it.
    childDocs = [REAL_LINCOLN, childDoc('ghost-a', 'Cousin Ada', '2025-06-01T00:00:00.000Z')]

    const result = await deleteGhostChildDocs('family-1', ['ghost-a'])

    expect(deleted).toEqual([])
    expect(result.failed[0].error).toContain('no longer a duplicate')
  })

  it('deletes nothing at all when the children cannot be re-read', async () => {
    childDocs = []
    const result = await deleteGhostChildDocs('family-1', ['ghost-a'])

    expect(deleted).toEqual([])
    expect(result.failed).toHaveLength(1)
  })

  it('reports a failed delete rather than implying it landed', async () => {
    childDocs = [REAL_LINCOLN, childDoc('explode', 'Lincoln', '2025-06-01T00:00:00.000Z')]

    const result = await deleteGhostChildDocs('family-1', ['explode'])

    expect(result.deleted).toEqual([])
    expect(result.failed[0]).toMatchObject({ id: 'explode', error: 'nope' })
  })

  it('isDeletableGhost needs BOTH halves', () => {
    expect(isDeletableGhost({ id: 'g', name: 'n', referencedBy: [], unreadable: [] })).toBe(true)
    expect(isDeletableGhost({ id: 'g', name: 'n', referencedBy: ['days'], unreadable: [] })).toBe(false)
    expect(isDeletableGhost({ id: 'g', name: 'n', referencedBy: [], unreadable: ['days'] })).toBe(false)
  })
})
