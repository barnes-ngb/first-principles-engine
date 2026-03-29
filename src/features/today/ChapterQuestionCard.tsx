import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type { DayLog } from '../../core/types'

interface ChapterQuestionCardProps {
  dayLog: DayLog
  persistDayLogImmediate: (updated: DayLog) => void
}

export default function ChapterQuestionCard({
  dayLog,
  persistDayLogImmediate,
}: ChapterQuestionCardProps) {
  if (!dayLog.chapterQuestion) return null

  return (
    <SectionCard title={`\u{1F4D6} Reading: ${dayLog.chapterQuestion.book}`}>
      <Stack spacing={1}>
        <Typography variant="subtitle2" color="text.secondary">
          {dayLog.chapterQuestion.chapter}
        </Typography>
        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
          {dayLog.chapterQuestion.question}
        </Typography>
        {dayLog.chapterQuestion.responded ? (
          <Stack spacing={1}>
            <Chip label="Lincoln responded ✓" color="success" size="small" />
            {dayLog.chapterQuestion.responseUrl && (
              <audio src={dayLog.chapterQuestion.responseUrl} controls style={{ width: '100%' }} />
            )}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Waiting for Lincoln&apos;s response on his view.
          </Typography>
        )}
        <TextField
          label="Shelly's note (optional)"
          placeholder="What did you notice about his response?"
          size="small"
          multiline
          rows={2}
          value={dayLog.chapterQuestion.responseNote ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (dayLog.chapterQuestion?.responseNote ?? '')) {
              persistDayLogImmediate({
                ...dayLog,
                chapterQuestion: { ...dayLog.chapterQuestion!, responseNote: e.target.value },
              })
            }
          }}
        />
      </Stack>
    </SectionCard>
  )
}
