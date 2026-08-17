import { describe, expect, it } from 'vitest'

import type { ChecklistItem } from '../../core/types'
import { celebrationEarned, computeQuestProgress } from './kidQuestGate'

function item(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    label: 'Quest',
    completed: false,
    category: 'must-do',
    ...overrides,
  }
}

describe('computeQuestProgress — skip is parent-only (FUNC-08)', () => {
  it('a parent-skipped item is dropped from the kid\'s remaining/to-do set', () => {
    const checklist: ChecklistItem[] = [
      item({ label: 'Prayer', completed: true }),
      item({ label: 'Phonics', skipped: true }),
      item({ label: 'Math' }),
      item({ label: 'Handwriting' }),
    ]
    const p = computeQuestProgress(checklist)
    // Remaining excludes both completed AND skipped → only Math + Handwriting remain.
    expect(p.mustDoRemaining).toBe(2)
  })

  it('a parent-skipped item is NOT counted as completed', () => {
    const checklist: ChecklistItem[] = [
      item({ label: 'Prayer', completed: true }),
      item({ label: 'Phonics', skipped: true }),
      item({ label: 'Math' }),
    ]
    const p = computeQuestProgress(checklist)
    expect(p.mustDoCompleted).toBe(1) // only Prayer
    expect(p.mustDoSkipped).toBe(1) // Phonics
    expect(p.mustDoDone).toBe(false) // Math still open → day not done
  })

  it('counts stay honest: completed / total / skipped are independent tallies', () => {
    const checklist: ChecklistItem[] = [
      item({ completed: true }),
      item({ skipped: true }),
      item({}),
    ]
    const p = computeQuestProgress(checklist)
    expect(p.mustDoCompleted).toBe(1)
    expect(p.mustDo.length).toBe(3)
    expect(p.mustDoSkipped).toBe(1)
  })
})

describe('computeQuestProgress — a skip resolves, it never strands (UX-72)', () => {
  it('one skip + the rest completed → the day is done and the gate unlocks', () => {
    // Pre-UX-72 this day was unfinishable: mustDoDone required every item
    // `completed`, so Craft stayed locked behind "Complete your quests…" with
    // zero completable quests left.
    const p = computeQuestProgress([
      item({ completed: true }),
      item({ completed: true }),
      item({ skipped: true }),
    ])
    expect(p.mustDoRemaining).toBe(0)
    expect(p.mustDoDone).toBe(true)
    expect(p.gateUnlocked).toBe(true)
  })

  it('a mid-day skip shrinks the gate bar — completing the remaining 2 of 2 completable unlocks', () => {
    const skippedMidDay = [
      item({ label: 'Prayer' }),
      item({ label: 'Math' }),
      item({ label: 'Phonics', skipped: true }),
    ]
    // Threshold is computed over completable items: min(3, 3 - 1) = 2.
    const before = computeQuestProgress(skippedMidDay)
    expect(before.gateThreshold).toBe(2)
    expect(before.gateUnlocked).toBe(false)

    // Kid completes the two quests still in front of him → unlocked.
    const after = computeQuestProgress([
      item({ label: 'Prayer', completed: true }),
      item({ label: 'Math', completed: true }),
      item({ label: 'Phonics', skipped: true }),
    ])
    expect(after.gateUnlocked).toBe(true)
    expect(after.mustDoDone).toBe(true)
  })

  it('ALL must-dos skipped → gate unlocked and day resolved, but nothing celebrated', () => {
    // Decided edge: a parent who cleared the whole day chose an empty day;
    // the Workshop is not a second punishment. Open — not celebrated.
    const p = computeQuestProgress([
      item({ skipped: true }),
      item({ skipped: true }),
      item({ skipped: true }),
    ])
    expect(p.mustDoDone).toBe(true)
    expect(p.gateThreshold).toBe(0)
    expect(p.gateUnlocked).toBe(true)
    // …and no "you did it!" over zero completions:
    expect(p.mustDoCompleted).toBe(0)
    expect(celebrationEarned(p.mustDoDone, p.mustDoCompleted)).toBe(false)
  })

  it('a skip still earns and completes nothing — it only stops blocking', () => {
    const p = computeQuestProgress([
      item({ completed: true }),
      item({ skipped: true }),
      item({ skipped: true }),
    ])
    expect(p.mustDoCompleted).toBe(1) // skips advance no completion count
    expect(p.mustDoSkipped).toBe(2)
    expect(p.mustDoRemaining).toBe(0)
    expect(p.mustDoDone).toBe(true)
    // Real work happened → this day IS celebrated.
    expect(celebrationEarned(p.mustDoDone, p.mustDoCompleted)).toBe(true)
  })

  it('skipping an already-COMPLETED row never shrinks the bar (Codex P2, PR #1686)', () => {
    // The parent skip toggle preserves `completed`, so a row can be both. A
    // completed row is real work still holding the bar up — if it also shrank
    // the threshold, skipping a done row would unlock over a quest still open.
    const p = computeQuestProgress([
      item({ label: 'Prayer', completed: true, skipped: true }),
      item({ label: 'Math', completed: true }),
      item({ label: 'Phonics' }),
    ])
    expect(p.gateThreshold).toBe(3) // only skipped-and-incomplete rows shrink it
    expect(p.gateUnlocked).toBe(false) // Phonics is still open
    expect(p.mustDoDone).toBe(false)

    // …and completing the open quest unlocks as usual.
    const after = computeQuestProgress([
      item({ label: 'Prayer', completed: true, skipped: true }),
      item({ label: 'Math', completed: true }),
      item({ label: 'Phonics', completed: true }),
    ])
    expect(after.gateUnlocked).toBe(true)
    expect(after.mustDoDone).toBe(true)
  })

  it('characterization: zero must-dos behaves as before — no done flag, gate open', () => {
    const p = computeQuestProgress([])
    expect(p.mustDoDone).toBe(false)
    expect(p.gateThreshold).toBe(0)
    expect(p.gateUnlocked).toBe(true)
  })

  it('characterization: no skips anywhere → identical results to the old computation', () => {
    const p = computeQuestProgress([
      item({ completed: true }),
      item({ completed: true }),
      item({}),
      item({}),
    ])
    expect(p.mustDoDone).toBe(false)
    expect(p.gateThreshold).toBe(3)
    expect(p.gateUnlocked).toBe(false)
    expect(p.mustDoRemaining).toBe(2)
  })
})

describe('celebrationEarned — celebration requires real work (UX-72)', () => {
  it('a resolved day with completions celebrates; a skip-only day stays quiet', () => {
    expect(celebrationEarned(true, 2)).toBe(true)
    expect(celebrationEarned(true, 0)).toBe(false) // fully-skipped: open, not celebrated
    expect(celebrationEarned(false, 2)).toBe(false) // unfinished never celebrates
  })
})
