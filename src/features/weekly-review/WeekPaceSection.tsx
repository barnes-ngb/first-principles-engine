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
  hoursLoggedLine,
} from './weekHours'
import { useWeekHours } from './useWeekHours'

export interface WeekPaceSectionProps {
  familyId: string
  childId: string
  weekKey: string
  /** This week's review — read for its recorded positions only. */
  review: WeeklyReview
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

  const coverage = useMemo(() => {
    const current = normalizeCurriculumSnapshot(review.curriculumPositions)
    const priors = history
      .map((r) => normalizeCurriculumSnapshot(r.curriculumPositions))
      .filter((s): s is CurriculumSnapshot => s !== null)
    return computeObservedCoverage(current, priors)
  }, [review.curriculumPositions, history])

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
        {!error && (
          <Typography variant="caption" color="text.secondary">
            {HOURS_SOURCE_CAPTION}
          </Typography>
        )}
      </Stack>

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
