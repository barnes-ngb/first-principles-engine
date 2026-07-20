import { describe, expect, it } from 'vitest'

import type { PlannerConversation } from '../../core/types'
import { PlannerConversationStatus } from '../../core/types/enums'
import { hasUnappliedDraftItems, selectTodayDayBanner } from './unappliedDraft'

const conversation = (
  over: Partial<PlannerConversation>,
): PlannerConversation => ({
  childId: 'c1',
  weekKey: '2026-07-20',
  status: PlannerConversationStatus.Draft,
  messages: [],
  availableHoursPerDay: 3,
  appBlocks: [],
  assignments: [],
  ...over,
})

const draftWithItems = {
  days: [
    { day: 'Monday', timeBudgetMinutes: 60, items: [{ id: 'i1', title: 'Read', accepted: true } as never] },
  ],
  skipSuggestions: [],
  minimumWin: '',
}

describe('hasUnappliedDraftItems', () => {
  it('is false when there is no conversation', () => {
    expect(hasUnappliedDraftItems(null)).toBe(false)
    expect(hasUnappliedDraftItems(undefined)).toBe(false)
  })

  it('is true for a draft with at least one accepted item', () => {
    expect(
      hasUnappliedDraftItems(conversation({ currentDraft: draftWithItems })),
    ).toBe(true)
  })

  it('is false once the plan is applied — even if the draft still has items', () => {
    expect(
      hasUnappliedDraftItems(
        conversation({
          status: PlannerConversationStatus.Applied,
          currentDraft: draftWithItems,
        }),
      ),
    ).toBe(false)
  })

  it('is false when the draft has no items', () => {
    expect(
      hasUnappliedDraftItems(
        conversation({
          currentDraft: { days: [], skipSuggestions: [], minimumWin: '' },
        }),
      ),
    ).toBe(false)
  })

  it('is false when every draft item is unaccepted (nothing would apply)', () => {
    expect(
      hasUnappliedDraftItems(
        conversation({
          currentDraft: {
            days: [
              { day: 'Monday', timeBudgetMinutes: 60, items: [{ id: 'i1', title: 'Read', accepted: false } as never] },
            ],
            skipSuggestions: [],
            minimumWin: '',
          },
        }),
      ),
    ).toBe(false)
  })
})

describe('selectTodayDayBanner', () => {
  it('shows the draft banner on an upcoming day with an unapplied draft', () => {
    expect(
      selectTodayDayBanner({ isToday: false, isPast: false, dayIsEmpty: true, hasUnappliedDraft: true }),
    ).toBe('draft')
  })

  it('shows the draft banner on an empty *today* with an unapplied draft', () => {
    expect(
      selectTodayDayBanner({ isToday: true, isPast: false, dayIsEmpty: true, hasUnappliedDraft: true }),
    ).toBe('draft')
  })

  it('never shows a draft banner for an applied week (hasUnappliedDraft=false)', () => {
    // Upcoming, empty, but plan applied → no draft banner; falls through to upcoming-empty.
    expect(
      selectTodayDayBanner({ isToday: false, isPast: false, dayIsEmpty: true, hasUnappliedDraft: false }),
    ).toBe('upcoming-empty')
    // Today with items and applied → nothing.
    expect(
      selectTodayDayBanner({ isToday: true, isPast: false, dayIsEmpty: false, hasUnappliedDraft: false }),
    ).toBeNull()
  })

  it('P4: suppresses "items will appear" when the upcoming day already has items', () => {
    expect(
      selectTodayDayBanner({ isToday: false, isPast: false, dayIsEmpty: false, hasUnappliedDraft: false }),
    ).toBeNull()
  })

  it('shows the past banner when viewing an earlier day (no draft)', () => {
    expect(
      selectTodayDayBanner({ isToday: false, isPast: true, dayIsEmpty: false, hasUnappliedDraft: false }),
    ).toBe('past')
  })

  it('shows "upcoming-empty" only on a genuinely empty upcoming day with no draft', () => {
    expect(
      selectTodayDayBanner({ isToday: false, isPast: false, dayIsEmpty: true, hasUnappliedDraft: false }),
    ).toBe('upcoming-empty')
  })

  it('shows nothing on a populated today', () => {
    expect(
      selectTodayDayBanner({ isToday: true, isPast: false, dayIsEmpty: false, hasUnappliedDraft: false }),
    ).toBeNull()
  })
})
