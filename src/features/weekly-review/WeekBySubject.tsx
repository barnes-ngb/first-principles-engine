import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import {
  EVIDENCE_UNAVAILABLE_LINE,
  WEEK_BY_SUBJECT_CAPTION,
  WEEK_BY_SUBJECT_EMPTY_LINE,
  WEEK_BY_SUBJECT_TITLE,
  WEEK_BY_SUBJECT_UNAVAILABLE_LINE,
  subjectEvidenceLine,
  subjectHoursLine,
  subjectItemsLine,
  subjectTopicsLine,
} from './weekBySubject'
import type { WeekSubjectSummary } from './weekBySubject'
import { useWeekBySubject } from './useWeekBySubject'

export interface WeekBySubjectProps {
  familyId: string
  childId: string
  weekKey: string
}

/**
 * The week, by subject and topic — **parent-only**, and the first thing on the
 * page (UX-388).
 *
 * Owner, 2026-09-11: *"the current week summary by topic"*, above the log, as
 * the first thing you see. The log below it is untouched.
 *
 * Presentational. It holds no state, reads no Firestore of its own, and writes
 * nothing: every number arrives from `useWeekBySubject`, every sentence from the
 * pure `weekBySubject.ts`. There is no target, no percentage, no share, no bar
 * and nothing coloured to mean behind — the owner's decision on file (2026-09-06,
 * *"when we move to Texas hours aren't the goal"*), which is why this reads as a
 * record and not as a dashboard.
 *
 * The gate is **capability, never a name**, and it sits above the data hook so a
 * child profile costs zero Firestore reads. `WeeklyReviewPage` already returns
 * null for a child profile (UX-219); this is the second gate, for the same
 * reason `WeekPaceSection` has one — a section that must not leak does not rely
 * on its caller.
 *
 * **Child-switch verdict: SAFE** (UX-329's vocabulary), and the line that makes
 * it true is that there is no `useState` anywhere in this file or in
 * `useWeekBySubject` beyond the read's own request-keyed reset — the surface
 * holds no draft, no dirty flag and no unsaved work, and it writes nothing, so a
 * switch mid-read can only replace a read with another read. The census's own
 * heuristic derives the same answer and therefore asks for no row: it requires
 * editable state, and `npm run census:child-switch` checks in BOTH directions,
 * so a volunteered row for a non-candidate would fail as `not-a-candidate`. The
 * verdict is stated here instead, where the next person to add state to this
 * file will read it.
 */
export default function WeekBySubject(props: WeekBySubjectProps) {
  const { isChildProfile } = useActiveChild()
  if (isChildProfile) return null
  return <WeekBySubjectBody {...props} />
}

function WeekBySubjectBody({ familyId, childId, weekKey }: WeekBySubjectProps) {
  const { subjects, loading, hoursFailed, evidenceFailed } = useWeekBySubject(
    familyId,
    childId,
    weekKey,
  )

  return (
    <SectionCard title={WEEK_BY_SUBJECT_TITLE}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {WEEK_BY_SUBJECT_CAPTION}
      </Typography>

      {/* A failed read is never rendered as a result — this page's one rule,
          fourth instance. Without the day logs there are neither hours nor
          items, so there is no partial answer to give and none is given. */}
      {hoursFailed && (
        <Typography variant="body2" color="text.secondary">
          {WEEK_BY_SUBJECT_UNAVAILABLE_LINE}
        </Typography>
      )}

      {!hoursFailed && loading && (
        <Typography variant="body2" color="text.secondary">
          Reading this week’s subjects…
        </Typography>
      )}

      {/* One line, not seven empty cards (the `hasAnyEvidenceToShow` rule
          `WeekInEvidence` already follows). A quiet week is a week, and this
          says so rather than rendering a report with nothing in it. */}
      {!hoursFailed && !loading && subjects.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {WEEK_BY_SUBJECT_EMPTY_LINE}
        </Typography>
      )}

      {!hoursFailed && !loading && subjects.length > 0 && (
        <Stack spacing={2} divider={<Divider flexItem />}>
          {subjects.map((subject) => (
            <SubjectBlock key={subject.subjectBucket} subject={subject} />
          ))}
        </Stack>
      )}

      {/* Said once for the section, never as a count under each subject: the
          evidence counts AND the topic lines both come from the artifacts. */}
      {!hoursFailed && evidenceFailed && (
        <Typography variant="body2" color="text.secondary">
          {EVIDENCE_UNAVAILABLE_LINE}
        </Typography>
      )}
    </SectionCard>
  )
}

/**
 * One subject's week: its name and counted time on one line, then what got
 * done, then what was captured, then — for a strand — which topics.
 *
 * Each line is omitted when it has nothing to say, rather than rendering an
 * empty label. The hours sit beside the subject name and the items below,
 * because they are two readings of the week and not one explaining the other.
 */
function SubjectBlock({ subject }: { subject: WeekSubjectSummary }) {
  const items = subjectItemsLine(subject.items)
  const evidence = subjectEvidenceLine(subject.artifactCount)
  const topics = subjectTopicsLine(subject.topics)

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        justifyContent="space-between"
        alignItems="baseline"
        flexWrap="wrap"
        useFlexGap
      >
        <Typography variant="subtitle2" fontWeight={700}>
          {subject.label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {subjectHoursLine(subject.totalMinutes)}
        </Typography>
      </Stack>

      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        {items && <Typography variant="body2">{items}</Typography>}
        {topics && (
          <Typography variant="body2" color="text.secondary">
            Topics: {topics}
          </Typography>
        )}
        {evidence && (
          <Typography variant="body2" color="text.secondary">
            {evidence}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
