import { describe, expect, it } from 'vitest'

import type { CurriculumSnapshot } from '../../core/types'
import {
  computeObservedCoverage,
  NO_BASELINE_NOTICE,
} from '../planner-chat/pace.logic'
import { STRAND_UNIT_LABEL } from './strand'

// ── A strand has no total, and nothing downstream may pretend it does ────────
//
// This is the integration UX-281 was most likely to produce a lie in. The
// parent-only observed-coverage line (UX-213) reads `currentPosition` /
// `totalUnits` off the weekly position snapshot, and a strand supplies the
// first without the second.
//
// The good news, asserted here rather than assumed: BOTH halves already
// degrade honestly, and neither needed changing.
//
//   • the server's `toCurriculumPositions` keys on the PRESENCE of a
//     `currentPosition`, not on `type === 'workbook'`, so a strand is recorded
//     in the snapshot with no code change; and
//   • `positionPhrase` omits the denominator when `totalUnits` is absent, and
//     `computeObservedCoverage` reads `unitLabel || 'lesson'`.
//
// So a strand reads "History — session 14. 4 sessions in 3 weeks (since Aug
// 17)." — true, useful, and with no total invented anywhere in it. If a later
// change starts printing "of 0", "of undefined" or "lessons" for a strand,
// these fail.

const snapshot = (
  recordedAt: string,
  currentPosition: number,
): CurriculumSnapshot => ({
  recordedAt,
  weekKey: recordedAt.slice(0, 10),
  positions: [
    {
      configId: 'strand-history',
      name: 'History',
      currentPosition,
      // No `totalUnits` — the whole point.
      unitLabel: STRAND_UNIT_LABEL,
    },
  ],
})

describe('a strand in the observed-coverage rate', () => {
  const baseline = snapshot('2026-08-17T01:00:00.000Z', 10)
  const current = snapshot('2026-09-07T01:00:00.000Z', 14)

  it('reports the rate in sessions, and prints no total', () => {
    const result = computeObservedCoverage(current, [baseline])
    expect(result.entries).toHaveLength(1)
    const [entry] = result.entries

    expect(entry.kind).toBe('covered')
    expect(entry.unitsCovered).toBe(4)
    expect(entry.totalUnits).toBeUndefined()
    expect(entry.line).toBe('History — session 14. 4 sessions in 3 weeks (since Aug 17).')
  })

  it('never prints a denominator it does not have', () => {
    const { entries } = computeObservedCoverage(current, [baseline])
    for (const entry of entries) {
      expect(entry.line).not.toMatch(/ of /)
      expect(entry.line).not.toMatch(/undefined|NaN|of 0\b|%/)
    }
  })

  it('says sessions, not lessons', () => {
    const { entries } = computeObservedCoverage(current, [baseline])
    expect(entries[0].line).toContain('sessions')
    expect(entries[0].line).not.toContain('lesson')
  })

  it('reports a quiet strand plainly — no lessons language, nothing red', () => {
    const unchanged = snapshot('2026-09-07T01:00:00.000Z', 10)
    const { entries } = computeObservedCoverage(unchanged, [baseline])
    expect(entries[0].kind).toBe('none')
    expect(entries[0].line).toBe(
      'History — session 10. No sessions covered in 3 weeks (since Aug 17).',
    )
  })

  it('says a rate needs two, rather than estimating from one', () => {
    const result = computeObservedCoverage(current, [])
    expect(result.entries).toEqual([])
    expect(result.notice).toBe(NO_BASELINE_NOTICE)
  })

  it('a never-logged strand carries no position and so says nothing at all', () => {
    // `toCurriculumPositions` drops a config with no `currentPosition`, so a
    // strand created but never run contributes no entry — silence, not a zero.
    const empty: CurriculumSnapshot = { recordedAt: current.recordedAt, weekKey: '', positions: [] }
    const result = computeObservedCoverage(empty, [baseline])
    expect(result.entries).toEqual([])
    expect(result.notice).toBeNull()
  })
})
