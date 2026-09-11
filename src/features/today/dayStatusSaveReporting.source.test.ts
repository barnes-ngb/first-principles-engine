import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const TODAY_PAGE = readFileSync(resolve(__dirname, './TodayPage.tsx'), 'utf8')
const DAY_STATUS_ROW = readFileSync(resolve(__dirname, './DayStatusRow.tsx'), 'utf8')

/**
 * UX-352 — every `saveDailyPlan` call site READS the answer.
 *
 * The hook now says whether a tap landed, but an answer nobody reads is the
 * silence it replaced. `TodayPage` has two call sites today (energy and day
 * type) and the next one will be added by somebody who has not read this file,
 * so the rail is structural rather than a pair of assertions about two
 * handlers: a bare `void saveDailyPlan(...)` fails here.
 *
 * Deliberately a source scan and not a render test. What it protects is a
 * property of the call SITES, and a component test proves it only for the paths
 * that test happens to exercise — which is exactly how the original defect
 * survived a green suite.
 *
 * POSITIVE CONTROL: drop `.then(` from either handler and the first case fails.
 */
describe('the day-status controls report what the write answered', () => {
  it('no saveDailyPlan call ignores its outcome', () => {
    const calls = TODAY_PAGE.match(/saveDailyPlan\([^)]*\)[^\n]*/g) ?? []
    // The two handlers, and nothing destructured from the hook (that line reads
    // `saveDailyPlan,` with no parenthesis).
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call, `unreported saveDailyPlan: ${call}`).toMatch(/\.then\(/)
    }
  })

  it('routes every refusal through the one shared copy', () => {
    // Not a sentence written inline at the call site — `dailyPlanGate` owns what
    // this surface says while it cannot be written, in both directions.
    expect(TODAY_PAGE).toMatch(/dailyPlanSaveFailureNotice/)
    expect(TODAY_PAGE).toMatch(/dailyPlanGateNote/)
  })

  it('keeps the UX-345 gate on both controls — this run does not weaken it', () => {
    // The gate is RIGHT: it is what stops one child's `sessions` being written
    // onto his brother's day. Only its silence was the defect.
    expect(DAY_STATUS_ROW).toMatch(/disabled=\{!planSettled\}/)
    expect(DAY_STATUS_ROW).toMatch(/canEditDayType && planSettled/)
  })
})
