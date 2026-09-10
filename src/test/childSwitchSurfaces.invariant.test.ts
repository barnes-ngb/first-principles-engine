import { describe, expect, it } from 'vitest'

import { loadCensus, loadSourceFiles, CENSUS_PATH } from './childSwitchSources'
import {
  censusProblems,
  CHILD_SWITCH_VERDICTS,
  classifyCandidate,
  deriveChildSwitchCandidates,
  parseCensusRows,
  submitsChildPositionally,
  type SourceFile,
} from './childSwitchSurfaces'

/**
 * The fixture rows below all name `RecordsPage`, so the row-is-still-a-candidate
 * rule (Codex round 3) needs it present. Supplying it explicitly keeps that rule
 * unconditional — a candidate-list-shaped escape hatch would be the vacuous
 * guard this file exists to avoid.
 */
const RECORDS_PAGE = {
  path: 'src/features/records/RecordsPage.tsx',
  arm: 'hook',
} as const

/**
 * UX-329 — a surface cannot join the child-switch class unclassified.
 *
 * `UX-324` made the active child changeable from the shell; PR #1817 then found
 * the same class of defect in a different mounted editor on five consecutive
 * review rounds, because **nothing in the repo knew the list existed**. This is
 * the list, derived from the source: every file that resolves a child identity,
 * holds React state that can outlive a change to it, and writes, must carry a
 * verdict in `docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`.
 *
 * It is modelled on `[ledger-shape]` (PR #1814), whose lesson is that a guard
 * which passes on malformed input is worse than no guard — so this one FAILS
 * CLOSED, and the last block below proves it fails by feeding it a deliberately
 * unclassified surface and a deliberately broken census rather than asserting
 * that it would.
 */

const files = loadSourceFiles()
const candidates = deriveChildSwitchCandidates(files)
const census = loadCensus()
const rows = parseCensusRows(census)
const existing = new Set(files.map((f) => f.path))

describe('the child-switch surface census is complete and current', () => {
  it('reads a census that actually parsed', () => {
    // The [ledger-shape] failure mode: a rule that reads nothing reports PASS
    // on everything. A census whose table yields no rows is a broken census.
    expect(rows.length, `${CENSUS_PATH} produced no surface rows`).toBeGreaterThan(0)
  })

  it('classifies every derived candidate', () => {
    const problems = censusProblems(candidates, rows, existing).filter(
      (p) => p.kind === 'unclassified',
    )
    expect(
      problems.map((p) => p.message),
      'a new surface joined the child-switch class without declaring what a switch means for it',
    ).toEqual([])
  })

  it('has no stale, duplicated, blank or mis-worded rows', () => {
    const problems = censusProblems(candidates, rows, existing).filter(
      (p) => p.kind !== 'unclassified',
    )
    expect(problems.map((p) => `[${p.kind}] ${p.message}`)).toEqual([])
  })

  it('names only the five verdicts, in the census prose as well as its table', () => {
    // The vocabulary is the run's main product; a sixth word in the document
    // would be a sixth answer nobody agreed to.
    for (const verdict of CHILD_SWITCH_VERDICTS) {
      expect(census, `the census never defines ${verdict}`).toContain(`**${verdict}**`)
    }
  })

  it('still sees the six surfaces PR #1817 fixed', () => {
    // A heuristic that stopped matching the known members of the class would
    // pass this suite by seeing nothing. These are the fixes it was derived
    // from, so they are the floor.
    const known = [
      'src/features/books/CreateSightWordBook.tsx',
      'src/features/workshop/WorkshopPage.tsx',
      'src/features/business/GoalBuilder.tsx',
      'src/features/business/useBusinessGoal.ts',
      'src/core/hooks/useCreativeTimer.ts',
      'src/features/records/QuickAddHours.tsx',
    ]
    const found = new Set(candidates.map((c) => c.path))
    for (const path of known) {
      expect(found.has(path), `${path} is no longer derived as a candidate`).toBe(true)
    }
  })

  it('still sees the four surfaces UX-329 fixed', () => {
    const found = new Set(candidates.map((c) => c.path))
    for (const path of [
      'src/features/records/RecordsPage.tsx',
      'src/features/business/SaleEntryForm.tsx',
      'src/features/business/KitBuilderForm.tsx',
      // Codex round 1 on PR #1820: invisible to the first heuristic, because
      // it delegates its write through a POSITIONAL child argument.
      'src/features/progress/CertificateScanSection.tsx',
    ]) {
      expect(found.has(path), `${path} is no longer derived as a candidate`).toBe(true)
    }
  })
})

/**
 * The guard must FAIL on the input it exists to catch. Asserting that it passes
 * on the real tree proves only that the tree is currently clean — it says
 * nothing about whether the rule can fire at all.
 */
describe('the guard fails closed', () => {
  const unclassified: SourceFile = {
    path: 'src/features/pretend/NewEditor.tsx',
    source: `
      import { useState } from 'react'
      import { useActiveChild } from '../../core/hooks/useActiveChild'
      export default function NewEditor() {
        const { activeChildId } = useActiveChild()
        const [note, setNote] = useState('')
        return { activeChildId, note, setNote }
      }
      const write = () => addDoc(col, { childId: activeChildId })
    `,
  }

  it('sees a deliberately unclassified surface', () => {
    expect(classifyCandidate(unclassified)).toEqual({
      path: unclassified.path,
      arm: 'hook',
    })
  })

  it('reports it as unclassified against the real census', () => {
    const problems = censusProblems(
      [...candidates, classifyCandidate(unclassified)!],
      rows,
      new Set([...existing, unclassified.path]),
    )
    expect(problems.map((p) => p.kind)).toContain('unclassified')
    expect(problems.some((p) => p.message.includes('NewEditor.tsx'))).toBe(true)
  })

  it('sees a component that submits through a callback prop, not only a direct write', () => {
    // `SaleEntryForm` — one of this run's three P1s — writes nothing itself; it
    // hands `{ childId, ... }` to an `onLogSale` prop. A write-only predicate
    // would have missed it, which is exactly the hole that let it sit unnoticed.
    expect(
      classifyCandidate({
        path: 'src/features/pretend/PropForm.tsx',
        source: `
          import { useState } from 'react'
          export default function PropForm({ childId, onLog }: { childId: string; onLog: (x: unknown) => void }) {
            const [amount, setAmount] = useState('')
            return onLog({
              childId,
              amount,
            })
          }
        `,
      }),
    ).toEqual({ path: 'src/features/pretend/PropForm.tsx', arm: 'prop' })
  })

  it('rejects a census that parses to nothing', () => {
    const problems = censusProblems(candidates, parseCensusRows('# no table here'), existing)
    expect(problems.map((p) => p.kind)).toEqual(['empty-census'])
  })

  it('rejects a malformed row rather than reading past it', () => {
    const broken = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a | b | c |\n',
    )
    const problems = censusProblems([RECORDS_PAGE], broken, existing)
    expect(problems.map((p) => p.kind)).toContain('bad-shape')
  })

  it('rejects a blank cell and an invented verdict', () => {
    const blank = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a |  | c | BIND | P1 |\n',
    )
    expect(censusProblems([RECORDS_PAGE], blank, existing).map((p) => p.kind)).toContain('blank-cell')

    const invented = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a | b | c | DEFER | P1 |\n',
    )
    expect(censusProblems([RECORDS_PAGE], invented, existing).map((p) => p.kind)).toContain('bad-verdict')
  })

  /**
   * Codex round 2, P2 — the first version accepted any cell that merely
   * CONTAINED a recognised token, so a row reading only `**SAFE**` passed while
   * the census's own rule is that an unexplained SAFE is the row that comes
   * back as a P1. A guard a contributor can silence with one word is paperwork.
   */
  it('rejects a verdict that names a token but gives no reason', () => {
    const bare = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a | b | c | **SAFE** | — |\n',
    )
    expect(censusProblems([RECORDS_PAGE], bare, existing).map((p) => p.kind)).toContain(
      'unexplained-verdict',
    )
  })

  it('applies the reason rule to every verdict, not only SAFE', () => {
    // An unexplained BIND is exactly as opaque to the next reader.
    for (const verdict of CHILD_SWITCH_VERDICTS) {
      const bare = parseCensusRows(
        `| \`src/features/records/RecordsPage.tsx\` | a | b | c | **${verdict}** | — |\n`,
      )
      expect(
        censusProblems([RECORDS_PAGE], bare, existing).map((p) => p.kind),
        `${verdict} with no reason was accepted`,
      ).toContain('unexplained-verdict')
    }
  })

  it('accepts a verdict that says why', () => {
    const explained = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a | b | c | **SAFE** — every write addresses a document by its own id, never the live child | — |\n',
    )
    expect(censusProblems([RECORDS_PAGE], explained, existing).map((p) => p.kind)).not.toContain(
      'unexplained-verdict',
    )
  })

  /**
   * Codex round 3, P2 — `stale-row` asked only whether the FILE still exists,
   * so a surface refactored out of the class kept its row, and because it was
   * also absent from `candidates` the unclassified loop could not see the
   * mismatch either. The guard stayed green while every published total stopped
   * describing the derived set.
   */
  it('rejects a row for a file that is no longer a candidate', () => {
    const orphan = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a | b | c | **SAFE** — nothing here writes with the live child at all | — |\n',
    )
    // The file exists, so `stale-row` is silent; the row is no longer derived.
    expect(censusProblems([], orphan, existing).map((p) => p.kind)).toContain(
      'not-a-candidate',
    )
    expect(censusProblems([RECORDS_PAGE], orphan, existing).map((p) => p.kind)).not.toContain(
      'not-a-candidate',
    )
  })

  /**
   * Codex round 3, P2 — a delegated write whose child id sits AFTER a nested
   * call was invisible: the flat `[^()]*` stopped at the inner paren. The
   * balance is counted now rather than matched, which also avoids the
   * catastrophic backtracking the obvious nested-quantifier repair caused.
   */
  it('sees a child id passed after a nested call argument', () => {
    expect(submitsChildPositionally('await onSave(buildDraft(state), activeChildId)')).toBe(true)
    expect(submitsChildPositionally('applyUpdate(familyId, activeChildId, pendingResult)')).toBe(true)
    expect(submitsChildPositionally('log(a(b(c)), d(e), childId)')).toBe(true)
  })

  it('does not read a declaration or a property access as a submit', () => {
    // A grouping paren and an arrow's parameter list are not calls.
    expect(submitsChildPositionally('interface P { childId: string }')).toBe(false)
    expect(submitsChildPositionally('const x = (childId) => childId')).toBe(false)
    expect(submitsChildPositionally('const id = row.childId')).toBe(false)
  })

  it('rejects a row naming a file that no longer exists', () => {
    const stale = parseCensusRows(
      '| `src/features/gone/Deleted.tsx` | a | b | c | SAFE | — |\n',
    )
    expect(censusProblems([RECORDS_PAGE], stale, existing).map((p) => p.kind)).toContain('stale-row')
  })

  it('rejects the same surface listed twice', () => {
    const dupe = parseCensusRows(
      '| `src/features/records/RecordsPage.tsx` | a | b | c | RESET | P1 |\n' +
        '| `src/features/records/RecordsPage.tsx` | a | b | c | SAFE | — |\n',
    )
    expect(censusProblems([RECORDS_PAGE], dupe, existing).map((p) => p.kind)).toContain('duplicate-row')
  })
})
