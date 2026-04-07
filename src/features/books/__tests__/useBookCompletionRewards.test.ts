import { describe, expect, it } from 'vitest'
import { shouldTriggerBookCompletionRewards } from '../useBook'

describe('book completion reward gating', () => {
  it('triggers rewards when transitioning draft -> complete', () => {
    expect(shouldTriggerBookCompletionRewards('draft', 'complete')).toBe(true)
  })

  it('does not retrigger rewards when already complete', () => {
    expect(shouldTriggerBookCompletionRewards('complete', 'complete')).toBe(false)
  })

  it('does not trigger rewards for non-completion updates', () => {
    expect(shouldTriggerBookCompletionRewards('complete', undefined)).toBe(false)
    expect(shouldTriggerBookCompletionRewards('draft', undefined)).toBe(false)
  })
})
