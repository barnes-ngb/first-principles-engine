import type { ChapterQuestionPoolItem } from '../../core/types'

/**
 * Kid Today "one list" ritual rows (UX-C2b-1 / FEAT-118).
 *
 * UX-C2a (FEAT-106) made `KidChecklist` the spine of Kid Today but left the
 * rituals — chapter, conundrum, teach-back, mining — as sibling cards below it.
 * This module supplies the pure logic that lets those rituals render as rows of
 * the same list.
 *
 * ── Why rituals stay OUT of `dayLog.checklist` ─────────────────────────────
 * `computeQuestProgress` (./kidQuestGate) reads `dayLog.checklist` to derive the
 * Workshop/Books unlock gate, per-item XP dedup keys, overnight rollover, and
 * budget enforcement. Writing a synthetic "chapter" or "conundrum" item into
 * that array would silently gate play on a ritual, mint checklist XP the ritual
 * already awards through its own path, roll the ritual over to tomorrow, and
 * create a second source of truth competing with the ritual's own store.
 *
 * So each row derives a **read-only** done flag from the ritual's own store
 * (the question pool, the XP ledger entry, `dayLog.teachBackDone`), and the
 * widened finish-line built from `combinedRemaining` is **display only**. The
 * gate threshold still counts must-do checklist items and nothing else.
 */
export interface KidRitualFlags {
  /** The read-aloud chapter row is mounted (shared week book present). */
  chapterVisible: boolean
  /** A chapter question was answered *today* (see `isChapterDoneToday`). */
  chapterDone: boolean
  /** A conundrum is set for this week. */
  conundrumVisible: boolean
  /** The conundrum response was already saved today. */
  conundrumDone: boolean
  /**
   * The teach-back row is mounted. There is deliberately no `teachBackDone`
   * companion: the section already unmounts once `dayLog.teachBackDone`, so
   * visibility alone means "still to do".
   */
  teachBackVisible: boolean
  // NOTE: there is deliberately no mining key here. Mining accrues minutes and
  // has no "done" state, so counting it would keep the finish-line from ever
  // reaching zero. Its row is always-open, checkbox-free, and uncounted.
}

/**
 * True when the kid answered a chapter question **today**.
 *
 * Deliberately NOT pool-emptiness / `isChapterPoolVisible`: the question pool
 * spans the whole book, so "any chapter still to go" stays true for weeks. A
 * kid would answer today's question and watch the finish-line sit still.
 */
export function isChapterDoneToday(
  pool: ChapterQuestionPoolItem[] | undefined,
  today: string,
): boolean {
  if (!pool || pool.length === 0) return false
  return pool.some((item) => item.answered === true && item.answeredDate === today)
}

/**
 * How many visible rituals are still unfinished.
 *
 * Only visible-and-unfinished rituals count. Mining is not an input (see
 * `KidRitualFlags`).
 */
export function countRitualsToGo(flags: KidRitualFlags): number {
  let toGo = 0
  if (flags.chapterVisible && !flags.chapterDone) toGo += 1
  if (flags.conundrumVisible && !flags.conundrumDone) toGo += 1
  if (flags.teachBackVisible) toGo += 1
  return toGo
}

/**
 * The one finish-line number: must-do items still to go **plus** visible
 * rituals still to go. Display only — never an unlock input. Each side is
 * clamped at zero so a stale negative can't drag the total down.
 */
export function combinedRemaining(
  mustDoRemaining: number,
  ritualsToGo: number,
): number {
  return Math.max(0, mustDoRemaining) + Math.max(0, ritualsToGo)
}
