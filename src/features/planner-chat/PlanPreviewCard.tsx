import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import { dayTotalMinutes } from './chatPlanner.logic'

const QUESTION_TYPE_EMOJI: Record<string, string> = {
  comprehension: '\uD83D\uDD0D',
  application: '\uD83C\uDF0E',
  connection: '\uD83D\uDD17',
  opinion: '\uD83D\uDCAD',
  prediction: '\uD83D\uDD2E',
}

function questionTypeEmoji(questionType: string): string {
  const key = questionType.toLowerCase().trim()
  return QUESTION_TYPE_EMOJI[key] ?? '\u2753'
}

interface PlanPreviewCardProps {
  plan: DraftWeeklyPlan
  hoursPerDay: number
  masteryReviewLine?: string
  onToggleItem?: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId?: string
}

export default function PlanPreviewCard({ plan, hoursPerDay, masteryReviewLine, onToggleItem, onGenerateActivity, generatingItemId }: PlanPreviewCardProps) {
  const budgetMinutes = Math.round(hoursPerDay * 60)

  const isRoutineItem = (item: DraftPlanItem) => item.category === 'must-do' || item.mvdEssential === true

  return (
    <Box sx={{ width: '100%' }}>
      {/* One-line focus/skip summary */}
      {masteryReviewLine && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            mb: 2,
            p: 1.5,
            bgcolor: 'info.50',
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'info.200',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {masteryReviewLine}
          </Typography>
        </Stack>
      )}

      {plan.days.map((day, dayIndex) => {
        const total = dayTotalMinutes(day)
        const routineItems = day.items.filter(isRoutineItem)
        const focusItems = day.items.filter(item => !isRoutineItem(item))

        // Only warn when generated/focus items exceed the budget remaining after routine
        const routineTotal = routineItems.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0)
        const generatedTotal = focusItems.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0)
        const additionsBudget = Math.max(0, budgetMinutes - routineTotal)
        const generatedOverBudget = generatedTotal > additionsBudget && additionsBudget > 0

        const renderItem = (item: DraftPlanItem, isRoutine: boolean) => (
          <Box key={item.id}>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{
                py: 0.25,
                opacity: item.accepted ? 1 : 0.4,
              }}
            >
              {onToggleItem ? (
                <IconButton
                  size="small"
                  onClick={() => onToggleItem(dayIndex, item.id)}
                  sx={{ p: 0.25 }}
                >
                  {item.accepted ? (
                    <CheckCircleIcon fontSize="small" color={isRoutine ? 'action' : 'success'} />
                  ) : (
                    <RadioButtonUncheckedIcon fontSize="small" />
                  )}
                </IconButton>
              ) : (
                item.accepted ? (
                  <CheckCircleIcon fontSize="small" color={isRoutine ? 'action' : 'success'} sx={{ mr: 0.5 }} />
                ) : (
                  <RadioButtonUncheckedIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.4 }} />
                )
              )}
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  textDecoration: item.accepted ? 'none' : 'line-through',
                  color: isRoutine ? 'text.secondary' : 'text.primary',
                  fontWeight: isRoutine ? 400 : 500,
                }}
              >
                {item.title}
              </Typography>
              {item.isAppBlock && (
                <Chip label="App" size="small" variant="outlined" sx={{ height: 20 }} />
              )}
              {item.skipSuggestion && (
                <Tooltip
                  title={`${item.skipSuggestion.reason} \u2014 ${item.skipSuggestion.replacement}`}
                  arrow
                >
                  <Chip
                    label={item.skipSuggestion.action}
                    size="small"
                    color={item.skipSuggestion.action === 'skip' ? 'error' : 'warning'}
                    sx={{ height: 20 }}
                  />
                </Tooltip>
              )}
              <Typography variant="caption" color="text.secondary">
                {item.estimatedMinutes}m
              </Typography>
              {onGenerateActivity && item.accepted && !item.isAppBlock && !isRoutine && (
                <Tooltip title="Generate activity" arrow>
                  <IconButton
                    size="small"
                    onClick={() => onGenerateActivity(item)}
                    disabled={generatingItemId === item.id}
                    sx={{ p: 0.25, ml: 0.25 }}
                    color="secondary"
                  >
                    <AutoAwesomeIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Box>
        )

        return (
          <Box key={day.day} sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {day.day}
              </Typography>
              <Chip
                label={`${total}m / ${budgetMinutes}m`}
                size="small"
                variant="outlined"
                color={total > budgetMinutes + 15 ? 'error' : total <= budgetMinutes ? 'success' : 'warning'}
              />
            </Stack>
            {generatedOverBudget && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.5, pl: 1 }}>
                Focus items ({generatedTotal}m) exceed remaining budget ({additionsBudget}m beyond routine).
              </Typography>
            )}

            {day.items.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                No items
              </Typography>
            ) : (
              <>
                {/* ROUTINE section — muted, same every day */}
                {routineItems.length > 0 && (
                  <Box sx={{ pl: 1, mb: 0.5 }}>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: '0.65rem' }}
                    >
                      Routine
                    </Typography>
                    <Stack spacing={0}>
                      {routineItems.map(item => renderItem(item, true))}
                    </Stack>
                  </Box>
                )}

                {/* TODAY'S FOCUS section — highlighted, themed */}
                {focusItems.length > 0 && (
                  <Box
                    sx={{
                      pl: 1,
                      mt: 0.5,
                      ml: 0.5,
                      borderLeft: '3px solid',
                      borderColor: 'secondary.main',
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="secondary.main"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}
                    >
                      Today&apos;s Focus{focusItems.length >= 3 ? ' \u00b7 Choose 2' : ''}
                    </Typography>
                    <Stack spacing={0.25}>
                      {focusItems.map(item => renderItem(item, false))}
                    </Stack>
                  </Box>
                )}

                {/* Chapter question for the day */}
                {day.chapterQuestion && (
                  <Box
                    sx={{
                      mt: 1,
                      ml: 1,
                      p: 1.25,
                      bgcolor: 'grey.50',
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {questionTypeEmoji(day.chapterQuestion.questionType)} {day.chapterQuestion.book} — {day.chapterQuestion.chapter}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                      &ldquo;{day.chapterQuestion.question}&rdquo;
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
