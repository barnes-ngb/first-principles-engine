import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// Firestore primitives only — the seeder itself is real. These tests exist to
// pin UX-231: that two concurrent seeders can no longer produce two copies of a
// row, and that a child with no configs still gets the full set.
//
// `simulateEmptyRead` models the race directly. The bug was check-then-act:
// several callers read `activityConfigs`, all saw empty, and all wrote. So the
// read here always reports empty, exactly as it did for every runner on the
// family's first load, and the assertions are about what reaches Firestore.

const batches: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[] = []
let getDocsResult: { empty: boolean; docs: unknown[] } = { empty: true, docs: [] }
let workbookDocs: { id: string; data: () => unknown }[] = []
let getDocsCalls = 0

/**
 * The documents Firestore is holding, by id. A `set` inside the transaction
 * lands here, so a SECOND run reads back what the first one wrote — which is
 * what makes the create-not-overwrite property testable at all.
 */
const store = new Map<string, Record<string, unknown>>()

vi.mock('firebase/firestore', () => ({
  doc: (collection: unknown, id?: string) => ({ __collection: collection, id }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async (q: { __kind?: string }) => {
    // The workbook query is distinguishable by the collection it names.
    if (q?.__kind === 'workbookConfigs') return { empty: workbookDocs.length === 0, docs: workbookDocs }
    getDocsCalls++
    return getDocsResult
  }),
  limit: () => ({ __limit: true }),
  query: (collection: { __kind?: string }) => ({ __kind: collection?.__kind }),
  where: () => ({ __where: true }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<number>) => {
    // A batch stand-in per transaction, so the existing assertions over
    // `batches` keep reading "what this run wrote".
    const b = { set: vi.fn(), commit: vi.fn(async () => undefined) }
    batches.push(b)
    const tx = {
      get: async (ref: { id: string }) => ({
        exists: () => store.has(ref.id),
        data: () => store.get(ref.id),
      }),
      set: (ref: { id: string }, data: Record<string, unknown>) => {
        b.set(ref, data)
        store.set(ref.id, data)
      },
    }
    return fn(tx)
  },
}))

vi.mock('./firestore', () => ({
  activityConfigsCollection: vi.fn(() => ({ __kind: 'activityConfigs' })),
  skillSnapshotsCollection: vi.fn(() => ({ __kind: 'skillSnapshots' })),
  workbookConfigsCollection: vi.fn(() => ({ __kind: 'workbookConfigs' })),
  db: { __db: true },
}))

import {
  DEFAULT_ACTIVITY_CONFIG_SEED,
  ensureDefaultActivityConfigs,
  migratedWorkbookDocId,
  seedConfigDocId,
  seedConfigOwner,
  __resetActivityConfigSeedState,
} from './migrateActivityConfigs'

/** Every document id written across every batch that was committed. */
function writtenIds(): string[] {
  return batches.flatMap((b) => b.set.mock.calls.map((call) => (call[0] as { id: string }).id))
}

/** Every document body written across every batch. */
function writtenDocs(): Record<string, unknown>[] {
  return batches.flatMap((b) => b.set.mock.calls.map((call) => call[1] as Record<string, unknown>))
}

beforeEach(() => {
  batches.length = 0
  workbookDocs = []
  getDocsCalls = 0
  getDocsResult = { empty: true, docs: [] }
  store.clear()
  __resetActivityConfigSeedState()
  vi.clearAllMocks()
})

describe('the seed list (UX-231 — one list, reconciled from two)', () => {
  it('carries the block-scheduling fields the app actually reads', () => {
    const byName = new Map(DEFAULT_ACTIVITY_CONFIG_SEED.map((c) => [c.name, c]))

    // These are the values the reconciliation KEPT, and the reason it kept them.
    // `aspirational` is read by rollover + budgetEnforcement, `pairedWith` by
    // chatPlanner's paired-minute fold, and `functions/src/ai/tasks/plan.ts`
    // names Prayer's block and aspirational flag in the prompt itself. The
    // retired list carried none of them, so adopting its minutes would have
    // silently dropped the fields.
    expect(byName.get('Prayer and Scripture')).toMatchObject({
      block: 'formation',
      aspirational: true,
      defaultMinutes: 10,
    })
    expect(byName.get('Handwriting (while read-aloud)')).toMatchObject({
      defaultMinutes: 15,
      frequency: 'daily',
      pairedWith: 'narnia',
    })
    expect(byName.get('Booster cards')).toMatchObject({
      frequency: 'daily',
      choiceGroup: 'lincoln-choice-1',
    })
  })

  it('is the UNION of the two retired lists — nothing a child could get was dropped', () => {
    const names = DEFAULT_ACTIVITY_CONFIG_SEED.map((c) => c.name)
    // From the retired `DEFAULT_ROUTINE_CONFIGS`…
    expect(names).toContain('Good and the Beautiful Reading')
    expect(names).toContain('Good and the Beautiful Math')
    // …and from the retired inline `defaults`, which was the only source of these.
    expect(names).toContain('Knowledge Mine')
    expect(names).toContain('Fluency Practice')
    expect(names).toHaveLength(10)
  })

  it('has no duplicate names — a seed list that repeats itself seeds a duplicate', () => {
    const names = DEFAULT_ACTIVITY_CONFIG_SEED.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every entry a distinct document id for the same child', () => {
    const ids = DEFAULT_ACTIVITY_CONFIG_SEED.map((c) =>
      seedConfigDocId(c.name, seedConfigOwner(c.name, 'lincoln')),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('seedConfigDocId (the rail)', () => {
  it('is deterministic — the same entry always addresses the same document', () => {
    expect(seedConfigDocId('Prayer and Scripture', 'both')).toBe('seed-prayerandscripture-both')
    expect(seedConfigDocId('Prayer and Scripture', 'both')).toBe(
      seedConfigDocId('Prayer and Scripture', 'both'),
    )
  })

  it('keys through nameKey, so punctuation and case cannot fork the id', () => {
    expect(seedConfigDocId('Prayer and Scripture!', 'both')).toBe(
      seedConfigDocId('prayer  and  scripture', 'both'),
    )
  })

  it('separates the same activity for different children', () => {
    expect(seedConfigDocId('Memory card', 'lincoln')).not.toBe(
      seedConfigDocId('Memory card', 'london'),
    )
  })

  it('namespaces seeded ids so they cannot collide with a parent-created config', () => {
    expect(seedConfigDocId('Memory card', 'lincoln').startsWith('seed-')).toBe(true)
    expect(migratedWorkbookDocId('abc123')).toBe('wb-abc123')
  })
})

describe('seedConfigOwner', () => {
  it('shares Prayer and the read-aloud handwriting across the family', () => {
    expect(seedConfigOwner('Prayer and Scripture', 'lincoln')).toBe('both')
    expect(seedConfigOwner('Handwriting (while read-aloud)', 'lincoln')).toBe('both')
  })

  it('gives everything else to the child', () => {
    expect(seedConfigOwner('Memory card', 'lincoln')).toBe('lincoln')
    expect(seedConfigOwner('Good and the Beautiful Math', 'london')).toBe('london')
  })
})

describe('ensureDefaultActivityConfigs — the race (UX-231)', () => {
  it('seeds the full set for a child with no configs at all', async () => {
    const written = await ensureDefaultActivityConfigs('fam', 'lincoln')

    expect(written).toBe(DEFAULT_ACTIVITY_CONFIG_SEED.length)
    expect(writtenIds()).toHaveLength(DEFAULT_ACTIVITY_CONFIG_SEED.length)
    // A new child with an empty curriculum and no way to notice is the failure
    // this guard must never cause.
    expect(writtenDocs().map((d) => d.name)).toEqual(
      DEFAULT_ACTIVITY_CONFIG_SEED.map((c) => c.name),
    )
  })

  it('writes nothing when ANY config already exists — a deleted default stays deleted', async () => {
    getDocsResult = { empty: false, docs: [{ id: 'existing' }] }

    expect(await ensureDefaultActivityConfigs('fam', 'lincoln')).toBe(0)
    expect(batches).toHaveLength(0)
  })

  it('four concurrent callers — the five-runner race — produce ONE seed', async () => {
    // This is the reported bug reproduced: `useActivityConfigs` mounted on
    // PlannerChatPage, CurriculumTab and TodayPage, plus TodayPage's own direct
    // call, all arriving before any of them has written.
    const results = await Promise.all([
      ensureDefaultActivityConfigs('fam', 'lincoln'),
      ensureDefaultActivityConfigs('fam', 'lincoln'),
      ensureDefaultActivityConfigs('fam', 'lincoln'),
      ensureDefaultActivityConfigs('fam', 'lincoln'),
    ])

    // The in-flight promise: one read, one batch, four callers.
    expect(getDocsCalls).toBe(1)
    expect(batches).toHaveLength(1)
    expect(results).toEqual([10, 10, 10, 10])
    expect(writtenIds()).toHaveLength(DEFAULT_ACTIVITY_CONFIG_SEED.length)
  })

  it('and if two runners DO both pass the empty check, the second writes nothing', async () => {
    // The in-flight map cannot reach a second browser tab or a second device,
    // so the rail has to hold without it. Force two independent runs by
    // clearing the map between them — both see an empty collection, both reach
    // the write.
    const first = await ensureDefaultActivityConfigs('fam', 'lincoln')
    __resetActivityConfigSeedState()
    const second = await ensureDefaultActivityConfigs('fam', 'lincoln')

    expect(batches).toHaveLength(2)
    expect(first).toBe(DEFAULT_ACTIVITY_CONFIG_SEED.length)
    // Ten documents exist and the stale runner adds none. The deterministic id
    // is what stops it appending; the transactional existence check is what
    // stops it OVERWRITING (Codex round 1, P2).
    expect(second).toBe(0)
    expect(new Set(writtenIds()).size).toBe(DEFAULT_ACTIVITY_CONFIG_SEED.length)
  })

  it('a stale runner cannot restore defaults over an edit made since', async () => {
    // The exact sequence Codex named: tab A seeds; the parent opens Curriculum
    // and changes a seeded row; tab B — which read the collection as empty
    // BEFORE A committed — finally commits. A blind `set` would silently put
    // the default minutes back.
    await ensureDefaultActivityConfigs('fam', 'lincoln')
    const editedId = seedConfigDocId('Memory card', 'lincoln')
    store.set(editedId, { ...store.get(editedId), defaultMinutes: 45, name: 'Memory card' })

    __resetActivityConfigSeedState()
    await ensureDefaultActivityConfigs('fam', 'lincoln')

    expect(store.get(editedId)).toMatchObject({ defaultMinutes: 45 })
  })

  it('keeps different children apart under the same family', async () => {
    await ensureDefaultActivityConfigs('fam', 'lincoln')
    __resetActivityConfigSeedState()
    getDocsCalls = 0
    await ensureDefaultActivityConfigs('fam', 'london')

    const ids = new Set(writtenIds())
    // Prayer + Handwriting are shared, so they collide by design; the other
    // eight are per-child and must not.
    expect(ids.size).toBe(DEFAULT_ACTIVITY_CONFIG_SEED.length + 8)
  })

  it('does NOT seed a generic default a legacy workbook already covers', async () => {
    // Codex round 1, P1 — a duplicate this run's own reconciliation introduced.
    // The retired inline list had no GATB entries, so a legacy family whose
    // `workbookConfigs` held Good and the Beautiful Reading got it exactly once,
    // from the conversion. The unified list seeds it as a default too, so
    // without this the family gets the generic default AND their real workbook:
    // two active configs for one curriculum, planning the same work twice.
    workbookDocs = [
      {
        id: 'wb-gatb-r',
        data: () => ({
          name: 'Good and the Beautiful Reading',
          subjectBucket: 'Reading',
          currentPosition: 34,
          totalUnits: 120,
          childId: 'lincoln',
        }),
      },
    ]

    await ensureDefaultActivityConfigs('fam', 'lincoln')

    const names = writtenDocs().map((d) => d.name)
    expect(names.filter((n) => n === 'Good and the Beautiful Reading')).toHaveLength(1)
    // And it is the CONVERTED row that survives — the one carrying the place
    // the child is actually up to. Keeping the generic default instead would
    // lose lesson 34.
    expect(writtenDocs().find((d) => d.name === 'Good and the Beautiful Reading')).toMatchObject({
      id: 'wb-wb-gatb-r',
      currentPosition: 34,
      totalUnits: 120,
    })
    // The default that nothing covered is untouched.
    expect(names).toContain('Good and the Beautiful Math')
  })

  it('claims the core default from a GATB VARIANT name, not just the exact one', async () => {
    // Codex round 2, P1 — the real legacy shape from
    // `functions/src/ai/workbookActivityConfigBackfill.test.ts`: a name of
    // "GATB Reading Level 1" with provider "gatb". Neither key equals
    // `goodandthebeautifulreading` nor `gatbreading`, so exact matching alone
    // left the generic Reading default in place beside the family's real book.
    workbookDocs = [
      {
        id: 'legacy1',
        data: () => ({
          name: 'GATB Reading Level 1',
          curriculum: { provider: 'gatb' },
          subjectBucket: 'Reading',
          currentPosition: 12,
          childId: 'lincoln',
        }),
      },
    ]

    await ensureDefaultActivityConfigs('fam', 'lincoln')

    const names = writtenDocs().map((d) => d.name)
    expect(names).not.toContain('Good and the Beautiful Reading')
    expect(names).toContain('GATB Reading Level 1')
    // Math is a different subject and nothing claimed it.
    expect(names).toContain('Good and the Beautiful Math')
  })

  it('suppresses a core workbook default for ANY workbook in that subject', async () => {
    // The subject rule is not a GATB alias list — it is the seed's actual
    // purpose. A family already using Explode the Code does not need a generic
    // GATB Reading planning 30m a day of a curriculum they do not own.
    workbookDocs = [
      {
        id: 'etc',
        data: () => ({ name: 'Explode the Code', subjectBucket: 'Reading', childId: 'lincoln' }),
      },
    ]

    await ensureDefaultActivityConfigs('fam', 'lincoln')

    const names = writtenDocs().map((d) => d.name)
    expect(names).not.toContain('Good and the Beautiful Reading')
    expect(names).toContain('Explode the Code')
    expect(names).toContain('Good and the Beautiful Math')
  })

  it('does NOT let a workbook suppress a non-workbook routine in the same subject', () => {
    // The subject rule is limited to workbook seeds on purpose. Booster cards,
    // Sight word games, Memory card, Knowledge Mine and Fluency Practice are all
    // Reading and none of them is a workbook — a family's reading book must not
    // delete their whole reading routine.
    const readingRoutines = DEFAULT_ACTIVITY_CONFIG_SEED.filter(
      (c) => c.subjectBucket === 'Reading' && c.type !== 'workbook',
    )
    expect(readingRoutines.length).toBeGreaterThan(0)
    return (async () => {
      workbookDocs = [
        {
          id: 'r1',
          data: () => ({ name: 'Some Reading Book', subjectBucket: 'Reading', childId: 'lincoln' }),
        },
      ]
      await ensureDefaultActivityConfigs('fam', 'lincoln')
      const names = writtenDocs().map((d) => d.name)
      for (const routine of readingRoutines) expect(names).toContain(routine.name)
    })()
  })

  it('an APP conversion does not claim the subject’s core workbook', async () => {
    // Reading Eggs is converted as `type: 'app'`, not a workbook — it is not the
    // child's reading book and must not stand in for one.
    workbookDocs = [
      {
        id: 'eggs',
        data: () => ({ name: 'Reading Eggs app', subjectBucket: 'Reading', childId: 'lincoln' }),
      },
    ]

    await ensureDefaultActivityConfigs('fam', 'lincoln')

    const written = writtenDocs()
    expect(written.find((d) => d.name === 'Reading Eggs app')).toMatchObject({ type: 'app' })
    expect(written.map((d) => d.name)).toContain('Good and the Beautiful Reading')
  })

  it('matches a legacy workbook on its curriculum provider, not only its name', async () => {
    workbookDocs = [
      {
        id: 'm1',
        data: () => ({
          name: 'Math book',
          curriculum: { provider: 'GATB Math' },
          subjectBucket: 'Math',
          childId: 'lincoln',
        }),
      },
    ]

    await ensureDefaultActivityConfigs('fam', 'lincoln')

    const names = writtenDocs().map((d) => d.name)
    expect(names).not.toContain('Good and the Beautiful Math')
    expect(names).toContain('Math book')
    // Reading is unclaimed, so its default still seeds.
    expect(names).toContain('Good and the Beautiful Reading')
  })

  it('converts legacy workbookConfigs under stable ids, alongside the defaults', async () => {
    workbookDocs = [
      {
        id: 'wbdoc1',
        data: () => ({ name: 'Explode the Code', subjectBucket: 'Reading', defaultMinutes: 20, childId: 'lincoln' }),
      },
    ]

    const written = await ensureDefaultActivityConfigs('fam', 'lincoln')

    // Nine defaults, not ten: this fixture is a Reading workbook, so it claims
    // the generic Reading default (Codex round 2) — plus itself.
    expect(written).toBe(DEFAULT_ACTIVITY_CONFIG_SEED.length - 1 + 1)
    expect(writtenIds()).toContain('wb-wbdoc1')
    // DATA-08: a workbook is per-child and never inherits a 'both' tag.
    const converted = writtenDocs().find((d) => d.id === 'wb-wbdoc1')
    expect(converted).toMatchObject({ childId: 'lincoln', type: 'workbook', scannable: true })
  })

  it('refuses to seed without a family or a child rather than writing a stray document', async () => {
    expect(await ensureDefaultActivityConfigs('', 'lincoln')).toBe(0)
    expect(await ensureDefaultActivityConfigs('fam', '')).toBe(0)
    expect(batches).toHaveLength(0)
  })

  it('releases the in-flight entry after a failure, so a retry can seed', async () => {
    const { getDocs } = await import('firebase/firestore')
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('offline'))

    await expect(ensureDefaultActivityConfigs('fam', 'lincoln')).rejects.toThrow('offline')
    // A stuck in-flight promise would mean the child never gets defaults for the
    // life of the tab.
    await expect(ensureDefaultActivityConfigs('fam', 'lincoln')).resolves.toBe(
      DEFAULT_ACTIVITY_CONFIG_SEED.length,
    )
  })
})
