// ── Applying a week that has days set aside (UX-261) ─────────────────────────
//
// The central assertion of this file is the **hours rail**, and it is deliberately
// not a spy on a write: it folds the days Apply actually produced through
// `collectHoursContributions` — the one counting path the Records page, the
// compliance pack and the monthly review all read (`functions/src/shared/
// hoursContributions.ts`) — and asserts the week's counted minutes move by
// exactly zero when two days are set aside.
//
// Checking "we didn't call `setDoc` with minutes" would pass while the feature
// silently inflated a compliance figure through a route nobody thought of. This
// asks the question the owner's records actually ask.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DayLog, DraftWeeklyPlan } from '../../core/types'
import { DayBlockType, DayType, PlanType, SubjectBucket } from '../../core/types/enums'
import { collectHoursContributions } from '../../../functions/src/shared/hoursContributions'
import { LIFE_DAY_BLOCK_TITLE, LIFE_DAY_DEFAULT_MINUTES } from '../today/lifeDay'

const { getDocMock, setDocMock, setDayLogGuardedMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
  setDayLogGuardedMock:
    vi.fn<(ref: { id: string }, payload: DayLog, context: string) => Promise<void>>(),
}))

vi.mock('firebase/firestore', () => ({
  doc: (collection: { kind: string }, id: string) => ({ id, kind: collection?.kind }),
  getDoc: getDocMock,
  setDoc: setDocMock,
  collection: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: (familyId: string) => ({ familyId, kind: 'days' }),
  weeksCollection: (familyId: string) => ({ familyId, kind: 'weeks' }),
  dailyPlansCollection: (familyId: string) => ({ familyId, kind: 'dailyPlans' }),
  dailyPlanDocId: (date: string, childId: string) => `${date}_${childId}`,
}))
vi.mock('../today/dayWriteGuard', async () => {
  const actual =
    await vi.importActual<typeof import('../today/dayWriteGuard')>('../today/dayWriteGuard')
  return { ...actual, setDayLogGuarded: setDayLogGuardedMock }
})

import { applyDraftWeek, type ApplyWeekPlanInput } from './applyWeekPlan'
import { enforceDayTypes } from './plannerDayTypes'

/** Sunday 2026-08-16 → Mon 17, Tue 18, Wed 19, Thu 20, Fri 21. */
const WEEK_START = '2026-08-16'
const TUESDAY = '2026-08-18'
const THURSDAY = '2026-08-20'

const WEEK_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

/** A full routine week — every day carrying real, countable planned minutes. */
const fullWeek = (): DraftWeeklyPlan =>
  ({
    days: WEEK_DAY_NAMES.map((day) => ({
      day,
      timeBudgetMinutes: 260,
      items: [
        {
          id: `${day}-math`,
          title: 'GATB Math',
          subjectBucket: SubjectBucket.Math,
          estimatedMinutes: 30,
          skillTags: [],
          accepted: true,
          category: 'must-do' as const,
        },
        {
          id: `${day}-reading`,
          title: 'GATB Reading',
          subjectBucket: SubjectBucket.Reading,
          estimatedMinutes: 25,
          skillTags: [],
          accepted: true,
          category: 'must-do' as const,
        },
      ],
    })),
    skipSuggestions: [],
    minimumWin: 'Read together',
  }) as unknown as DraftWeeklyPlan

const baseInput = (over: Partial<ApplyWeekPlanInput> = {}): ApplyWeekPlanInput => ({
  familyId: 'fam1',
  childId: 'c1',
  weekStart: WEEK_START,
  draft: fullWeek(),
  children: [{ id: 'c1' }],
  activityConfigs: [],
  canEdit: true,
  ...over,
})

/** The DayLogs Apply actually wrote, in write order. */
const writtenDayLogs = (): DayLog[] =>
  setDayLogGuardedMock.mock.calls.map(([, payload]) => payload)

/** Minutes the canonical hours fold credits for the days Apply produced. */
const countedMinutes = (dayLogs: DayLog[]): number =>
  collectHoursContributions(dayLogs as never, [], [], 'c1').reduce(
    (sum, c) => sum + c.minutes,
    0,
  )

beforeEach(() => {
  vi.clearAllMocks()
  // No existing week doc, no existing day docs, no existing dailyPlans docs.
  getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined })
  setDocMock.mockResolvedValue(undefined)
  setDayLogGuardedMock.mockResolvedValue(undefined)
})

describe('a week with days set aside', () => {
  const packingWeek = [
    { day: 'Tuesday', dayType: DayType.Life },
    { day: 'Thursday', dayType: DayType.Life },
  ]

  it('writes no day log at all for a set-aside day', async () => {
    const draft = enforceDayTypes(fullWeek(), packingWeek, [])
    const result = await applyDraftWeek(baseInput({ draft, dayTypes: packingWeek }))

    expect(result.daysWritten).toEqual(['2026-08-17', '2026-08-19', '2026-08-21'])
    expect(result.daysWritten).not.toContain(TUESDAY)
    expect(result.daysWritten).not.toContain(THURSDAY)
  })

  // ── The positive control ───────────────────────────────────────────────────
  //
  // An applied plan writes `plannedMinutes` and *uncompleted* checklist rows,
  // and the canonical fold counts neither — planned time is not logged time. So
  // "the applied week counts zero" is true whatever Apply does with day types,
  // and asserting it alone would be a test that cannot fail.
  //
  // What WOULD count, and is the exact thing this rail exists to forbid, is a
  // materialised Life Day block carrying `actualMinutes`. This test proves the
  // fold is wired and would catch that, so the zero below is a real result.
  it('the hours fold is live: a Life Day block at the default WOULD count 120m', () => {
    const withLifeBlock: DayLog = {
      childId: 'c1',
      date: TUESDAY,
      blocks: [
        {
          type: DayBlockType.Other,
          title: LIFE_DAY_BLOCK_TITLE,
          subjectBucket: SubjectBucket.Other,
          actualMinutes: LIFE_DAY_DEFAULT_MINUTES,
          source: 'manual',
        },
      ],
      checklist: [],
    } as unknown as DayLog

    expect(countedMinutes([withLifeBlock])).toBe(LIFE_DAY_DEFAULT_MINUTES)
  })

  it('THE HOURS RAIL: applying two Life days writes exactly zero counted minutes', async () => {
    const draft = enforceDayTypes(fullWeek(), packingWeek, [])
    await applyDraftWeek(baseInput({ draft, dayTypes: packingWeek }))

    // Nothing Apply produced is countable — not a Life Day block, not a default
    // two hours, not a completed row with a duration on it. The parent records
    // the time on the day, from Today, as FEAT-200 designed.
    expect(countedMinutes(writtenDayLogs())).toBe(0)

    // And the two set-aside days produced no document to carry one later.
    expect(writtenDayLogs().map((l) => l.date)).not.toContain(TUESDAY)
    expect(writtenDayLogs().map((l) => l.date)).not.toContain(THURSDAY)
  })

  it('and the `dailyPlans` write it DOES make is not in the hours fold', async () => {
    const draft = enforceDayTypes(fullWeek(), packingWeek, [])
    await applyDraftWeek(baseInput({ draft, dayTypes: packingWeek }))

    // The fold reads day logs, `hours` and `hoursAdjustments`. `dailyPlans` is
    // none of the three, and the payload carries no minute field at all.
    const planWrites = setDocMock.mock.calls.filter(
      ([ref]) => (ref as { kind?: string }).kind === 'dailyPlans',
    )
    expect(planWrites.length).toBeGreaterThan(0)
    for (const [, data] of planWrites) {
      const payload = data as Record<string, unknown>
      expect(payload).not.toHaveProperty('actualMinutes')
      expect(payload).not.toHaveProperty('plannedMinutes')
      expect(payload).not.toHaveProperty('blocks')
      expect(payload).not.toHaveProperty('checklist')
    }
  })

  it('writes no block and no `actualMinutes` anywhere on the applied week', async () => {
    const draft = enforceDayTypes(fullWeek(), packingWeek, [])
    await applyDraftWeek(baseInput({ draft, dayTypes: packingWeek }))

    for (const log of writtenDayLogs()) {
      expect(log.date).not.toBe(TUESDAY)
      expect(log.date).not.toBe(THURSDAY)
      for (const block of log.blocks ?? []) {
        expect(block.title).not.toBe('Life Day')
        expect(block.actualMinutes).toBeUndefined()
      }
    }
  })

  it('sets `dailyPlans.planType` to life for each set-aside day, and nothing else', async () => {
    const draft = enforceDayTypes(fullWeek(), packingWeek, [])
    const result = await applyDraftWeek(baseInput({ draft, dayTypes: packingWeek }))

    const planWrites = setDocMock.mock.calls.filter(
      ([ref]) => (ref as { kind?: string }).kind === 'dailyPlans',
    )
    expect(planWrites).toHaveLength(2)
    expect(result.dayTypesWritten).toEqual([TUESDAY, THURSDAY])

    for (const [ref, data, options] of planWrites) {
      expect((data as { planType: string }).planType).toBe(PlanType.Life)
      // Merge, never a whole-document write — the day's energy and sessions are
      // not this writer's to replace.
      expect(options).toEqual({ merge: true })
      expect([`${TUESDAY}_c1`, `${THURSDAY}_c1`]).toContain((ref as { id: string }).id)
    }
  })

  it('seeds a complete document when none exists, so Today can read its energy', async () => {
    const draft = enforceDayTypes(fullWeek(), packingWeek, [])
    await applyDraftWeek(baseInput({ draft, dayTypes: packingWeek }))

    const [, data] = setDocMock.mock.calls.find(
      ([ref]) => (ref as { kind?: string }).kind === 'dailyPlans',
    )!
    expect(data).toMatchObject({
      childId: 'c1',
      date: TUESDAY,
      energy: 'normal',
      sessions: [],
      planType: PlanType.Life,
    })
  })
})

describe('a week with nothing set aside', () => {
  it('touches `dailyPlans` not at all when no day types are passed', async () => {
    await applyDraftWeek(baseInput())
    expect(
      setDocMock.mock.calls.filter(([ref]) => (ref as { kind?: string }).kind === 'dailyPlans'),
    ).toHaveLength(0)
  })

  it('touches `dailyPlans` not at all when every day is Full', async () => {
    await applyDraftWeek(
      baseInput({ dayTypes: WEEK_DAY_NAMES.map((day) => ({ day, dayType: DayType.Normal })) }),
    )
    expect(
      setDocMock.mock.calls.filter(([ref]) => (ref as { kind?: string }).kind === 'dailyPlans'),
    ).toHaveLength(0)
  })

  it('never overwrites a Minimum Viable Day the parent chose on Today', async () => {
    getDocMock.mockImplementation((ref: { kind?: string }) =>
      Promise.resolve(
        ref.kind === 'dailyPlans'
          ? { exists: () => true, data: () => ({ planType: PlanType.Mvd, energy: 'low', sessions: [] }) }
          : { exists: () => false, data: () => undefined },
      ),
    )

    await applyDraftWeek(
      baseInput({ dayTypes: [{ day: 'Tuesday', dayType: DayType.Normal }] }),
    )
    expect(
      setDocMock.mock.calls.filter(([ref]) => (ref as { kind?: string }).kind === 'dailyPlans'),
    ).toHaveLength(0)
  })

  it('takes a day back out of Life when the parent re-applies it as Full', async () => {
    // Without this the re-applied week writes Tuesday a checklist that Today,
    // still labelled a Life Day, would hide.
    getDocMock.mockImplementation((ref: { kind?: string }) =>
      Promise.resolve(
        ref.kind === 'dailyPlans'
          ? { exists: () => true, data: () => ({ planType: PlanType.Life, energy: 'normal', sessions: [] }) }
          : { exists: () => false, data: () => undefined },
      ),
    )

    const result = await applyDraftWeek(
      baseInput({ dayTypes: [{ day: 'Tuesday', dayType: DayType.Normal }] }),
    )
    const planWrites = setDocMock.mock.calls.filter(
      ([ref]) => (ref as { kind?: string }).kind === 'dailyPlans',
    )
    expect(planWrites).toHaveLength(1)
    expect((planWrites[0][1] as { planType: string }).planType).toBe(PlanType.Normal)
    expect(result.dayTypesWritten).toEqual([TUESDAY])
  })
})

describe('a light day', () => {
  it('applies the shared template as the day\'s checklist', async () => {
    const lightWed = [{ day: 'Wednesday', dayType: DayType.Light }]
    const draft = enforceDayTypes(fullWeek(), lightWed, [])
    const result = await applyDraftWeek(baseInput({ draft, dayTypes: lightWed }))

    // Unlike a Life day, a Light day IS written — it has items.
    expect(result.daysWritten).toContain('2026-08-19')
    const wednesday = writtenDayLogs().find((l) => l.date === '2026-08-19')!
    const labels = (wednesday.checklist ?? []).map((i) => i.label)
    expect(labels.some((l) => l.startsWith('Quick writing (copy 1 sentence)'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Math facts sprint (5 min)'))).toBe(true)
    expect(labels.some((l) => l.startsWith('GATB Math'))).toBe(false)
  })

  it('leaves `dailyPlans.planType` alone — a light day is still a planned day', async () => {
    const lightWed = [{ day: 'Wednesday', dayType: DayType.Light }]
    const draft = enforceDayTypes(fullWeek(), lightWed, [])
    await applyDraftWeek(baseInput({ draft, dayTypes: lightWed }))
    expect(
      setDocMock.mock.calls.filter(([ref]) => (ref as { kind?: string }).kind === 'dailyPlans'),
    ).toHaveLength(0)
  })
})
