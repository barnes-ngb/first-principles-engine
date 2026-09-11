// ── "That answer didn't save" — the chapter pool's missing sentence (UX-355)
//
// `useBookProgress.updateChapter` ended in a bare `await updateDoc(...)` with no
// catch anywhere on the path — not in the hook, and not in `TodayPage`,
// `ChapterQuestionPool` or `KidChapterPool`, all three of which call it as
// `void onChapterAnswered(...)`. A rejected write was an unhandled promise
// rejection: no snack, no save state, nothing on screen, and the answer a child
// had just recorded was gone on the next load.
//
// It is `UX-351`'s shape one hook over, but the fix is a different shape, which
// is why it was filed rather than folded in. There is **no optimistic local
// state to take back** here: the row re-renders off the `onSnapshot` document,
// which never moved, so `isChapterDoneToday` correctly still reads *not
// answered*. What was missing was only the sentence — a reporting channel the
// hook did not have.
//
// ── Two audiences, one rule ─────────────────────────────────────────────────
//
// The same write is made from a **parent** surface (`ChapterQuestionPool`, where
// Shelly records what the boys said) and a **kid** surface (`KidChapterPool`,
// where a six- and a ten-year-old record their own answers, by voice). A
// six-year-old cannot act on *"the write was rejected"*, and a parent is not
// served by four words. So the copy is keyed on the audience — chosen by
// **capability** at the call site, never by a name — and the kid half is held to
// the shared readability bar (`src/test/kidReadability.ts`).
//
// The two refusals are kept apart for the same reason `dayWriteOutcome` keeps
// its two apart: *"try again"* is right for one of them and useless for the
// other.
//
// Pure: no React, no Firestore, never throws.

/** Why a chapter answer did not land. */
export const ChapterSaveRefusal = {
  /**
   * Refused before it was attempted — no family, child, book, or no progress
   * document loaded yet. Nothing was sent, so nothing can have half-landed, and
   * retrying the same tap fails the same way until the page has loaded.
   */
  NoTarget: 'no-target',
  /** Attempted and rejected — rules, network, an offline queue that gave up. */
  Rejected: 'rejected',
} as const
export type ChapterSaveRefusal =
  (typeof ChapterSaveRefusal)[keyof typeof ChapterSaveRefusal]

/** Who is reading the sentence. Capability, never a name. */
export const ChapterSaveAudience = {
  Parent: 'parent',
  Kid: 'kid',
} as const
export type ChapterSaveAudience =
  (typeof ChapterSaveAudience)[keyof typeof ChapterSaveAudience]

/** What `updateChapter` answers. `ok` is the only success. */
export type ChapterSaveOutcome =
  | { ok: true }
  | { ok: false; reason: ChapterSaveRefusal }

export interface ChapterSaveFailureNotice {
  text: string
  /** Always an error. A lost answer is never a warning. */
  severity: 'error'
}

/**
 * What the surface says when a chapter answer did not save.
 *
 * The parent sentences name what to do; the kid sentences name what happened
 * and hand it to a grown-up, because that is the only action a six-year-old
 * has here. Neither claims a rollback — there was no optimistic row to take
 * back, and a sentence that says *"it's back to how it was"* over a screen
 * that never moved is the same species of lie this whole rail exists to end.
 */
export function chapterSaveFailureNotice(
  reason: ChapterSaveRefusal,
  audience: ChapterSaveAudience,
): ChapterSaveFailureNotice {
  if (audience === ChapterSaveAudience.Kid) {
    return {
      text:
        reason === ChapterSaveRefusal.NoTarget
          ? 'Not saved yet. Ask a grown up.'
          : 'That did not save. Try again.',
      severity: 'error',
    }
  }
  return {
    text:
      reason === ChapterSaveRefusal.NoTarget
        ? "Not saved — this book's questions aren't open yet. Reload and try that again."
        : "That answer didn't save. It isn't recorded — try again.",
    severity: 'error',
  }
}
