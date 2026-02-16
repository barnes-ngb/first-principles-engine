import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { DraftWeeklyPlan } from '../../core/types/domain'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'
import { dayTotalMinutes } from './chatPlanner.logic'

interface PlanPreviewCardProps {
  plan: DraftWeeklyPlan
  hoursPerDay: number
  onToggleItem?: (dayIndex: number, itemId: string) => void
}

export default function PlanPreviewCard({ plan, hoursPerDay, onToggleItem }: PlanPreviewCardProps) {
  const budgetMinutes = Math.round(hoursPerDay * 60)

  return (
    <Box sx={{ width: '100%' }}>
      <Stack spacing={0.5} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="primary">
          Minimum Win
        </Typography>
        <Typography variant="body2">{plan.minimumWin}</Typography>
      </Stack>

      {plan.skipSuggestions.length > 0 && (
        <Stack spacing={0.5} sx={{ mb: 1.5 }}>
          {plan.skipSuggestions.map((s, i) => (
            <Alert key={i} severity="warning" sx={{ py: 0 }}>
              <Typography variant="body2">
                <strong>{s.action === 'skip' ? 'Skip' : 'Modify'}:</strong> {s.reason}
                {' \u2014 '}{s.replacement}
              </Typography>
              {s.evidence && (
                <Typography variant="caption" color="text.secondary">
                  Why: {s.evidence}
                </Typography>
              )}
            </Alert>
          ))}
        </Stack>
      )}

      {plan.days.map((day, dayIndex) => {
        const total = dayTotalMinutes(day)
        const overBudget = total > budgetMinutes
        return (
          <Box key={day.day} sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {day.day}
              </Typography>
              <Chip
                label={`${total}m / ${budgetMinutes}m`}
                size="small"
                color={overBudget ? 'error' : 'default'}
                variant="outlined"
              />
            </Stack>
            <Stack spacing={0.25} sx={{ pl: 1 }}>
              {day.items.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No items
                </Typography>
              ) : (
                day.items.map((item) => (
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
                            <CheckCircleIcon fontSize="small" color="success" />
                          ) : (
                            <RadioButtonUncheckedIcon fontSize="small" />
                          )}
                        </IconButton>
                      ) : (
                        item.accepted ? (
                          <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 0.5 }} />
                        ) : (
                          <RadioButtonUncheckedIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.4 }} />
                        )
                      )}
                      <Typography
                        variant="body2"
                        sx={{
                          flex: 1,
                          textDecoration: item.accepted ? 'none' : 'line-through',
                        }}
                      >
                        {item.title}
                      </Typography>
                      {/* Skill tags as small chips */}
                      {item.skillTags.length > 0 && (
                        <Stack direction="row" spacing={0.25} flexWrap="wrap" useFlexGap>
                          {item.skillTags.slice(0, 2).map((tag) => {
                            const def = SKILL_TAG_MAP[tag]
                            return (
                              <Tooltip key={tag} title={def?.evidence ?? tag} arrow>
                                <Chip
                                  label={def?.label ?? tag.split('.').pop()}
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ height: 18, fontSize: '0.65rem' }}
                                />
                              </Tooltip>
                            )
                          })}
                        </Stack>
                      )}
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
                    </Stack>
                  </Box>
                ))
              )}
            </Stack>
          </Box>
        )
      })}
    </Box>
  )
}
