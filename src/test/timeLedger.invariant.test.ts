/**
 * The time-and-evidence registry fails closed — AUDIT-234.
 *
 * `docs/review/TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md` §5 lists every file
 * that writes or reads the four collections a day's time and evidence live in.
 * A census that is only a document is a document that goes stale the next time
 * somebody adds a door — which is precisely how this repo arrived at four
 * surfaces answering *"we did some Language Arts today"* in three collections
 * (UX-361) and at an hours reader nobody knew was counting its own way.
 *
 * So the list is derived from the source and this file is the rule that keeps
 * it honest. Six ways it reddens, each of which has cost a review round
 * somewhere in this repo:
 *
 *   • a file names one of the collections and has **no row**;
 *   • a row names a file that is **not** one (renamed, deleted, or never was);
 *   • a file is listed **twice**;
 *   • a row has a **blank cell** — an unexplained row is the one that comes back
 *     as a P1 (`UX-329`'s unexplained SAFE, in a new place);
 *   • the derived `Collections` cell **disagrees with the source**;
 *   • the derived `Role` cell **disagrees with the source**.
 *
 * And the seventh, which is not about a row at all: a table that **parses to
 * nothing**. `[ledger-shape]`'s lesson is that a guard passing on malformed
 * input is worse than no guard, so the parse is asserted to find a real table
 * before any of the above is believed.
 *
 * The last test proves the guard can fail, by feeding it a surface that is not
 * in the document.
 */

import { describe, expect, it } from 'vitest'

import { loadCensus, loadSourceFiles } from './timeLedgerSources'
import {
  Role,
  TIME_COLLECTIONS,
  censusProblems,
  deriveRole,
  deriveTimeLedgerSurfaces,
  namesCollection,
  parseCensusRows,
  tallyCollections,
  tallyRoles,
} from './timeLedgerSurfaces'

const files = loadSourceFiles()
const surfaces = deriveTimeLedgerSurfaces(files)
const rows = parseCensusRows(loadCensus())

describe('the registry parses to a real table', () => {
  it('finds rows at all — a guard on malformed input is worse than no guard', () => {
    expect(rows.length).toBeGreaterThan(40)
  })

  it('derives surfaces at all — an empty scan would pass every check below', () => {
    expect(surfaces.length).toBeGreaterThan(40)
    expect(files.length).toBeGreaterThan(200)
  })

  it('covers both projects — the counting rule is compiled by both (ARCH-47)', () => {
    expect(surfaces.some((s) => s.path.startsWith('src/'))).toBe(true)
    expect(surfaces.some((s) => s.path.startsWith('functions/src/'))).toBe(true)
  })

  it('finds at least one file naming each of the four collections', () => {
    const counts = tallyCollections(surfaces)
    for (const collection of TIME_COLLECTIONS) {
      expect(counts[collection], `no file names ${collection}`).toBeGreaterThan(0)
    }
  })
})

describe('every surface that touches the time record has an honest row', () => {
  it('has no problems at all', () => {
    const problems = censusProblems(surfaces, rows)
    expect(
      problems.map((p) => `${p.kind}: ${p.path} — ${p.detail}`),
      'the registry disagrees with the source',
    ).toEqual([])
  })

  it('covers exactly the derived set, in both directions', () => {
    expect(rows.map((r) => r.path).sort()).toEqual(surfaces.map((s) => s.path).sort())
  })
})

describe('the classification rule itself', () => {
  it('tells the two hours collections apart', () => {
    const code = 'hoursAdjustmentsCollection(familyId)'
    expect(namesCollection(code, 'hoursAdjustments')).toBe(true)
    expect(namesCollection(code, 'hours')).toBe(false)
  })

  it('does not read `dailyPlans` or `dayLogId` as the `days` collection', () => {
    expect(namesCollection('dailyPlansCollection(familyId)', 'days')).toBe(false)
    expect(namesCollection('const id = data.dayLogId', 'days')).toBe(false)
    expect(namesCollection('daysCollection(familyId)', 'days')).toBe(true)
  })

  it('reads the functions side’s raw paths', () => {
    expect(
      namesCollection('db.collection(`families/${familyId}/hours`)', 'hours'),
    ).toBe(true)
    expect(namesCollection('familyDoc.ref.collection("days")', 'days')).toBe(true)
  })

  it('counts a guarded day write as a write', () => {
    // Every `days` write routes through `today/dayWriteGuard.ts`, so a file
    // whose whole job is the write names no raw verb at all.
    expect(deriveRole('await setDayLogGuarded(ref, payload)')).toBe(Role.Write)
    expect(deriveRole('const snap = await getDocs(q)')).toBe(Role.Read)
    expect(deriveRole('await addDoc(c, x); const s = await getDocs(q)')).toBe(Role.Both)
  })

  it('ignores a collection named only in prose', () => {
    const commentOnly = `/** Writes to hoursCollection(familyId) one day. */\nexport const x = 1`
    expect(deriveTimeLedgerSurfaces([{ path: 'x.ts', source: commentOnly }])).toEqual([])
  })
})

describe('the numbers the census prints', () => {
  it('splits the surfaces by role with nothing left over', () => {
    const roles = tallyRoles(surfaces)
    expect(roles.WRITE + roles.READ + roles.BOTH).toBe(surfaces.length)
  })
})

// ── The proof that it can fail ──────────────────────────────────────────────

describe('the guard fails closed', () => {
  it('reports a surface the document does not classify', () => {
    const problems = censusProblems(
      [
        ...surfaces,
        {
          path: 'src/features/nowhere/NewHoursDoor.tsx',
          collections: ['hours'],
          role: Role.Write,
        },
      ],
      rows,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0].kind).toBe('unclassified')
    expect(problems[0].path).toBe('src/features/nowhere/NewHoursDoor.tsx')
  })

  it('reports a row whose file no longer names a collection', () => {
    const problems = censusProblems(surfaces, [
      ...rows,
      {
        path: 'src/features/gone/Deleted.tsx',
        collections: ['hours'],
        role: 'WRITE',
        fold: 'x',
        note: 'y',
      },
    ])
    expect(problems.map((p) => p.kind)).toEqual(['not-a-candidate'])
  })

  it('reports a row whose derived cells have gone stale', () => {
    const first = rows[0]
    const problems = censusProblems(surfaces, [
      ...rows.filter((r) => r.path !== first.path),
      { ...first, role: 'READ', collections: ['artifacts'] },
    ])
    const kinds = problems.map((p) => p.kind).sort()
    expect(kinds).toContain('wrong-collections')
    expect(kinds).toContain('wrong-role')
  })

  it('reports a row with an empty explanation', () => {
    const first = rows[0]
    const problems = censusProblems(surfaces, [
      ...rows.filter((r) => r.path !== first.path),
      { ...first, note: '' },
    ])
    expect(problems.map((p) => p.kind)).toEqual(['blank-cell'])
  })

  it('reports the same file listed twice', () => {
    const problems = censusProblems(surfaces, [...rows, rows[0]])
    expect(problems.map((p) => p.kind)).toEqual(['duplicate'])
  })
})
