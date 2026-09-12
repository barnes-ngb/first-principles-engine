import { useMemo } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { CurriculumSnapshot, WeeklyReview } from '../../core/types'
import {
  computeObservedCoverage,
  normalizeCurriculumSnapshot,
} from '../planner-chat/pace.logic'
import {
  HISTORY_UNAVAILABLE_LINE,
  HOURS_SOURCE_CAPTION,
  HOURS_UNAVAILABLE_LINE,
  REVIEW_UNAVAILABLE_LINE,
  hoursLoggedLine,
  positionsPendingLine,
  reviewWasGenerated,
} from './weekHours'
import { weekEvidenceCountsLine } from './weekEvidenceCounts'
import { useWeekHours } from './useWeekHours'

export interface WeekPaceSectionProps {
  familyId: string
  childId: string
  weekKey: string
  /**
   * This week's review — read for its recorded positions and evidence counts
   * only.
   *
   * **Nullable since UX-219.** The page names the school week as soon as its
   * Friday is over, so on a Saturday there is no document until the cron fires
   * overnight (00:15 Sunday CT — UX-263). The hours are read live and still true, so
   * the section renders — it simply has no snapshot to build a rate from, and
   * says so.
   */
  review: WeeklyReview | null
  /**
   * True when the review document itself could not be read (Codex round 3, P2).
   *
   * A third place the page's one rule applies: a failed read is not a result. A
   * dropped listener leaves `review` null with loading finished, which is
   * indistinguishable from "the cron has not run" unless the caller says which
   * it was.
   */
  reviewFailed: boolean
  /** Earlier reviews for the same child, for the baseline snapshot. */
  history: WeeklyReview[]
  /** True while the earlier weeks are still being read. */
  historyLoading: boolean
  /** True when that read failed — distinct from "there are none". */
  historyFailed: boolean
  /**
   * Now, as an **instant** — which of the two positions sentences is true
   * depends on whether this week's overnight save has come due (UX-407).
   *
   * An instant rather than a date key, because the boundary is the cron's
   * scheduled 00:15 America/Chicago and not the viewer's midnight (Codex round
   * 1, P2): a date-only answer changes state at the wrong moment on every
   * device that is not in Central, and fifteen minutes early on one that is.
   *
   * Passed in rather than read here so the page's ONE clock decides: UX-406's
   * selector, its default and this sentence all resolve from the same `now`,
   * and a section that read its own would be a second answer to "what time is
   * it" on a page whose whole subject is which week you are looking at. The
   * default exists for the tests and for a caller that has no clock of its own.
   */
  now?: Date
}

/**
 * The hours the week actually held, and what was covered at what rate —
 * **parent-only** (UX-211 / UX-213).
 *
 * The audience rule is the whole design. `pace.logic.ts`'s coverage engine is
 * headed *"no pace pressure, no deadline math"* and its child-facing output is
 * untouched: Lincoln reads *"Lesson 14 of 60 covered."* What that decision also
 * did, as a side effect, was stop the adults noticing that a month went by, so
 * the same data gets a second reading here — *"4 lessons in 3 weeks"* — for the
 * person doing the planning.
 *
 * The gate is **capability, never a name**, and it sits above the data hooks so
 * a child profile costs zero Firestore reads even though `/weekly-review` is
 * already inside `RequireParent`. Two gates, because this is the one thing in
 * the run that must not leak.
 *
 * Nothing here is a target: no hours goal, no bar, no percentage, no projected
 * deadline, nothing coloured to mean behind, and no sentence that says
 * "should".
 */
export default function WeekPaceSection(props: WeekPaceSectionProps) {
  const { isChildProfile } = useActiveChild()
  if (isChildProfile) return null
  return <WeekPaceBody {...props} />
}

function WeekPaceBody({
  familyId,
  childId,
  weekKey,
  review,
  reviewFailed,
  history,
  historyLoading,
  historyFailed,
  now,
}: WeekPaceSectionProps) {
  const { totalMinutes, loading, error } = useWeekHours(familyId, childId, weekKey)
  const resolvedNow = useMemo(() => now ?? new Date(), [now])

  const current = useMemo(
    () => normalizeCurriculumSnapshot(review?.curriculumPositions),
    [review?.curriculumPositions],
  )

  const coverage = useMemo(() => {
    const priors = history
      .map((r) => normalizeCurriculumSnapshot(r.curriculumPositions))
      .filter((s): s is CurriculumSnapshot => s !== null)
    return computeObservedCoverage(current, priors)
  }, [current, history])

  // The week's own counts, read off the review the cron wrote. `null` means
  // there is no summary to read — not a week with nothing in it — so nothing is
  // said, and the pending line below explains when it lands.
  const evidenceLine = weekEvidenceCountsLine(review?.evidence)

  // A failed read is not an empty result, and a read still in flight is not a
  // first week. Both would otherwise print as an affirmative claim.
  const hoursLine = error
    ? HOURS_UNAVAILABLE_LINE
    : loading
      ? 'Counting the week’s hours…'
      : hoursLoggedLine(totalMinutes)

  const showCoverage = !historyLoading && !historyFailed

  return (
    <SectionCard title="Hours and Coverage">
      <Stack spacing={0.5}>
        <Typography variant="body1">{hoursLine}</Typography>
        {evidenceLine && <Typography variant="body1">{evidenceLine}</Typography>}
        {!error && (
          <Typography variant="caption" color="text.secondary">
            {HOURS_SOURCE_CAPTION}
          </Typography>
        )}
      </Stack>

      {/*
        No snapshot for this week — FOUR states now, kept apart, because two
        Codex rounds showed that collapsing any two of them makes this sentence
        lie, and UX-407 found a fourth way for it to:

          • the read FAILED       → say so, claim nothing (round 3, P2);
          • the cron HAS run      → say nothing here; a review with no usable
            snapshot is silent about coverage, because `loadCurriculumSnapshot`
            omits the field for a child with no positioned workbook config and
            when the config read throws (round 1, P2);
          • the save is still AHEAD → the promise, which is true;
          • the save was DUE and did not arrive → say that instead (UX-407).

        The generated/not question is read from `reviewWasGenerated`, not from
        the document existing: `writeWeekReflection` creates the document when a
        parent answers before the cron fires, so presence stopped meaning
        "generated" (round 3, P2). Which of the last two sentences is true is
        `positionsPendingLine`'s decision, from the week itself — the owner read
        the promise on a Friday about a Saturday six days gone, and UX-406's
        selector can now name a week whose Saturday is a fortnight back.
      */}
      {reviewFailed && (
        <Typography variant="body2" color="text.secondary">
          {REVIEW_UNAVAILABLE_LINE}
        </Typography>
      )}

      {!reviewFailed && !reviewWasGenerated(review) && (
        <Typography variant="body2" color="text.secondary">
          {positionsPendingLine(weekKey, resolvedNow)}
        </Typography>
      )}

      {historyFailed && (
        <Typography variant="body2" color="text.secondary">
          {HISTORY_UNAVAILABLE_LINE}
        </Typography>
      )}

      {showCoverage && coverage.notice && (
        <Typography variant="body2" color="text.secondary">
          {coverage.notice}
        </Typography>
      )}

      {showCoverage && coverage.entries.length > 0 && (
        <Stack spacing={1}>
          {coverage.entries.map((entry) => (
            <Typography key={entry.configId} variant="body2">
              {entry.line}
            </Typography>
          ))}
        </Stack>
      )}
    </SectionCard>
  )
}
