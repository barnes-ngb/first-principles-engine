import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import PlanPreviewCard from './PlanPreviewCard'

interface PlanDayCardsProps {
  draft: DraftWeeklyPlan
  hoursPerDay: number
  masteryReviewLine: string
  readAloudBook: string
  onToggleItem: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId: string | null
  applied: boolean
  onMoveItem?: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void
  onRemoveItem?: (dayIndex: number, itemIndex: number) => void
  onUpdateTime?: (dayIndex: number, itemIndex: number, newMinutes: number) => void
}

export default function PlanDayCards({
  draft,
  hoursPerDay,
  masteryReviewLine,
  onToggleItem,
  onGenerateActivity,
  generatingItemId,
  applied,
  onMoveItem,
  onRemoveItem,
  onUpdateTime,
}: PlanDayCardsProps) {
  return (
    <Box sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 2,
      bgcolor: 'background.paper',
      p: 2,
    }}>
      <Typography variant="h6" gutterBottom>Your Week Plan</Typography>
      <PlanPreviewCard
        plan={draft}
        hoursPerDay={hoursPerDay}
        masteryReviewLine={masteryReviewLine}
        onToggleItem={onToggleItem}
        onGenerateActivity={!applied ? onGenerateActivity : undefined}
        generatingItemId={generatingItemId ?? undefined}
        onMoveItem={!applied ? onMoveItem : undefined}
        onRemoveItem={!applied ? onRemoveItem : undefined}
        onUpdateTime={!applied ? onUpdateTime : undefined}
      />
    </Box>
  )
}
