import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import PlanPreviewCard from './PlanPreviewCard'

const CHAPTER_QUESTION_TYPE_EMOJI: Record<string, string> = {
  comprehension: '\uD83D\uDD0D',
  application: '\uD83C\uDF0E',
  connection: '\uD83D\uDD17',
  opinion: '\uD83D\uDCAD',
  prediction: '\uD83D\uDD2E',
}

interface ChapterQuestionDay {
  day: string
  chapterQuestion: {
    book: string
    chapter: string
    questionType: string
    question: string
  }
}

interface PlanDayCardsProps {
  draft: DraftWeeklyPlan
  hoursPerDay: number
  masteryReviewLine: string
  chapterQuestionsByDay: ChapterQuestionDay[]
  readAloudBook: string
  onToggleItem: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId: string | null
  applied: boolean
}

export default function PlanDayCards({
  draft,
  hoursPerDay,
  masteryReviewLine,
  chapterQuestionsByDay,
  readAloudBook,
  onToggleItem,
  onGenerateActivity,
  generatingItemId,
  applied,
}: PlanDayCardsProps) {
  return (
    <>
      {chapterQuestionsByDay.length > 0 && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'grey.50',
            p: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            {readAloudBook ? `${readAloudBook} This Week` : 'Read-Aloud Chapter Questions'}
          </Typography>
          <Stack spacing={1}>
            {chapterQuestionsByDay.map(({ day, chapterQuestion }) => {
              const emoji = CHAPTER_QUESTION_TYPE_EMOJI[chapterQuestion.questionType.toLowerCase().trim()] ?? '\u2753'
              return (
                <Box key={day} sx={{ p: 1.5, bgcolor: 'background.paper', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography variant="subtitle2" sx={{ minWidth: 70 }}>{day}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {chapterQuestion.chapter}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                    {emoji} &ldquo;{chapterQuestion.question}&rdquo;
                  </Typography>
                </Box>
              )
            })}
          </Stack>
        </Box>
      )}

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
        />
      </Box>
    </>
  )
}
