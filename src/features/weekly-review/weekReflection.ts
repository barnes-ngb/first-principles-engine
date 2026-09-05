import type { WeeklyReview, WeekReflection } from '../../core/types'
import {
  WeekReflectionAnswer,
  WeekReflectionAnswerLabel,
} from '../../core/types/enums'
import { formatDateShort } from '../../core/utils/dateKey'

/**
 * The week's one question, asked out loud (UX-214).
 *
 * **Not computed. Not scored. Not AI-generated.** A machine-generated judgement
 * about whether a week was enough would be the quota again, wearing a sentence —
 * so a person answers it, and the app's only job is to remember what they said
 * and show it back.
 *
 * Three answers and an optional line. The answers are **peers**: no ordering, no
 * numeric value, no "better" end, and nothing in the app reads one back. The
 * answer does not feed planning, does not gate anything, and cannot change a
 * plan, an hours figure or a position snapshot.
 *
 * The urgency it creates is entirely the parent's own: three *"we can do more"*
 * in a row, visible in their own words, is a signal no threshold the app
 * invented could honestly produce.
 */
export const WEEK_QUESTION = 'Was that enough this week?'

/** The optional line's stored length. A note, not a journal. */
export const REFLECTION_NOTE_MAX = 500

/** Presentation order only — never a ranking. */
export const REFLECTION_CHOICES: ReadonlyArray<{
  answer: WeekReflectionAnswer
  label: string
}> = [
  {
    answer: WeekReflectionAnswer.GoodWeek,
    label: WeekReflectionAnswerLabel[WeekReflectionAnswer.GoodWeek],
  },
  {
    answer: WeekReflectionAnswer.AboutRight,
    label: WeekReflectionAnswerLabel[WeekReflectionAnswer.AboutRight],
  },
  {
    answer: WeekReflectionAnswer.CanDoMore,
    label: WeekReflectionAnswerLabel[WeekReflectionAnswer.CanDoMore],
  },
]

const VALID_ANSWERS = new Set<string>(
  Object.values(WeekReflectionAnswer) as string[],
)

/** True when a stored value is one of the three answers. */
export function isWeekReflectionAnswer(
  value: unknown,
): value is WeekReflectionAnswer {
  return typeof value === 'string' && VALID_ANSWERS.has(value)
}

/**
 * Build what gets stored. Pure — the clock is passed in.
 *
 * An empty or whitespace-only note is OMITTED rather than stored as `''`:
 * Firestore rejects `undefined`, and a blank string would render as an empty
 * line the parent never wrote.
 */
export function buildWeekReflection(
  answer: WeekReflectionAnswer,
  note: string | undefined,
  now: Date,
): WeekReflection {
  const trimmed = (note ?? '').trim().slice(0, REFLECTION_NOTE_MAX)
  const reflection: WeekReflection = {
    answer,
    answeredAt: now.toISOString(),
  }
  if (trimmed) reflection.note = trimmed
  return reflection
}

/** Narrow a reflection read straight off an unvalidated `weeklyReviews` doc. */
export function normalizeWeekReflection(raw: unknown): WeekReflection | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!isWeekReflectionAnswer(obj.answer)) return null
  const reflection: WeekReflection = {
    answer: obj.answer,
    answeredAt: typeof obj.answeredAt === 'string' ? obj.answeredAt : '',
  }
  if (typeof obj.note === 'string' && obj.note.trim()) {
    reflection.note = obj.note
  }
  return reflection
}

export interface PastReflection {
  weekKey: string
  /** e.g. `Aug 30` — the week the answer was about. */
  weekLabel: string
  answer: WeekReflectionAnswer
  label: string
  note?: string
}

/**
 * Earlier answers, newest first — so a run of the same answer is visible.
 *
 * Reviews without an answer are skipped entirely; an unanswered week is not
 * rendered as a blank or a gap, because the parent said nothing about it and the
 * app must not imply that they did.
 */
export function pastReflections(reviews: WeeklyReview[]): PastReflection[] {
  return reviews
    .map((review) => {
      const reflection = normalizeWeekReflection(review.reflection)
      if (!reflection) return null
      return {
        weekKey: review.weekKey,
        weekLabel: formatDateShort(review.weekKey),
        answer: reflection.answer,
        label: WeekReflectionAnswerLabel[reflection.answer],
        note: reflection.note,
      }
    })
    .filter((entry): entry is PastReflection => entry !== null)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
}
