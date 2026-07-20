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
  onToggleItem: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId: string | null
  applied: boolean
  onMoveItem?: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void
  onRemoveItem?: (dayIndex: number, itemIndex: number) => void
  onUpdateTime?: (dayIndex: number, itemIndex: number, newMinutes: number) => void
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
        onToggleItem={onToggleItem}
        onGenerateActivity={!applied ? onGenerateActivity : undefined}
        generatingItemId={generatingItemId ?? undefined}
        onMoveItem={!applied ? onMoveItem : undefined}
        onRemoveItem={!applied ? onRemoveItem : undefined}
        onUpdateTime={!applied ? onUpdateTime : undefined}
        onAddWatchItem={!applied ? onAddWatchItem : undefined}
      />
    </Box>
  )
}
