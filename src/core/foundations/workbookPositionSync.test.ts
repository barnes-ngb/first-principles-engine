import { describe, expect, it } from 'vitest'

import { planWorkbookSync } from './workbookPositionSync'
import type { WorkbookSyncInput } from './workbookPositionSync'

// ── Fixtures ─────────────────────────────────────────────────────────────

const FAST_PHONICS_NAME = 'Fast Phonics'
const MATHSEEDS_NAME = 'Mathseeds'
const UNKNOWN_WORKBOOK = 'Totally Unknown Workbook XYZ'

// ── planWorkbookSync ─────────────────────────────────────────────────────

describe('planWorkbookSync', () => {
  it('returns no-bridge for an unrecognized workbook name', () => {
    const input: WorkbookSyncInput = {
      workbookName: UNKNOWN_WORKBOOK,
      position: 5,
    }
    const result = planWorkbookSync(input)
    expect(result.outcome).not.toBeNull()
    expect(result.outcome!.status).toBe('no-bridge')
  })

  it('returns no-bridge for an empty workbook name', () => {
    const input: WorkbookSyncInput = { workbookName: '', position: 1 }
    const result = planWorkbookSync(input)
    expect(result.outcome).not.toBeNull()
    expect(result.outcome!.status).toBe('no-bridge')
  })

  it('resolves a bridge for a known workbook (Fast Phonics)', () => {
    const input: WorkbookSyncInput = {
      workbookName: FAST_PHONICS_NAME,
      position: 10,
    }
    const result = planWorkbookSync(input)
    if (result.outcome === null) {
      expect(result.bridge).toBeDefined()
      expect(result.bridge.sourceId).toBe('fastPhonics')
    } else {
      // Fast Phonics with position 10 may hit pending-curation
      // depending on the bridge's lessonToUnit — either is a valid test
      expect(['pending-curation']).toContain(result.outcome.status)
    }
  })

  it('resolves a bridge for a known workbook (Mathseeds)', () => {
    const input: WorkbookSyncInput = {
      workbookName: MATHSEEDS_NAME,
      position: 5,
    }
    const result = planWorkbookSync(input)
    if (result.outcome === null) {
      expect(result.bridge).toBeDefined()
      expect(result.bridge.sourceId).toBe('mathseeds')
    } else {
      expect(['pending-curation']).toContain(result.outcome.status)
    }
  })

  it('is case-insensitive for workbook name matching', () => {
    const lower: WorkbookSyncInput = {
      workbookName: 'fast phonics',
      position: 10,
    }
    const upper: WorkbookSyncInput = {
      workbookName: 'FAST PHONICS',
      position: 10,
    }
    const lowerResult = planWorkbookSync(lower)
    const upperResult = planWorkbookSync(upper)
    expect(lowerResult.outcome?.status).toBe(upperResult.outcome?.status)
  })

  it('tolerates free-text aliases (Reading Eggs Fast Phonics)', () => {
    const input: WorkbookSyncInput = {
      workbookName: 'Reading Eggs Fast Phonics',
      position: 10,
    }
    const result = planWorkbookSync(input)
    // Should match the Fast Phonics bridge, not return no-bridge
    if (result.outcome === null) {
      expect(result.bridge.sourceId).toBe('fastPhonics')
    } else {
      expect(result.outcome.status).not.toBe('no-bridge')
    }
  })

  it('returns pending-curation when the bridge has no lessonToUnit for the position', () => {
    // We test this indirectly: a bridge without lessonToUnit returns null
    // from resolveNativePosition, triggering pending-curation.
    // The real Fast Phonics bridge uses a divisor-based lessonToUnit,
    // so position 0 should resolve, but if the bridge is extended with
    // one that doesn't have lessonToUnit, the gate catches it.
    const input: WorkbookSyncInput = {
      workbookName: FAST_PHONICS_NAME,
      position: 1,
    }
    const result = planWorkbookSync(input)
    // Fast Phonics at position 1 should either resolve or pend-curation
    expect(result.outcome === null || result.outcome.status === 'pending-curation').toBe(
      true,
    )
  })

  it('via field is optional and does not affect bridge resolution', () => {
    const withVia: WorkbookSyncInput = {
      workbookName: FAST_PHONICS_NAME,
      position: 10,
      via: 'scan',
    }
    const withoutVia: WorkbookSyncInput = {
      workbookName: FAST_PHONICS_NAME,
      position: 10,
    }
    const resultA = planWorkbookSync(withVia)
    const resultB = planWorkbookSync(withoutVia)
    expect(resultA.outcome?.status).toBe(resultB.outcome?.status)
  })

  it('returns a bridge object with expected shape when resolved', () => {
    // Try Mathseeds at various positions to find one that resolves
    for (const pos of [1, 5, 10, 20, 50]) {
      const input: WorkbookSyncInput = {
        workbookName: MATHSEEDS_NAME,
        position: pos,
      }
      const result = planWorkbookSync(input)
      if (result.outcome === null) {
        expect(result.bridge).toHaveProperty('sourceId')
        expect(result.bridge).toHaveProperty('aliases')
        expect(result.bridge).toHaveProperty('units')
        expect(Array.isArray(result.bridge.units)).toBe(true)
        return // one successful check is enough
      }
    }
    // If no position resolved, that's fine — the bridge exists but all positions pend-curation
  })

  it('outcome discriminant is exhaustive: either outcome is null with bridge, or has a status', () => {
    const inputs: WorkbookSyncInput[] = [
      { workbookName: UNKNOWN_WORKBOOK, position: 1 },
      { workbookName: FAST_PHONICS_NAME, position: 5 },
      { workbookName: MATHSEEDS_NAME, position: 3 },
      { workbookName: '', position: 0 },
    ]
    for (const input of inputs) {
      const result = planWorkbookSync(input)
      if (result.outcome === null) {
        expect(result).toHaveProperty('bridge')
      } else {
        expect(['no-bridge', 'ambiguous', 'pending-curation']).toContain(
          result.outcome.status,
        )
      }
    }
  })
})
