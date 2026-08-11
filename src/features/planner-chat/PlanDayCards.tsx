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
  /**
   * Reorder an item WITHIN its day, on the draft. Still `!applied`-gated
   * (FEAT-138): position is the one edit whose draft and saved-day meanings
   * diverge — the saved checklist also holds manual rows and completed work the
   * draft never had, so a reorder of the mirror would write an order the parent
   * never saw. Changing which DAY something happens on is
   * {@link PlanDayCardsProps.onMoveItemToDay}, which is well-defined by row
   * identity and does survive Apply.
   */
  onMoveItem?: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void
  /**
   * Remove an item from its day. **Survives Apply** (FEAT-138) — the caller
   * branches on `applied` and writes the removal into the saved day rather than
   * into a draft nothing would flush.
   */
  onRemoveItem?: (dayIndex: number, itemIndex: number) => void
  /**
   * Edit an item's planned minutes. **Deliberately still `!applied`-gated**
   * (owner decision, held twice): planned minutes are compliance hours, and
   * editing them on a live week moves a child's record. The sanctioned way a
   * duration changes is the confirm-gated activity default (FEAT-135), which is
   * forward-only.
   */
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
  /**
   * Move an item to a different day of the week. **Survives Apply** (FEAT-138)
   * — this is the edit the whole run exists for (*"sometimes the video changes
   * the day it will be watched"*), so gating it off once the week is live would
   * withhold it exactly when it is wanted.
   */
  onMoveItemToDay?: (dayIndex: number, itemIndex: number) => void
  /** Change a watch row's video. **Survives Apply** (FEAT-138). */
  onSwapWatchItem?: (dayIndex: number, itemIndex: number) => void
  /** Per-row lock reason for the post-Apply structural edits (FEAT-138). */
  itemEditLockReason?: (dayIndex: number, itemIndex: number) => string | null
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
  onMoveItemToDay,
  onSwapWatchItem,
  itemEditLockReason,
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
      {/* What stays gated once the week is live, and what no longer does
          (FEAT-138). Gated: the acceptance toggle and activity generation
          (draft-only concepts), the within-day reorder, and — deliberately,
          held twice — planned minutes. Ungated: remove, move-to-another-day,
          swap-video and add-video, each of which the caller writes straight
          into the saved day. The gate lives here rather than at the call site
          because that is where FEAT-133 put it and where a reader looks. */}
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
        onRemoveItem={onRemoveItem}
        onUpdateTime={!applied ? onUpdateTime : undefined}
        onAddWatchItem={onAddWatchItem}
        onMoveItemToDay={onMoveItemToDay}
        onSwapWatchItem={onSwapWatchItem}
        itemEditLockReason={itemEditLockReason}
      />
    </Box>
  )
}
