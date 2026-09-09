import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Codex round 4 (UX-324) — the hook must not carry one child's goal rows into
 * another child's subscription.
 *
 * `GoalBuilder` seeds its draft from `milestones`. While the effect resubscribed
 * for the new child it left the previous child's rows in state, so the builder
 * seeded the new child from the old child's stack — the same cross-child
 * overwrite the builder fix was supposed to close, arriving through the data
 * rather than through the draft.
 */
const SRC = readFileSync(resolve(__dirname, './useBusinessGoal.ts'), 'utf8')

describe('useBusinessGoal — no rows survive a child change', () => {
  it('clears the milestones before resubscribing', () => {
    const effectBody = SRC.slice(SRC.indexOf('useEffect('), SRC.indexOf('const saveMilestones'))
    const clearAt = effectBody.indexOf('setMilestones([])\n    setLoading(true)')
    expect(clearAt).toBeGreaterThan(-1)
    // …and it happens BEFORE the subscription is opened, not in its callback.
    expect(clearAt).toBeLessThan(effectBody.indexOf('onSnapshot('))
  })

  it('is keyed on the child, so the change actually re-runs it', () => {
    expect(SRC).toMatch(/\}, \[familyId, childId\]\)/)
  })
})
