import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PlanType } from '../../core/types/enums'
import { weekEnergyLabel } from './weekEnergyLabels'

/**
 * FEAT-200: the planner does not plan a Life Day, and structurally cannot.
 *
 * A Life Day is the opposite of a plan — nothing was arranged in advance and the
 * job is to record what happened. So it is a choice the parent makes ON the day,
 * on Today, and never something a week plan hands them. That is true today by
 * construction (`useDailyPlan` is the only writer of `dailyPlans`, and it lives
 * in `features/today/`), which makes it exactly the kind of property that can be
 * broken later without anyone noticing. This pins it.
 *
 * A regression guard, not a fail-pre-fix assertion: it held before FEAT-200 too.
 */

const PLANNER_DIR = join(import.meta.dirname, '.')

function plannerSources(): { file: string; text: string }[] {
  return readdirSync(PLANNER_DIR)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((file) => ({ file, text: readFileSync(join(PLANNER_DIR, file), 'utf8') }))
}

describe('the planner cannot plan a Life Day', () => {
  it('never writes a plan type at all', () => {
    // `dailyPlans` is where a day's kind is stored. The planner writes weeks and
    // days; the kind of day is Today's to record.
    for (const { file, text } of plannerSources()) {
      expect(text, `${file} reaches the dailyPlans collection`).not.toMatch(
        /dailyPlansCollection|dailyPlanDocId/,
      )
    }
  })

  it('never names the Life member', () => {
    for (const { file, text } of plannerSources()) {
      expect(text, `${file} references PlanType.Life`).not.toMatch(/PlanType\.Life/)
    }
  })

  it('keeps its own week-energy choices to the three it always had', () => {
    const values = ['full', 'lighter', 'mvd'] as const
    for (const value of values) {
      const label = weekEnergyLabel(value, 2.5)
      expect(label).toBeTruthy()
      expect(label.toLowerCase()).not.toContain('life')
    }
    // And the planner's union is not the app's PlanType union — a Life Day is
    // reachable only through Today's day-type control.
    expect(Object.values(PlanType)).toContain('life')
    expect(values as readonly string[]).not.toContain('life')
  })
})
