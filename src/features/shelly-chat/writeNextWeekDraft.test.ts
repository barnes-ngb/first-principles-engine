// ── FEAT-150: the chat's next-week write lane ────────────────────────────────
//
// Two properties matter here and nothing else does, because the write itself is
// the planner's extracted Apply and is characterized in `applyWeekPlan.test.ts`:
//
//   1. **The rail.** Only next week is writable. The current week and the week
//      after next are refused BEFORE `applyDraftWeek` is reached — asserted by
//      the mock never being called, not merely by the return value.
//   2. **The routing.** What reaches the shared Apply is what the chat means:
//      no lesson-card map, no `readAloudBookId`, and the real capability.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

const { applyDraftWeekMock } = vi.hoisted(() => ({ applyDraftWeekMock: vi.fn() }))

vi.mock('../planner-chat/applyWeekPlan', async () => {
  const actual =
    await vi.importActual<typeof import('../planner-chat/applyWeekPlan')>(
      '../planner-chat/applyWeekPlan',
    )
  return { ...actual, applyDraftWeek: applyDraftWeekMock }
})

import { WeekApplyError } from '../planner-chat/applyWeekPlan'
import { NEXT_WEEK_NOTICES } from './nextWeekActions'
import { writeNextWeekDraft } from './writeNextWeekDraft'

const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Chicago'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

/** Tue 2026-08-18 local noon. Next week starts Sunday 2026-08-23. */
const NOW = new Date(2026, 7, 18, 12, 0, 0)
const NEXT_WEEK_START = '2026-08-23'
const CURRENT_WEEK_START = '2026-08-16'
const WEEK_AFTER_NEXT_START = '2026-08-30'

const draft: DraftWeeklyPlan = {
  days: [
    {
      day: 'Monday',
      timeBudgetMinutes: 120,
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
  minimumWin: 'Read together',
}

const input = (over: Record<string, unknown> = {}) => ({
  familyId: 'fam1',
  childId: 'c1',
  weekStart: NEXT_WEEK_START,
  draft,
  children: [{ id: 'c1' }],
  activityConfigs: [],
  canEdit: true,
  now: NOW,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  applyDraftWeekMock.mockResolvedValue({ daysWritten: ['2026-08-24'], weekPlanWritten: true })
})

describe('writeNextWeekDraft — the next-week rail', () => {
  it('writes next week', async () => {
    const outcome = await writeNextWeekDraft(input())
    expect(outcome).toEqual({ status: 'done', daysWritten: ['2026-08-24'] })
    expect(applyDraftWeekMock).toHaveBeenCalledTimes(1)
  })

  it('REFUSES the current week without reaching Apply', async () => {
    const outcome = await writeNextWeekDraft(input({ weekStart: CURRENT_WEEK_START }))
    expect(outcome).toEqual({ status: 'refused', notice: NEXT_WEEK_NOTICES.weekMoved })
    expect(applyDraftWeekMock).not.toHaveBeenCalled()
  })

  it('REFUSES the week after next without reaching Apply', async () => {
    const outcome = await writeNextWeekDraft(input({ weekStart: WEEK_AFTER_NEXT_START }))
    expect(outcome.status).toBe('refused')
    expect(applyDraftWeekMock).not.toHaveBeenCalled()
  })

  it('refuses a draft that went stale across a Sunday→Monday rollover', async () => {
    // Staged on Sunday for the week starting that Sunday; tapped on Monday, by
    // which time that week is the CURRENT one and belongs to the planner.
    const outcome = await writeNextWeekDraft(
      input({ weekStart: '2026-08-23', now: new Date(2026, 7, 24, 9, 0, 0) }),
    )
    expect(outcome).toEqual({ status: 'refused', notice: NEXT_WEEK_NOTICES.weekMoved })
    expect(applyDraftWeekMock).not.toHaveBeenCalled()
  })

  it('refuses without the capability, before any write', async () => {
    const outcome = await writeNextWeekDraft(input({ canEdit: false }))
    expect(outcome).toEqual({ status: 'refused', notice: NEXT_WEEK_NOTICES.notPermitted })
    expect(applyDraftWeekMock).not.toHaveBeenCalled()
  })
})

describe('writeNextWeekDraft — what reaches the shared Apply', () => {
  it('passes no lesson-card map — the chat spends no second generation', async () => {
    await writeNextWeekDraft(input())
    expect(applyDraftWeekMock.mock.calls[0][0].lessonCardMap).toBeUndefined()
  })

  it('passes no readAloudBookId, so a chat apply can never blank the week’s book', async () => {
    await writeNextWeekDraft(input())
    expect(applyDraftWeekMock.mock.calls[0][0].readAloudBookId).toBeUndefined()
  })

  it('threads the real capability through rather than hardcoding true', async () => {
    await writeNextWeekDraft(input())
    expect(applyDraftWeekMock.mock.calls[0][0].canEdit).toBe(true)
  })

  it('targets the week it validated, not one it recomputed separately', async () => {
    await writeNextWeekDraft(input())
    expect(applyDraftWeekMock.mock.calls[0][0].weekStart).toBe(NEXT_WEEK_START)
  })
})

describe('writeNextWeekDraft — failure honesty', () => {
  it('reports the days that landed when Apply fails partway', async () => {
    applyDraftWeekMock.mockRejectedValue(
      new WeekApplyError('offline', { daysWritten: ['2026-08-24'], weekPlanWritten: true }),
    )
    const outcome = await writeNextWeekDraft(input())
    expect(outcome).toEqual({
      status: 'partial',
      daysWritten: ['2026-08-24'],
      weekPlanWritten: true,
    })
  })

  it('reports an empty day list for a failure with no week-apply context', async () => {
    applyDraftWeekMock.mockRejectedValue(new Error('network'))
    const outcome = await writeNextWeekDraft(input())
    expect(outcome).toEqual({ status: 'partial', daysWritten: [], weekPlanWritten: false })
  })

  it('never throws — every failure has a sentence the caller can show', async () => {
    applyDraftWeekMock.mockRejectedValue(new Error('boom'))
    await expect(writeNextWeekDraft(input())).resolves.toBeDefined()
  })
})

describe('writeNextWeekDraft — the WeekPlan write survives a partial outcome (Codex P2, #1679)', () => {
  it('reports goals-saved-but-no-day-written as its own distinct state', async () => {
    // The `WeekPlan` upsert runs FIRST, so this is reachable: goals changed, no
    // day did. Collapsing it into `daysWritten: []` would tell the parent
    // nothing was written when something was.
    applyDraftWeekMock.mockRejectedValue(
      new WeekApplyError('offline', { daysWritten: [], weekPlanWritten: true }),
    )
    const outcome = await writeNextWeekDraft(input())
    expect(outcome).toEqual({ status: 'partial', daysWritten: [], weekPlanWritten: true })
  })

  it('carries weekPlanWritten alongside the days that landed', async () => {
    applyDraftWeekMock.mockRejectedValue(
      new WeekApplyError('offline', { daysWritten: ['2026-08-24'], weekPlanWritten: true }),
    )
    const outcome = await writeNextWeekDraft(input())
    expect(outcome).toMatchObject({ daysWritten: ['2026-08-24'], weekPlanWritten: true })
  })

  it('claims nothing when the failure carries no apply context', async () => {
    applyDraftWeekMock.mockRejectedValue(new Error('network'))
    const outcome = await writeNextWeekDraft(input())
    expect(outcome).toEqual({ status: 'partial', daysWritten: [], weekPlanWritten: false })
  })
})
