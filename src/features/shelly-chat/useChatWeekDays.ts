// ── Read-only live-week subscribe for the Shelly portal (FEAT-142) ──────────
//
// The chat needs this week's day logs for the same two reasons FEAT-135 needed
// the activity configs: to resolve a proposed live-day edit against something
// REAL before a confirm card is offered, and to render that card in words — the
// row's title and the weekday — instead of an `itemKey` and a date.
//
// Deliberately NOT `useDayLog`: that hook owns Today's whole read/write cycle
// (default-day creation, routine sync, debounced persistence, week-focus and
// read-aloud lookups). Opening a chat tab must not create a day document or
// start a save loop. This is a plain read: subscribe to the five weekday docs,
// project each into the narrow `ChatWeekDay` shape, hand it back.
//
// Reads by canonical document id (`{date}_{childId}`), which is exactly what the
// write lane resolves (`liveDayEdit.readDay`) — so what the chat can see and
// what the chat can write are the same set of documents by construction. It also
// needs no composite index and costs one query.

import { useEffect, useMemo, useState } from 'react'
import { documentId, onSnapshot, query, where } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types'
import { formatDateYmd } from '../../core/utils/format'
import { getWeekRange } from '../../core/utils/time'
import { dayLogDocId } from '../today/daylog.model'
import { checklistItemKey } from '../today/dayWriteGuard'
import type { ChatWeekDay } from './dayItemActions'

const EMPTY: ChatWeekDay[] = []

/**
 * Cache key identifying one (family, child) subscription — the same convention
 * `chatActivityConfigsCacheKey` uses, and for the same reason.
 *
 * The separator is a NUL, the one character a Firestore id can never contain, so
 * ids that would collide under naive concatenation — `('ab', 'c')` vs
 * `('a', 'bc')` — stay distinct. That matters because the key is what keeps a
 * previous child's rows out of the resolution gate.
 *
 * The NUL MUST be written as the `\u0000` escape, never as a raw NUL byte: a raw
 * byte makes git classify this file as binary, so it renders as "Binary file not
 * shown" in review and `git diff` / `git blame` stop working on it. The escape
 * form is byte-identical at runtime and leaves the file plain text.
 */
export function chatWeekDaysCacheKey(familyId: string, childId: string): string {
  return `${familyId}\u0000${childId}`
}

/** Full weekday names, Monday-first — what a card says out loud. */
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

/**
 * The Mon–Fri date keys of the week containing `now`, with their labels.
 *
 * Five weekdays, not seven and not a free date range: the same rule
 * `MoveToDayDialog` and `buildWeekDates` already encode. A school week is what
 * the planner plans and what the week ribbon shows, so it is what the chat may
 * move a row within.
 */
export function currentWeekDayKeys(now: Date = new Date()): {
  dateKey: string
  label: string
}[] {
  const monday = new Date(`${getWeekRange(now, 1).start}T00:00:00`)
  return WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { dateKey: formatDateYmd(d), label }
  })
}

/**
 * Project a saved day into the narrow shape the chat reasons over: each row's
 * identity, its label, and whether it is finished.
 *
 * `completed` is what the completed-row rule keys on, so it is carried
 * faithfully; `skipped` rides along because a skipped row is still on the day and
 * still legitimately removable. Nothing else about the day crosses over — the
 * chat has no business with evidence ids, minutes, mastery chips or engagement.
 */
export function toChatWeekDay(
  dateKey: string,
  label: string,
  day: DayLog | undefined,
): ChatWeekDay {
  return {
    dateKey,
    label,
    items: (day?.checklist ?? []).map((item) => ({
      itemKey: checklistItemKey(item),
      label: item.label,
      completed: Boolean(item.completed),
      ...(item.skipped ? { skipped: true } : {}),
    })),
  }
}

/**
 * Subscribe to the current week's five weekdays for one child.
 *
 * Returns `[]` while loading, when either id is missing, or on error — an empty
 * week simply means no live-day proposal can resolve, which fails closed rather
 * than offering a card the app cannot back with a real row. A weekday with no
 * saved document is returned as an EMPTY day rather than omitted: it is a real
 * day of the week that a row can be added to or moved onto (the write lane
 * creates the document), it just has nothing on it yet.
 */
export function useChatWeekDays(familyId: string, childId: string): ChatWeekDay[] {
  // Recomputed EVERY render, deliberately — five `Date` allocations, and the
  // alternative is wrong. A `useMemo(..., [])` here would pin the week at mount,
  // so a chat page left open across a Sunday→Monday rollover would keep
  // subscribing to last week's documents: every new proposal would be refused as
  // out-of-week, and a card left on screen from before the boundary could still
  // pass the stale gate and edit the PREVIOUS week (Codex P2 on PR #1667). The
  // memo below keys on the resulting dates, so the subscription still only
  // re-runs when the week actually turns over.
  const weekNow = currentWeekDayKeys()
  const weekKey = weekNow.map((d) => d.dateKey).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- weekKey IS weekNow's identity
  const week = useMemo(() => weekNow, [weekKey])
  // Keyed by the subscription's identity so a child/family switch reads as empty
  // immediately. Another child's rows must never be visible to the gate.
  const key = chatWeekDaysCacheKey(familyId, childId)
  const [loaded, setLoaded] = useState<{ key: string; days: ChatWeekDay[] }>({
    key: '',
    days: EMPTY,
  })

  useEffect(() => {
    if (!familyId || !childId) return

    const ids = week.map((d) => dayLogDocId(d.dateKey, childId))
    const q = query(daysCollection(familyId), where(documentId(), 'in', ids))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const byDate = new Map<string, DayLog>()
        for (const d of snap.docs) {
          const data = d.data()
          if (data?.date) byDate.set(data.date, data)
        }
        setLoaded({
          key,
          days: week.map((d) => toChatWeekDay(d.dateKey, d.label, byDate.get(d.dateKey))),
        })
      },
      (err) => {
        console.warn('[shellyChat] live-week subscribe failed:', err)
        setLoaded({ key, days: EMPTY })
      },
    )

    return unsubscribe
  }, [familyId, childId, key, week])

  return loaded.key === key ? loaded.days : EMPTY
}
