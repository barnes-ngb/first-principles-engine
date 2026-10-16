import { describe, expect, it } from 'vitest'
import type { ChecklistItem, DayLog } from '../../core/types'
import { resolvePreCompletionScanIndex, type PreCompletionScanTarget } from './preCompletionScanIdentity'

/**
 * The identity rule that binds a scan result to ONE row of a plan.
 *
 * ── What changed under this file (before-work page check) ────────────────────
 * The handler cases that used to live here — the camera closure, the legacy
 * identity preparation, the `scanned: true` row write, the out-of-order
 * publication — tested the pre-completion scan door, which asked a prospective
 * question ("should he skip this lesson?") through the retrospective pipeline:
 * it wrote `activityConfigs`, `childSkillMaps` and the row's `scanned` flag, and
 * it prepared checklist identities so it could. That door now opens the
 * before-work page check, which writes nothing and therefore binds no row and
 * prepares no identity, so those cases no longer describe anything the app does.
 * Their successors are the prospective contract's own tests:
 *
 *  - `beforeWorkPageCheck.test.ts` — the answer, and the five ways it may be
 *    inconclusive;
 *  - `useBeforeWorkPageCheck.test.tsx` — the gate, duplicate taps, cancel,
 *    retry, A-B-A and late answers;
 *  - `beforeWorkPageCheckHost.test.ts` — the real Today wiring, and the proof
 *    that the path writes none of the records the old one did.
 *
 * The rule below is NOT dead: `resolvePreCompletionScanIndex` still guards the
 * retrospective result panel's binding on Today, which this run left alone.
 */

const scope = { familyId: 'family', childId: 'child', dateKey: '2026-09-15' }
const row = (id?: string): ChecklistItem => ({ ...(id !== undefined ? { id } : {}), label: 'Workbook', completed: false })
const day = (rows: ChecklistItem[]): DayLog => ({ childId: scope.childId, date: scope.dateKey, checklist: rows, blocks: [] })
const target: PreCompletionScanTarget = { ...scope, itemId: 'original', scanId: 'scan-A' }

describe('persistent scan identity', () => {
  it('resolves only the original ID after reorder, never a same-name replacement', () => {
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row('other'), row('original')]))).toBe(1)
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row('replacement')]))).toBeNull()
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row('original'), row('original')]))).toBeNull()
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row()]))).toBeNull()
  })

  it.each(['familyId', 'childId', 'dateKey', 'scanId', 'itemId'] as const)('rejects a mismatched %s binding', (field) => {
    expect(resolvePreCompletionScanIndex({ ...target, [field]: 'wrong' }, scope, 'scan-A', day([row('original')]))).toBeNull()
  })

  it('binds nothing at all when no target was published', () => {
    // The state the page is now permanently in: the before-work door publishes
    // no target, so the retrospective panel has nothing to bind to.
    expect(resolvePreCompletionScanIndex(null, scope, 'scan-A', day([row('original')]))).toBeNull()
  })
})
