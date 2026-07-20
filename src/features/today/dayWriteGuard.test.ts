import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayBlock, DayLog } from '../../core/types'

// ── Firestore mocks ──────────────────────────────────────────────────────────
// Guard writers read the live doc, assert preservation, then write. We mock the
// raw Firestore verbs so the read→assert→write contract is testable without
// Firebase (per CLAUDE.md).
const getDoc = vi.fn()
const setDoc = vi.fn()
const updateDoc = vi.fn()
const deleteDoc = vi.fn()
vi.mock('firebase/firestore', () => ({
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
}))

import {
  DayPreservationError,
  assertDayPreservation,
  dayLogPreservationSummary,
  deleteDayLogGuarded,
  findDayPreservationViolations,
  mergeDayLogGuarded,
  setDayLogGuarded,
  updateDayLogGuarded,
} from './dayWriteGuard'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Item',
  completed: false,
  ...over,
})
const block = (over: Partial<DayBlock>): DayBlock => ({
  type: 'Reading',
  ...over,
})
const day = (over: Partial<DayLog>): DayLog => ({
  childId: 'lincoln1',
  date: '2026-07-20',
  blocks: [],
  ...over,
})

const ref = { id: '2026-07-20_lincoln1' } as never

// ── Pure comparison: findDayPreservationViolations ───────────────────────────
describe('findDayPreservationViolations', () => {
  it('permits creating a fresh doc (no before)', () => {
    expect(
      findDayPreservationViolations(undefined, {
        checklist: [item({ completed: true })],
        blocks: [],
      }),
    ).toEqual([])
  })

  it('permits an additive write (completions + minutes only grow)', () => {
    const before = {
      checklist: [item({ label: 'Reading', completed: true })],
      blocks: [block({ title: 'Reading', actualMinutes: 20 })],
    }
    const after = {
      checklist: [
        item({ label: 'Reading', completed: true }),
        item({ label: 'Math', completed: true }),
      ],
      blocks: [
        block({ title: 'Reading', actualMinutes: 20 }),
        block({ title: 'Math', actualMinutes: 15 }),
      ],
    }
    expect(findDayPreservationViolations(before, after)).toEqual([])
  })

  it('permits un-checking a completed item — identity survives (parent authority)', () => {
    const before = {
      checklist: [item({ label: 'Reading', completed: true })],
      blocks: [block({ title: 'Reading', actualMinutes: 20 })],
    }
    // Un-check: item still present, completed flips false, block minutes cleared.
    const after = {
      checklist: [item({ label: 'Reading', completed: false })],
      blocks: [block({ title: 'Reading', actualMinutes: undefined })],
    }
    expect(findDayPreservationViolations(before, after)).toEqual([])
  })

  it('permits reducing a retained block’s minutes (manual correction)', () => {
    const before = { checklist: [], blocks: [block({ title: 'Math', actualMinutes: 30 })] }
    const after = { checklist: [], blocks: [block({ title: 'Math', actualMinutes: 10 })] }
    expect(findDayPreservationViolations(before, after)).toEqual([])
  })

  // ── Violation class 1: dropped completion ──
  it('REJECTS dropping a completed item (the FEAT-111/redo filter bug)', () => {
    const before = {
      checklist: [
        item({ label: 'Reading', completed: true, source: 'planner' }),
        item({ label: 'Math', completed: false, source: 'planner' }),
      ],
      blocks: [],
    }
    // The "keep only manual" filter drops the completed planner item.
    const after = { checklist: [], blocks: [] }
    const v = findDayPreservationViolations(before, after)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatch(/drops 1 completed item/)
    expect(v[0]).toMatch(/Reading/)
  })

  // ── Violation class 2: reduced/dropped block minutes ──
  it('REJECTS dropping a block that carried logged minutes', () => {
    const before = {
      checklist: [],
      blocks: [
        block({ title: 'Reading', actualMinutes: 20, source: 'planner' }),
        block({ title: 'Empty', source: 'planner' }),
      ],
    }
    const after = { checklist: [], blocks: [] }
    const v = findDayPreservationViolations(before, after)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatch(/drops 1 block\(s\) with logged minutes/)
    expect(v[0]).toMatch(/Reading/)
  })

  // ── Violation class 3: dropped evidence ──
  it('REJECTS dropping evidence from a retained item', () => {
    const before = {
      checklist: [
        item({
          label: 'Workbook',
          completed: true,
          evidenceArtifactId: 'scan_abc',
          evidenceCollection: 'scans',
        }),
      ],
      blocks: [],
    }
    // Item retained + still completed, but evidence stripped.
    const after = {
      checklist: [item({ label: 'Workbook', completed: true })],
      blocks: [],
    }
    const v = findDayPreservationViolations(before, after)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatch(/drops evidence from 1 item/)
  })

  it('reports multiple violation classes at once', () => {
    const before = {
      checklist: [item({ label: 'Reading', completed: true, evidenceArtifactId: 'a1' })],
      blocks: [block({ title: 'Reading', actualMinutes: 20 })],
    }
    const after = { checklist: [], blocks: [] }
    const v = findDayPreservationViolations(before, after)
    expect(v).toHaveLength(3)
  })

  it('handles duplicate-label completed items via multiset counting', () => {
    const before = {
      checklist: [
        item({ label: 'Reading', completed: true }),
        item({ label: 'Reading', completed: true }),
      ],
      blocks: [],
    }
    // Only one of the two completed "Reading" items survives → one dropped.
    const after = { checklist: [item({ label: 'Reading', completed: true })], blocks: [] }
    const v = findDayPreservationViolations(before, after)
    expect(v[0]).toMatch(/drops 1 completed item/)
  })
})

// ── assertDayPreservation ────────────────────────────────────────────────────
describe('assertDayPreservation', () => {
  it('throws a named DayPreservationError on violation and logs at warn+', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const before = { checklist: [item({ label: 'X', completed: true })], blocks: [] }
    const after = { checklist: [], blocks: [] }
    expect(() => assertDayPreservation(before, after, 'unit-test')).toThrow(
      DayPreservationError,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('refusing to persist unit-test'))
    warn.mockRestore()
  })

  it('does not throw for a legitimate write', () => {
    expect(() =>
      assertDayPreservation(
        { checklist: [], blocks: [] },
        { checklist: [item({ completed: true })], blocks: [] },
        'ok',
      ),
    ).not.toThrow()
  })

  it('enforce:false logs the anomaly at warn+ but does NOT throw (interactive lane)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const before = { checklist: [item({ label: 'X', completed: true })], blocks: [] }
    const after = { checklist: [], blocks: [] }
    expect(() =>
      assertDayPreservation(before, after, 'today-save', { enforce: false }),
    ).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('anomaly on trusted write today-save'))
    warn.mockRestore()
  })
})

// ── dayLogPreservationSummary ────────────────────────────────────────────────
describe('dayLogPreservationSummary', () => {
  it('counts completed items and sums logged block minutes', () => {
    const d = day({
      checklist: [item({ completed: true }), item({ completed: false }), item({ completed: true })],
      blocks: [block({ actualMinutes: 20 }), block({ actualMinutes: 15 }), block({})],
    })
    expect(dayLogPreservationSummary(d)).toEqual({ completedItems: 2, minutesLogged: 35 })
  })

  it('is zero for an empty/absent day', () => {
    expect(dayLogPreservationSummary(undefined)).toEqual({ completedItems: 0, minutesLogged: 0 })
    expect(dayLogPreservationSummary(day({}))).toEqual({ completedItems: 0, minutesLogged: 0 })
  })
})

// ── Guarded writers ──────────────────────────────────────────────────────────
describe('guarded writers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDoc.mockResolvedValue(undefined)
    updateDoc.mockResolvedValue(undefined)
    deleteDoc.mockResolvedValue(undefined)
  })

  it('setDayLogGuarded writes a legitimate full-doc payload', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ label: 'R', completed: true })], blocks: [] }),
    })
    const payload = day({
      checklist: [item({ label: 'R', completed: true }), item({ label: 'M', completed: true })],
      blocks: [],
    })
    await setDayLogGuarded(ref, payload, 'apply-plan')
    expect(setDoc).toHaveBeenCalledOnce()
    expect(setDoc).toHaveBeenCalledWith(ref, payload)
  })

  it('setDayLogGuarded refuses (throws, no write) a payload that drops a completion', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ label: 'R', completed: true })], blocks: [] }),
    })
    const payload = day({ checklist: [], blocks: [] })
    await expect(setDayLogGuarded(ref, payload, 'redo')).rejects.toBeInstanceOf(
      DayPreservationError,
    )
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('setDayLogGuarded with enforce:false writes through a rename of a completed item (interactive lane)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Before: a completed, id-less item labeled "Reading (20m)".
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ label: 'Reading (20m)', completed: true })], blocks: [] }),
    })
    // After: the same item renamed — strict identity-by-label would read this as
    // a dropped completion, but the interactive lane must let the parent rename.
    const payload = day({ checklist: [item({ label: 'Reading aloud (20m)', completed: true })], blocks: [] })
    await setDayLogGuarded(ref, payload, 'today-save', { enforce: false })
    expect(setDoc).toHaveBeenCalledWith(ref, payload)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('anomaly on trusted write'))
    warn.mockRestore()
  })

  it('setDayLogGuarded creates a fresh doc when none exists', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const payload = day({ checklist: [item({ completed: true })], blocks: [] })
    await setDayLogGuarded(ref, payload, 'default-create')
    expect(setDoc).toHaveBeenCalledWith(ref, payload)
  })

  it('updateDayLogGuarded merges partial against before and writes when safe', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ label: 'Quest', completed: false })], blocks: [] }),
    })
    const partial = { checklist: [item({ label: 'Quest', completed: true })] }
    await updateDayLogGuarded(ref, partial, 'quest-autocomplete')
    expect(updateDoc).toHaveBeenCalledWith(ref, partial)
  })

  it('updateDayLogGuarded refuses a partial that would drop a completion', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ label: 'Done', completed: true })], blocks: [] }),
    })
    await expect(
      updateDayLogGuarded(ref, { checklist: [] }, 'bad-update'),
    ).rejects.toBeInstanceOf(DayPreservationError)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('mergeDayLogGuarded leaves checklist/blocks untouched → writes with merge', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ completed: true })], blocks: [block({ actualMinutes: 20 })] }),
    })
    const partial = { workshop: { done: true, gamesPlayed: 2 } }
    await mergeDayLogGuarded(ref, partial, 'workshop')
    expect(setDoc).toHaveBeenCalledWith(ref, partial, { merge: true })
  })

  it('deleteDayLogGuarded deletes an empty day without force', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => day({ checklist: [], blocks: [] }) })
    await deleteDayLogGuarded(ref, 'sunday-sweep')
    expect(deleteDoc).toHaveBeenCalledWith(ref)
  })

  it('deleteDayLogGuarded refuses a day with completed work unless forced', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => day({ checklist: [item({ completed: true })], blocks: [block({ actualMinutes: 20 })] }),
    })
    await expect(deleteDayLogGuarded(ref, 'sunday-sweep')).rejects.toBeInstanceOf(
      DayPreservationError,
    )
    expect(deleteDoc).not.toHaveBeenCalled()

    // …but force deletes it (after a human confirms the counts).
    await deleteDayLogGuarded(ref, 'sunday-sweep', { force: true })
    expect(deleteDoc).toHaveBeenCalledWith(ref)
  })
})
