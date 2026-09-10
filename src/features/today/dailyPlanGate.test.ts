import { describe, expect, it } from 'vitest'

import { dailyPlanGateNote, dailyPlanIsEditable } from './dailyPlanGate'

/**
 * UX-345 — the rule behind the gate, on its own.
 *
 * The hook test beside this one proves the plan is cleared and the write is
 * refused; this proves the rule those depend on says the right thing for every
 * state, including the two that used to be indistinguishable — a read that
 * resolved to nothing and a read that failed.
 */
describe('dailyPlanIsEditable', () => {
  const settled = { isLoading: false, loadFailed: false, hasTarget: true }

  it('is editable only once a successful read has settled', () => {
    expect(dailyPlanIsEditable(settled)).toBe(true)
  })

  it('is not editable while the read is open — the window the defect lived in', () => {
    expect(dailyPlanIsEditable({ ...settled, isLoading: true })).toBe(false)
  })

  it('is not editable after a FAILED read, which is not an empty result', () => {
    // The `useBusinessGoal` rule, third instance. The write replaces `sessions`
    // under `merge: true`, so treating a dropped read as "no sessions" empties
    // a day rather than reporting itself.
    expect(dailyPlanIsEditable({ ...settled, loadFailed: true })).toBe(false)
  })

  it('is not editable with no child to write to', () => {
    expect(dailyPlanIsEditable({ ...settled, hasTarget: false })).toBe(false)
  })
})

describe('dailyPlanGateNote', () => {
  it('says a failed read failed, and never that the day is empty', () => {
    const note = dailyPlanGateNote({ isLoading: false, loadFailed: true, hasTarget: true })
    expect(note).toMatch(/couldn't read/i)
    expect(note).not.toMatch(/no plan|nothing planned/i)
  })

  it('distinguishes waiting from failing', () => {
    expect(dailyPlanGateNote({ isLoading: true, loadFailed: false, hasTarget: true }))
      .toMatch(/loading/i)
  })

  it('says nothing when the controls are live, or when there is no child', () => {
    expect(dailyPlanGateNote({ isLoading: false, loadFailed: false, hasTarget: true })).toBeNull()
    expect(dailyPlanGateNote({ isLoading: true, loadFailed: false, hasTarget: false })).toBeNull()
  })
})
