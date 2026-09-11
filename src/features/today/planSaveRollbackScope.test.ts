import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DailyPlanSaveRefusal,
  dailyPlanSaveFailureNotice,
  dailyPlanSaveMovedOnNotice,
  dailyPlanSaveSupersededNotice,
} from './dailyPlanGate'
import {
  DayWriteAftermath,
  DayWriteRefusal,
  dayWriteFailureNotice,
} from './dayWriteOutcome'

const TODAY_PAGE = readFileSync(resolve(__dirname, './TodayPage.tsx'), 'utf8')

/**
 * Codex round 1, P1 — a rollback must never cross a child.
 *
 * `TodayPage` restores the energy and plan type it captured before an optimistic
 * tap. A save left in flight across a child switch would restore ONE CHILD'S
 * values onto another child's page, where the restore effect would not clear
 * them (it only re-runs when `dailyPlan` moves) and the next tap would persist
 * one of them into the brother's document — `UX-345` again, through the rollback
 * written to report it.
 *
 * The failure is still reported. Silence is what this run exists to end, so
 * "don't roll back" may never become "say nothing".
 *
 * POSITIVE CONTROL: drop the `planTargetRef.current !== target` branch and the
 * first case fails; drop the `setSnackMessage` inside it and the second fails.
 */
describe('the plan-save rollback is scoped to the day it was made on', () => {
  it('compares the tap’s target against a LIVE read, not a captured one', () => {
    // A value captured in `reportPlanSave`'s dependencies would be the OLD
    // child — the `.then` closed over the callback as it stood at the tap — so
    // the comparison has to go through a ref.
    expect(TODAY_PAGE).toMatch(/planTargetRef\.current !== target/)
    expect(TODAY_PAGE).toMatch(/planTargetRef\.current = `\$\{selectedChildId\}\|\$\{today\}`/)
    // Both handlers capture the target at the tap and hand it to the reporter.
    expect(TODAY_PAGE.match(/reportPlanSave\(outcome, target, seq,/g) ?? []).toHaveLength(2)
  })

  it('still reports the failure when it declines to roll back', () => {
    const moved = TODAY_PAGE.slice(TODAY_PAGE.indexOf('planTargetRef.current !== target'))
    const branch = moved.slice(0, moved.indexOf('return\n      }'))
    expect(branch).toMatch(/setSnackMessage\(dailyPlanSaveMovedOnNotice\(/)
    // And does NOT restore either value.
    expect(branch).not.toMatch(/setEnergy\(/)
    expect(branch).not.toMatch(/setPlanType\(/)
  })
})

describe('what a moved-on page says', () => {
  it('names the child it belonged to, and says nothing here changed', () => {
    const { text, severity } = dailyPlanSaveMovedOnNotice('Lincoln')

    expect(severity).toBe('error')
    expect(text).toContain('Lincoln')
    expect(text).toContain('nothing here was changed')
  })

  it('carries no pronoun — a name is not a gender', () => {
    for (const name of ['Lincoln', null]) {
      const { text } = dailyPlanSaveMovedOnNotice(name)
      expect(text).not.toMatch(/\b(his|her|their|hers|theirs)\b/i)
    }
  })

  it('works with no name rather than printing an id or an empty gap', () => {
    const { text } = dailyPlanSaveMovedOnNotice(null)

    expect(text).toMatch(/^Not saved — /)
    expect(text).not.toContain('  ')
  })

  it('is still an error, like every other unrecorded edit on this page', () => {
    expect(dailyPlanSaveMovedOnNotice(null).severity).toBe('error')
    expect(dailyPlanSaveFailureNotice(DailyPlanSaveRefusal.Rejected).severity).toBe('error')
  })
})

describe('the same rule on the day log', () => {
  it('does not name a checklist row over a day it is no longer showing', () => {
    // A row title on another child's page reads as a claim about that page.
    const moved = dayWriteFailureNotice(
      DayWriteRefusal.Rejected,
      'Language Arts lesson 4 (20m)',
      DayWriteAftermath.MovedOn,
    )

    expect(moved.text).not.toContain('Language Arts lesson 4')
    expect(moved.text).toContain('before you switched')
    expect(moved.text).toContain('Nothing here was changed')
    expect(moved.severity).toBe('error')
  })

  it('still names the row on the page the edit was made on', () => {
    const here = dayWriteFailureNotice(
      DayWriteRefusal.Rejected,
      'Language Arts lesson 4 (20m)',
      DayWriteAftermath.RolledBack,
    )

    expect(here.text).toContain('Language Arts lesson 4 (20m)')
  })

  it('defaults to the page it was made on when nothing is said', () => {
    expect(dayWriteFailureNotice(DayWriteRefusal.Rejected, 'Math (20m)').text).toContain(
      'Math (20m)',
    )
  })
})

/**
 * Codex round 2, P1 — a sentence may not claim a rollback that did not happen.
 *
 * The rollback is identity-guarded on both surfaces, so it does not always
 * apply. *"It's back to how it was"* over a screen that was NOT put back is the
 * same species of lie as *"Saved"* over a write that did not land.
 */
describe('the copy is keyed on what actually happened', () => {
  it('a superseded day-log failure does not say the row went back', () => {
    const text = dayWriteFailureNotice(
      DayWriteRefusal.Rejected,
      'Math lesson 12 (20m)',
      DayWriteAftermath.Superseded,
    ).text

    expect(text).not.toContain('back to how it was')
    expect(text).toContain('Math lesson 12 (20m)')
    expect(text).toContain('newer change')
  })

  it('a rolled-back day-log failure is the one that says so', () => {
    expect(
      dayWriteFailureNotice(
        DayWriteRefusal.Rejected,
        'Math lesson 12 (20m)',
        DayWriteAftermath.RolledBack,
      ).text,
    ).toContain('back to how it was')
  })

  it('every aftermath still reports, and always as an error', () => {
    for (const aftermath of Object.values(DayWriteAftermath)) {
      const notice = dayWriteFailureNotice(DayWriteRefusal.Rejected, 'A row', aftermath)
      expect(notice.severity).toBe('error')
      expect(notice.text.length).toBeGreaterThan(0)
    }
  })

  it('the plan controls have the same superseded sentence', () => {
    const { text, severity } = dailyPlanSaveSupersededNotice()

    expect(severity).toBe('error')
    expect(text).not.toContain('back to how it was')
    expect(text).toContain('newer change')
  })
})

describe('the plan rollback is guarded against a newer tap on the same day', () => {
  it('takes a sequence with every tap and compares it live', () => {
    // Energy and plan type are enum strings with no object identity, so the
    // day log's identity guard becomes a monotonic sequence here. Without it,
    // two rejections in submission order leave the page showing the FIRST
    // failed edit, and a later tap persists that stale value.
    expect(TODAY_PAGE).toMatch(/const seq = \(planEditSeqRef\.current \+= 1\)/)
    expect(TODAY_PAGE).toMatch(/planEditSeqRef\.current !== seq/)
    expect(TODAY_PAGE.match(/const seq = \(planEditSeqRef\.current \+= 1\)/g) ?? []).toHaveLength(2)
  })

  it('rolls back to the STORED plan, not to a value that may never have landed', () => {
    // After two failures in a row the second tap's "previous" is the first
    // tap's optimistic value, which was never written. The stored document is
    // the only thing known to have landed; the captured values are the fallback
    // for when there is no stored plan — an unsettled or failed read, where
    // nothing was written either.
    expect(TODAY_PAGE).toMatch(/const stored = storedPlanRef\.current/)
    expect(TODAY_PAGE).toMatch(/stored && stored\.childId === target\.split\('\|'\)\[0\]/)
    expect(TODAY_PAGE).toMatch(/: \{ energy: prevEnergy, planType: prevPlanType \}/)
  })
})
