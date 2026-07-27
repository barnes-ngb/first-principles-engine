import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan, SkillSnapshot } from '../../core/types'
import { formatPlanningWeekLabel } from './chatPlanner.logic'
import PlanPreviewCard from './PlanPreviewCard'

interface PlanDayCardsProps {
  draft: DraftWeeklyPlan
  hoursPerDay: number
  masteryReviewLine: string
  readAloudBook: string
  /** Sunday-start of the planning week; drives the "Week of …" header and each
   *  day card's concrete date (FEAT-112). */
  weekStart: string
  snapshot?: SkillSnapshot | null
  /**
   * Toggle an item's `accepted` flag on the DRAFT. Gated off once `applied`
   * (FEAT-133, Codex P2 on PR #1640): the applied view's cards are advertised as
   * read-only, and a toggle there edits a draft that no longer has an Apply bar
   * to flush it — so the card would silently disagree with the live checklist,
   * and a subsequent "Add a video" would persist that divergence to the
   * conversation. `PlanPreviewCard` renders a static icon when it is absent, so
   * the control becomes genuinely inert rather than a dead-looking button.
   */
  onToggleItem?: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId: string | null
  applied: boolean
  onMoveItem?: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void
  onRemoveItem?: (dayIndex: number, itemIndex: number) => void
  onUpdateTime?: (dayIndex: number, itemIndex: number, newMinutes: number) => void
  /**
   * Open the Watch Library picker for `dayIndex`.
   *
   * FEAT-132: this one deliberately SURVIVES Apply, unlike the structural edits
   * above (move / remove / retime / generate), which are gated off once the week
   * is live because they'd have to reconcile against days the family may already
   * be working through. Adding a video is purely additive, so the caller writes
   * it straight into the saved day — see `handleAddWatchItem` in
   * `PlannerChatPage`. Passing it unconditionally is the point: gating it on
   * `!applied` is what made the planner's add path vanish the moment the week
   * went live.
   */
  onAddWatchItem?: (dayIndex: number) => void
}

export default function PlanDayCards({
  draft,
  hoursPerDay,
  masteryReviewLine,
  weekStart,
  snapshot,
  onToggleItem,
  onGenerateActivity,
  generatingItemId,
  applied,
  onMoveItem,
  onRemoveItem,
  onUpdateTime,
  onAddWatchItem,
}: PlanDayCardsProps) {
  const weekLabel = formatPlanningWeekLabel(weekStart)
  return (
    <Box sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 2,
      bgcolor: 'background.paper',
      p: 2,
    }}>
      <Typography variant="h6" gutterBottom={!weekLabel}>Your Week Plan</Typography>
      {weekLabel && (
        <Typography
          variant="subtitle1"
          color="primary"
          sx={{ fontWeight: 700, mb: 1.5 }}
        >
          {weekLabel}
        </Typography>
      )}
      <PlanPreviewCard
        plan={draft}
        hoursPerDay={hoursPerDay}
        masteryReviewLine={masteryReviewLine}
        weekStart={weekStart}
        snapshot={snapshot ?? null}
        onToggleItem={!applied ? onToggleItem : undefined}
        onGenerateActivity={!applied ? onGenerateActivity : undefined}
        generatingItemId={generatingItemId ?? undefined}
        onMoveItem={!applied ? onMoveItem : undefined}
        onRemoveItem={!applied ? onRemoveItem : undefined}
        onUpdateTime={!applied ? onUpdateTime : undefined}
        onAddWatchItem={onAddWatchItem}
      />
    </Box>
  )
}
