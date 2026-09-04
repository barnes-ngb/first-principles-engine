import { describe, expect, it } from 'vitest'

import { auditArtifactChildIds } from './auditArtifactChildIds'
import type { AuditArtifactRow } from './auditArtifactChildIds'

// FEAT-183 (B14) — the read-only census behind the Dev tab's "Artifact childId
// Audit". Counts what the old kid Dad-Lab write left behind; changes nothing.

const CHILDREN = [
  { id: 'c-lincoln', name: 'Lincoln' },
  { id: 'c-london', name: 'London' },
]

function row(overrides: Partial<AuditArtifactRow> & { id: string }): AuditArtifactRow {
  return { title: 'Dad Lab photo', createdAt: '2026-08-01T00:00:00.000Z', ...overrides }
}

describe('auditArtifactChildIds', () => {
  it('counts artifacts keyed by a real child doc id as matched', () => {
    const audit = auditArtifactChildIds(
      [row({ id: 'a1', childId: 'c-lincoln' }), row({ id: 'a2', childId: 'c-london' })],
      CHILDREN,
    )
    expect(audit).toMatchObject({ total: 2, matched: 2, missing: 0 })
    expect(audit.stray).toEqual([])
  })

  it('groups the lowercase-name ids the old kid lab write produced', () => {
    const audit = auditArtifactChildIds(
      [
        row({ id: 'a1', childId: 'london' }),
        row({ id: 'a2', childId: 'london' }),
        row({ id: 'a3', childId: 'lincoln' }),
        row({ id: 'a4', childId: 'c-lincoln' }),
      ],
      CHILDREN,
    )
    expect(audit.matched).toBe(1)
    expect(audit.stray.map((g) => [g.childId, g.count])).toEqual([
      ['london', 2],
      ['lincoln', 1],
    ])
    expect(audit.stray[0]!.likelyChild).toEqual({ id: 'c-london', name: 'London' })
  })

  it('flags a stray id that matches no child, so a backfill can’t guess', () => {
    const audit = auditArtifactChildIds([row({ id: 'a1', childId: 'rowan' })], CHILDREN)
    expect(audit.stray[0]!.likelyChild).toBeUndefined()
  })

  it('reports a missing childId separately — that is a different bug', () => {
    const audit = auditArtifactChildIds(
      [row({ id: 'a1' }), row({ id: 'a2', childId: '' }), row({ id: 'a3', childId: 42 })],
      CHILDREN,
    )
    expect(audit).toMatchObject({ total: 3, matched: 0, missing: 3 })
    expect(audit.stray).toEqual([])
  })

  it('keeps a few checkable samples per group, capped', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ id: `a${i}`, childId: 'london', title: `Lab photo ${i}` }),
    )
    const [group] = auditArtifactChildIds(rows, CHILDREN).stray
    expect(group!.count).toBe(9)
    expect(group!.samples).toHaveLength(5)
    expect(group!.samples[0]).toMatchObject({ id: 'a0', title: 'Lab photo 0' })
  })

  it('orders groups by size, then id, so the report is stable', () => {
    const audit = auditArtifactChildIds(
      [
        row({ id: 'a1', childId: 'zeta' }),
        row({ id: 'a2', childId: 'alpha' }),
        row({ id: 'a3', childId: 'london' }),
        row({ id: 'a4', childId: 'london' }),
      ],
      CHILDREN,
    )
    expect(audit.stray.map((g) => g.childId)).toEqual(['london', 'alpha', 'zeta'])
  })
})
