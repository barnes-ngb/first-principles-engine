import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import { dayTotalMinutes } from './chatPlanner.logic'

interface PlanPreviewCardProps {
  plan: DraftWeeklyPlan
  hoursPerDay: number
  weekEnergy: 'full' | 'lighter' | 'mvd'
  masteryReviewLine?: string
  onToggleItem?: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId?: string
}

export default function PlanPreviewCard({ plan, hoursPerDay, weekEnergy, masteryReviewLine, onToggleItem, onGenerateActivity, generatingItemId }: PlanPreviewCardProps) {
  const budgetMinutes = Math.round(hoursPerDay * 60)
  const skipCount = plan.skipSuggestions.filter((s) => s.action === 'skip').length
  const modifyCount = plan.skipSuggestions.filter((s) => s.action === 'modify').length

  const isRoutineItem = (item: DraftPlanItem) => item.category === 'must-do' || item.mvdEssential === true

  return (
    <Box sx={{ width: '100%' }}>
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Focus / Skip Summary
        </Typography>
        {masteryReviewLine && <Typography variant="body2">{masteryReviewLine}</Typography>}
        {plan.minimumWin?.trim() && (
          <Typography variant="caption" color="text.secondary">
            Plan note: {plan.minimumWin.trim()}
          </Typography>
        )}
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip label={`${skipCount} skip`} size="small" variant="outlined" color={skipCount > 0 ? 'default' : 'success'} />
          <Chip label={`${modifyCount} modify`} size="small" variant="outlined" color={modifyCount > 0 ? 'warning' : 'default'} />
        </Stack>
      </Stack>

      {plan.skipSuggestions.length > 0 && (
        <Stack spacing={0.5} sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {plan.skipSuggestions
              .filter(s => s.action === 'skip')
              .map((s, i) => (
                <Tooltip key={`skip-${i}`} title={`${s.reason} — ${s.replacement}`} arrow>
                  <Chip label={`Skip: ${s.reason}`} size="small" color="default" variant="outlined" />
                </Tooltip>
              ))}
            {plan.skipSuggestions
              .filter(s => s.action === 'modify')
              .map((s, i) => (
                <Tooltip key={`mod-${i}`} title={`${s.reason} — ${s.replacement}`} arrow>
                  <Chip label={`Modify: ${s.reason}`} size="small" color="warning" variant="outlined" />
                </Tooltip>
              ))}
          </Stack>
        </Stack>
      )}

      {plan.days.map((day, dayIndex) => {
        const total = dayTotalMinutes(day)
        const overBudget = total > budgetMinutes
        const routineItems = day.items.filter(isRoutineItem)
        const focusItems = day.items.filter(item => !isRoutineItem(item))

        const renderItem = (item: DraftPlanItem) => (
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
              {onGenerateActivity && item.accepted && !item.isAppBlock && (
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

        const routineTotal = routineItems.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0)
        const generatedTotal = focusItems.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0)
        const additionsBudget = Math.max(0, budgetMinutes - routineTotal)
        const generatedOverBudget = generatedTotal > additionsBudget

        return (
          <Box key={day.day} sx={{ mb: 2 }}>
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
            {generatedOverBudget && (
              <Alert severity="info" sx={{ py: 0, mb: 0.5 }}>
                <Typography variant="caption">
                  {weekEnergy === 'full'
                    ? `Themed/generated load is ${generatedTotal}m, but Full Week budget leaves ${additionsBudget}m beyond routine. Reduce generated additions to stay on target.`
                    : `Themed/generated load is ${generatedTotal}m, but your selected budget allows ${additionsBudget}m beyond routine. Reduce generated additions to stay on target.`}
                </Typography>
              </Alert>
            )}

            {day.items.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                No items
              </Typography>
            ) : (
              <>
                {/* ROUTINE section */}
                {routineItems.length > 0 && (
                  <Box sx={{ pl: 1, mb: 0.5 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}
                    >
                      Routine
                    </Typography>
                    <Stack spacing={0.25} sx={{ color: 'text.secondary' }}>
                      {routineItems.map(item => renderItem(item))}
                    </Stack>
                  </Box>
                )}

                {/* TODAY'S FOCUS section */}
                {focusItems.length > 0 && (
                  <Box sx={{ pl: 1, mt: 0.5 }}>
                    <Typography
                      variant="caption"
                      color="secondary.main"
                      sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}
                    >
                      Today&apos;s Focus{focusItems.length >= 3 ? ' · Choose 2' : ''}
                    </Typography>
                    <Stack spacing={0.25}>
                      {focusItems.map(item => renderItem(item))}
                    </Stack>
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
