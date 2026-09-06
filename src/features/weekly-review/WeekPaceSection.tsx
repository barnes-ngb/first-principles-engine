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
  POSITIONS_PENDING_LINE,
  hoursLoggedLine,
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
   * Friday is over, so on a Saturday there is no document yet: the Sunday cron
   * has not fired. The hours are read live and still true, so the section
   * renders — it simply has no snapshot to build a rate from, and says so.
   */
  review: WeeklyReview | null
  /** Earlier reviews for the same child, for the baseline snapshot. */
  history: WeeklyReview[]
  /** True while the earlier weeks are still being read. */
  historyLoading: boolean
  /** True when that read failed — distinct from "there are none". */
  historyFailed: boolean
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
  history,
  historyLoading,
  historyFailed,
}: WeekPaceSectionProps) {
  const { totalMinutes, loading, error } = useWeekHours(familyId, childId, weekKey)

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
        The Saturday case — and ONLY it (Codex round 1, P2).

        This line promises a date, so it may only be shown where that promise is
        true: the review document does not exist yet, so the Sunday cron has not
        run for this week and the positions genuinely are still to come.

        It keys on the missing DOCUMENT, not on the missing snapshot, because
        the two are different facts. `loadCurriculumSnapshot`
        (`functions/src/ai/evaluate.ts:654-674`) omits `curriculumPositions`
        when the child has no positioned workbook config at all, and again when
        the `activityConfigs` read throws — in both cases a review exists, the
        cron HAS run, and nothing further will arrive on Sunday. Keying on the
        snapshot would have shown a family with no positioned workbooks a
        promise that never came true, every week, indefinitely. A review that
        exists without a usable snapshot says nothing about coverage instead,
        which is what the engine below already does.
      */}
      {review === null && (
        <Typography variant="body2" color="text.secondary">
          {POSITIONS_PENDING_LINE}
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
