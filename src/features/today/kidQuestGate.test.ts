import { describe, expect, it } from 'vitest'

import type { ChecklistItem } from '../../core/types'
import { computeQuestProgress } from './kidQuestGate'

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

  it('the unlock gate keys off completion, never off a skip', () => {
    // Threshold is min(3, mustDo.length) = 3. Two completed + one skipped must NOT unlock.
    const skippedNotUnlocked = computeQuestProgress([
      item({ completed: true }),
      item({ completed: true }),
      item({ skipped: true }),
    ])
    expect(skippedNotUnlocked.gateThreshold).toBe(3)
    expect(skippedNotUnlocked.gateUnlocked).toBe(false)

    // Three genuinely completed → unlocked.
    const completedUnlocks = computeQuestProgress([
      item({ completed: true }),
      item({ completed: true }),
      item({ completed: true }),
    ])
    expect(completedUnlocks.gateUnlocked).toBe(true)
  })

  it('"X of N done" denominator includes the skipped item but the numerator does not', () => {
    const checklist: ChecklistItem[] = [
      item({ completed: true }),
      item({ skipped: true }),
      item({}),
    ]
    const p = computeQuestProgress(checklist)
    // Displayed as "{mustDoCompleted} of {mustDo.length} done, {mustDoSkipped} skipped"
    expect(p.mustDoCompleted).toBe(1)
    expect(p.mustDo.length).toBe(3)
    expect(p.mustDoSkipped).toBe(1)
  })

  it('a day where the only open item is parent-skipped still counts as not done', () => {
    // Two completed, one skipped — kid completed everything they could; skip ≠ complete,
    // so mustDoDone stays false (parent skip does not auto-finish the day).
    const p = computeQuestProgress([
      item({ completed: true }),
      item({ completed: true }),
      item({ skipped: true }),
    ])
    expect(p.mustDoRemaining).toBe(0)
    expect(p.mustDoDone).toBe(false)
  })
})
