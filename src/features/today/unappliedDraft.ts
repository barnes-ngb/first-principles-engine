import type { PlannerConversation } from '../../core/types'
import { PlannerConversationStatus } from '../../core/types/enums'

/**
 * A week's planner conversation counts as an *unapplied draft* worth announcing
 * on Today when it exists, is not yet `applied`, and its draft actually carries
 * at least one accepted item (an empty or fully-unaccepted draft would apply
 * nothing, so nagging about it would be noise).
 *
 * Pure so the Today banner logic is testable without Firestore (FEAT-111 P2).
 */
export function hasUnappliedDraftItems(
  conversation: PlannerConversation | null | undefined,
): boolean {
  if (!conversation) return false
  if (conversation.status === PlannerConversationStatus.Applied) return false
  const days = conversation.currentDraft?.days ?? []
  return days.some((day) => day.items.some((item) => item.accepted))
}

/** Which context banner (if any) the Today day-switcher shows for a viewed day. */
export type TodayDayBanner = 'draft' | 'past' | 'upcoming-empty' | null

/**
 * Pure selector for Today's day-context banner (FEAT-111 P2 + P4). Priority:
 *   1. `draft` — an unapplied draft exists AND the viewed day is empty or
 *      upcoming (actionable "review and apply"); this wins so Today never
 *      renders a silently empty day.
 *   2. `past` — viewing an earlier day (informational).
 *   3. `upcoming-empty` — an upcoming day that is *genuinely* empty and has no
 *      draft to announce. Gated on emptiness so it never shows when applied
 *      items already sit on the day (P4).
 */
export function selectTodayDayBanner(params: {
  isToday: boolean
  isPast: boolean
  dayIsEmpty: boolean
  hasUnappliedDraft: boolean
}): TodayDayBanner {
  const { isToday, isPast, dayIsEmpty, hasUnappliedDraft } = params
  const isUpcoming = !isToday && !isPast
  if (hasUnappliedDraft && (isUpcoming || dayIsEmpty)) return 'draft'
  if (!isToday && isPast) return 'past'
  if (isUpcoming && dayIsEmpty) return 'upcoming-empty'
  return null
}
