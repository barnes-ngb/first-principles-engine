import { useState } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import { dayTotalMinutes } from './chatPlanner.logic'

/** Block display metadata for plan preview grouping. */
const BLOCK_HEADER: Record<string, { label: string; color: string }> = {
  readaloud: { label: 'Paired \u2014 happen at the same time', color: 'info.main' },
  choice: { label: "Lincoln\u2019s choice (do both, pick order)", color: 'warning.main' },
  flex: { label: 'Flex \u2014 end of day', color: 'text.secondary' },
}

/** Ordered list of blocks for consistent rendering. */
const BLOCK_ORDER = ['formation', 'readaloud', 'choice', 'core-reading', 'core-math', 'flex', 'independent', 'other'] as const


interface PlanPreviewCardProps {
  plan: DraftWeeklyPlan
  hoursPerDay: number
  masteryReviewLine?: string
  onToggleItem?: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId?: string
  onMoveItem?: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void
  onRemoveItem?: (dayIndex: number, itemIndex: number) => void
  onUpdateTime?: (dayIndex: number, itemIndex: number, newMinutes: number) => void
}

const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60]

function EditableTime({ minutes, editable, onUpdate }: { minutes: number; editable: boolean; onUpdate: (mins: number) => void }) {
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null)

  if (!editable) {
    return (
      <Typography variant="caption" color="text.secondary">
        {minutes}m
      </Typography>
    )
  }

  return (
    <>
      <Typography
        ref={setAnchorEl}
        variant="caption"
        color="text.secondary"
        onClick={() => setOpen(true)}
        sx={{
          cursor: 'pointer',
          minWidth: '40px',
          textAlign: 'right',
          '&:hover': { textDecoration: 'underline', color: 'primary.main' },
        }}
      >
        {minutes}m
      </Typography>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box sx={{ display: 'flex', gap: 0.5, p: 1 }}>
          {TIME_PRESETS.map(mins => (
            <Chip
              key={mins}
              label={`${mins}m`}
              size="small"
              variant={mins === minutes ? 'filled' : 'outlined'}
              color={mins === minutes ? 'primary' : 'default'}
              onClick={() => {
                onUpdate(mins)
                setOpen(false)
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  )
}

export default function PlanPreviewCard({ plan, hoursPerDay, masteryReviewLine, onToggleItem, onGenerateActivity, generatingItemId, onMoveItem, onRemoveItem, onUpdateTime }: PlanPreviewCardProps) {
  const budgetMinutes = Math.round(hoursPerDay * 60)
  const [removeConfirm, setRemoveConfirm] = useState<{ dayIndex: number; itemIndex: number; title: string } | null>(null)

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

        const totalItems = day.items.length

        const renderItem = (item: DraftPlanItem, isRoutine: boolean) => {
          const itemIndex = day.items.indexOf(item)

          return (
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
                <EditableTime
                  minutes={item.estimatedMinutes}
                  editable={!!onUpdateTime}
                  onUpdate={(mins) => onUpdateTime?.(dayIndex, itemIndex, mins)}
                />
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
                {onMoveItem && onRemoveItem && (
                  <Box sx={{ display: 'flex', gap: 0, ml: 0.5, opacity: 0.6 }}>
                    <IconButton
                      size="small"
                      onClick={() => onMoveItem(dayIndex, itemIndex, -1)}
                      disabled={itemIndex === 0}
                      sx={{ p: 0.25 }}
                    >
                      <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => onMoveItem(dayIndex, itemIndex, 1)}
                      disabled={itemIndex === totalItems - 1}
                      sx={{ p: 0.25 }}
                    >
                      <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setRemoveConfirm({ dayIndex, itemIndex, title: item.title })}
                      sx={{ p: 0.25 }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                )}
              </Stack>
            </Box>
          )
        }

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
            ) : (() => {
              // Group items by block for structured display
              const hasBlocks = day.items.some(item => item.block)

              if (hasBlocks) {
                // Block-based grouping
                const blockGroups = new Map<string, DraftPlanItem[]>()
                for (const item of day.items) {
                  const key = item.block || 'other'
                  if (!blockGroups.has(key)) blockGroups.set(key, [])
                  blockGroups.get(key)!.push(item)
                }

                // Render in block order
                const orderedBlocks = BLOCK_ORDER.filter(b => blockGroups.has(b))

                return (
                  <>
                    {orderedBlocks.map(blockName => {
                      const blockItems = blockGroups.get(blockName)!
                      const header = BLOCK_HEADER[blockName]

                      return (
                        <Box key={blockName} sx={{ mb: 1, pl: 1 }}>
                          {header && (
                            <Typography
                              variant="caption"
                              color={header.color}
                              sx={{ fontWeight: 500, mb: 0.25, display: 'block', fontSize: '0.7rem' }}
                            >
                              {header.label}
                            </Typography>
                          )}
                          <Stack spacing={0}>
                            {blockItems.map(item => renderItem(item, isRoutineItem(item)))}
                          </Stack>
                        </Box>
                      )
                    })}

                  </>
                )
              }

              // Fallback: legacy routine/focus split when no blocks present
              return (
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

                </>
              )
            })()}
          </Box>
        )
      })}

      {/* Remove item confirmation dialog */}
      <Dialog open={!!removeConfirm} onClose={() => setRemoveConfirm(null)}>
        <DialogTitle>Remove item?</DialogTitle>
        <DialogContent>
          <Typography>
            Remove &ldquo;{removeConfirm?.title}&rdquo; from this day?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveConfirm(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (removeConfirm && onRemoveItem) {
                onRemoveItem(removeConfirm.dayIndex, removeConfirm.itemIndex)
              }
              setRemoveConfirm(null)
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
