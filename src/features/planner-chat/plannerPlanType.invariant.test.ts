import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PlanType } from '../../core/types/enums'
import { weekEnergyLabel } from './weekEnergyLabels'

/**
 * Who may set a day to a Life Day, and through what.
 *
 * ── The rule this file used to hold, and why it changed ──────────────────────
 *
 * FEAT-200 pinned "the planner does not plan a Life Day, and structurally
 * cannot": a Life Day is the opposite of a plan — nothing was arranged in
 * advance and the job is to record what happened — so it was a choice made ON
 * the day, on Today, and never something a week plan handed a parent. No
 * planner file could name `PlanType.Life` or reach `dailyPlans` at all.
 *
 * **UX-261 reverses that on the owner's own report**, and the reversal is the
 * point rather than an oversight:
 *
 *   *"While planning we added in the chat that Tuesday Thursday would be packing
 *   days and only packing and tablet activities — the layout didn't seem to
 *   adjust."*
 *
 * A family knows on Sunday that Tuesday is a packing day. Making them wait until
 * Tuesday morning to say so meant the plan generated fifteen routine rows for a
 * day everybody already knew was gone, and the only way to say otherwise was a
 * sentence to a model that a MUST-DO rule at the top of the prompt overrode. The
 * premise that survived FEAT-200 — *a Life Day is not a plan* — is still true and
 * is still enforced: a Life day writes **no checklist, no block and no minute**.
 * What changed is only WHEN the parent may say so.
 *
 * ── So the rule narrows rather than disappearing ─────────────────────────────
 *
 * Each of the three properties below is the FEAT-200 guard with one named
 * exception, and each exception is a single file. The point of a source scan is
 * that a second file acquiring this power is a red test rather than a discovery.
 */

const PLANNER_DIR = join(import.meta.dirname, '.')

/** The one file allowed to write `dailyPlans` — the single Apply. */
const DAILY_PLANS_WRITER = 'applyWeekPlan.ts'

/** The one file allowed to decide that a day is a Life Day. */
const PLAN_TYPE_RESOLVER = 'plannerDayTypes.ts'

function plannerSources(): { file: string; text: string }[] {
  return readdirSync(PLANNER_DIR)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((file) => ({ file, text: readFileSync(join(PLANNER_DIR, file), 'utf8') }))
}

describe('only the single Apply may set a day type', () => {
  it('reaches `dailyPlans` from exactly one file', () => {
    const reaching = plannerSources()
      .filter(({ text }) => /dailyPlansCollection|dailyPlanDocId/.test(text))
      .map(({ file }) => file)
    expect(reaching).toEqual([DAILY_PLANS_WRITER])
  })

  it('names `PlanType.Life` in exactly one file', () => {
    // `plannedPlanTypeWrite` is the whole decision: Life in, Life out; anything
    // else writes nothing unless it is taking a day back OUT of Life. Apply
    // calls it and does not second-guess it.
    const naming = plannerSources()
      .filter(({ text }) => /PlanType\.Life/.test(text))
      .map(({ file }) => file)
    expect(naming).toEqual([PLAN_TYPE_RESOLVER])
  })

  it('writes a plan type only for a day the PARENT set — never one a model returned', () => {
    // The AI plan, its truncation repair, its recovery parse and the local
    // fallback generator all produce `DraftWeeklyPlan`s, and none of them can
    // produce a day type: the picks live in their own `dayTypes` config, keyed
    // by weekday, written only by the day-type control. So a model cannot set a
    // family's Tuesday aside, and cannot un-set one either.
    const resolver = readFileSync(join(PLANNER_DIR, PLAN_TYPE_RESOLVER), 'utf8')
    expect(resolver).not.toMatch(/parseAIResponse|aiChat|ChatResponse/)

    const parser = readFileSync(join(PLANNER_DIR, 'chatPlanner.logic.ts'), 'utf8')
    expect(parser).not.toMatch(/PlanType|dayType/)
  })
})

describe('a set-aside day is still not a plan', () => {
  it('gives a Life day no items, so Apply writes it no checklist and no minute', async () => {
    // The half of FEAT-200's rule that did NOT change, asserted here rather than
    // only in `plannerDayTypes.test.ts` because it is the reason the reversal
    // above is safe: `applicableDays` skips a day with no accepted items, so a
    // set-aside day gets no DayLog write at all.
    const { enforceDayTypes } = await import('./plannerDayTypes')
    const { applicableDays } = await import('./applyWeekPlan')
    const { DayType, SubjectBucket } = await import('../../core/types/enums')

    const draft = {
      days: [
        {
          day: 'Tuesday',
          timeBudgetMinutes: 260,
          items: [
            {
              id: 'i1',
              title: 'GATB Math',
              subjectBucket: SubjectBucket.Math,
              estimatedMinutes: 30,
              skillTags: [],
              accepted: true,
            },
          ],
        },
      ],
      skipSuggestions: [],
    } as never

    const shaped = enforceDayTypes(draft, [{ day: 'Tuesday', dayType: DayType.Life }], [])
    expect(applicableDays(shaped)).toEqual([])
  })
})

describe('the planner\'s week energy is untouched', () => {
  it('keeps its own week-energy choices to the three it always had', () => {
    const values = ['full', 'lighter', 'mvd'] as const
    for (const value of values) {
      const label = weekEnergyLabel(value)
      expect(label).toBeTruthy()
      expect(label.toLowerCase()).not.toContain('life')
    }
    // The planner's WEEK-level union is still not the app's PlanType union: a
    // whole week cannot be set aside, only a day at a time, one tap each.
    expect(Object.values(PlanType)).toContain('life')
    expect(values as readonly string[]).not.toContain('life')
  })
})
