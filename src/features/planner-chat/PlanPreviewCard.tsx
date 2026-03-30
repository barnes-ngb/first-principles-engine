import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'
import { dayTotalMinutes } from './chatPlanner.logic'

interface PlanPreviewCardProps {
  plan: DraftWeeklyPlan
  hoursPerDay: number
  onToggleItem?: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId?: string
}

export default function PlanPreviewCard({ plan, hoursPerDay, onToggleItem, onGenerateActivity, generatingItemId }: PlanPreviewCardProps) {
  const budgetMinutes = Math.round(hoursPerDay * 60)

  return (
    <Box sx={{ width: '100%' }}>
      <Stack spacing={0.5} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="primary">
          Minimum Win
        </Typography>
        {plan.minimumWin.length <= 100 ? (
          <Typography variant="body2">{plan.minimumWin}</Typography>
        ) : (
          <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2">{plan.minimumWin.slice(0, 100)}…</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              <Typography variant="body2">{plan.minimumWin}</Typography>
            </AccordionDetails>
          </Accordion>
        )}
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
        const mustDoItems = day.items.filter(item => item.category === 'must-do')
        const chooseItems = day.items.filter(item => item.category === 'choose' || item.category === undefined)

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

        const mustDoTotal = mustDoItems.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0)
        const generatedAdditionsMinutes = Math.max(0, total - mustDoTotal)
        const additionsBudgetMinutes = Math.max(0, budgetMinutes - mustDoTotal)
        const generatedAdditionsOverBudget = generatedAdditionsMinutes > additionsBudgetMinutes
        const shouldShowLoadWarning = generatedAdditionsOverBudget

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
            {shouldShowLoadWarning && (
              <Alert severity="info" sx={{ py: 0, mb: 0.5 }}>
                <Typography variant="caption">
                  Generated/themed additions are {generatedAdditionsMinutes}m (budget {additionsBudgetMinutes}m). Consider trimming added items to stay within your selected week target.
                </Typography>
              </Alert>
            )}

            {day.items.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                No items
              </Typography>
            ) : (
              <>
                {/* Must-Do section */}
                {mustDoItems.length > 0 && (
                  <Box sx={{ pl: 1, mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Must Do
                    </Typography>
                    <Stack spacing={0.25}>
                      {mustDoItems.map(item => renderItem(item))}
                    </Stack>
                  </Box>
                )}

                {/* Choose section */}
                {chooseItems.length > 0 && (
                  <Box sx={{ pl: 1, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Choose{chooseItems.length >= 3 ? ' 2' : ''}
                    </Typography>
                    <Stack spacing={0.25}>
                      {chooseItems.map(item => renderItem(item))}
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
