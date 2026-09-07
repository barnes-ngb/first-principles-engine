import { useMemo, useState } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import SwitchVideoIcon from '@mui/icons-material/SwitchVideo'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CircleIcon from '@mui/icons-material/Circle'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type {
  DayTypeConfig,
  DraftPlanItem,
  DraftWeeklyPlan,
  SkillSnapshot,
  SkipAdvisorResult,
} from '../../core/types'
import { DayType } from '../../core/types/enums'
import { dayTotalMinutes, formatDayCardLabel } from './chatPlanner.logic'
import PlannerDayTypeChip from './PlannerDayTypeChip'
import { PLANNER_DAY_TYPE_CHOICES, resolvePlannerDayType } from './plannerDayTypes'
import { batchEvaluateSkip } from './skipAdvisor.logic'
import SkipAdvisorChip from './SkipAdvisorChip'

/** Block display metadata for plan preview grouping. */
const BLOCK_HEADER: Record<string, { label: string; color: string }> = {
  readaloud: { label: 'Paired \u2014 happen at the same time', color: 'info.main' },
  // UX-64: the block is "whoever this week is for picks the order" \u2014 the name was
  // hardcoded, so it rendered "Lincoln's choice" over London's plan.
  choice: { label: "Kid\u2019s choice (do both, pick order)", color: 'warning.main' },
  flex: { label: 'Flex \u2014 end of day', color: 'text.secondary' },
}

/** Ordered list of blocks for consistent rendering. */
const BLOCK_ORDER = ['formation', 'readaloud', 'choice', 'core-reading', 'core-math', 'flex', 'independent', 'other'] as const


interface PlanPreviewCardProps {
  plan: DraftWeeklyPlan
  hoursPerDay: number
  masteryReviewLine?: string
  /** Sunday-start of the planning week; renders each day header as the concrete
   *  mapped calendar date ("Monday · Jul 20"), FEAT-112. Optional — falls back
   *  to the bare weekday name when absent. */
  weekStart?: string
  snapshot?: SkillSnapshot | null
  onToggleItem?: (dayIndex: number, itemId: string) => void
  onGenerateActivity?: (item: DraftPlanItem) => void
  generatingItemId?: string
  onMoveItem?: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void
  onRemoveItem?: (dayIndex: number, itemIndex: number) => void
  onUpdateTime?: (dayIndex: number, itemIndex: number, newMinutes: number) => void
  /** Open the curated-video picker to plan a watch item onto this day (FEAT-104). */
  onAddWatchItem?: (dayIndex: number) => void
  /**
   * Move a row to a different day of the week (FEAT-138). Unlike the up/down
   * arrows — which reorder WITHIN a day and edit the draft — this is the "it's
   * happening Thursday now" edit, and it survives Apply because the caller
   * writes it into the saved days.
   */
  onMoveItemToDay?: (dayIndex: number, itemIndex: number) => void
  /** Change which video a watch row points at (FEAT-138). Watch rows only. */
  onSwapWatchItem?: (dayIndex: number, itemIndex: number) => void
  /**
   * Why this row's structural edits are locked, or `null` when it is freely
   * editable (FEAT-138). A completed row has credited minutes and may carry
   * evidence, so it refuses move / remove / swap — and the card SAYS so rather
   * than rendering a button that fails on tap.
   */
  itemEditLockReason?: (dayIndex: number, itemIndex: number) => string | null
  /**
   * The parent's per-day Full / Light / Life picks (UX-261). Absent, or a day
   * absent from it, reads as Full — the no-migration rule.
   */
  dayTypes?: DayTypeConfig[]
  /**
   * Set a day's type. **Absent renders no control** — the capability gate's
   * visible half; the caller withholds it for a kid profile.
   */
  onDayTypeChange?: (day: string, dayType: DayType) => void
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

export default function PlanPreviewCard({ plan, hoursPerDay, masteryReviewLine, weekStart, snapshot, onToggleItem, onGenerateActivity, generatingItemId, onMoveItem, onRemoveItem, onUpdateTime, onAddWatchItem, onMoveItemToDay, onSwapWatchItem, itemEditLockReason, dayTypes, onDayTypeChange }: PlanPreviewCardProps) {
  const budgetMinutes = Math.round(hoursPerDay * 60)
  const [removeConfirm, setRemoveConfirm] = useState<{ dayIndex: number; itemIndex: number; title: string } | null>(null)
  /** UX-251: which row's reorder overflow is open. One menu for the whole card. */
  const [reorderMenu, setReorderMenu] = useState<{
    anchorEl: HTMLElement
    dayIndex: number
    itemIndex: number
    totalItems: number
  } | null>(null)

  // Skip-advisor recommendations across all items. Render-time so chips
  // stay fresh as the user edits the plan.
  const advisorByItemId = useMemo<Map<string, SkipAdvisorResult>>(() => {
    if (!snapshot) return new Map()
    const allItems = plan.days.flatMap((d) => d.items)
    return batchEvaluateSkip(allItems, snapshot)
  }, [plan, snapshot])

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
        // UX-261. `dayType` is what the PARENT set; `day.items` is what survived
        // `enforceDayTypes`. They agree by construction — the enforcement runs on
        // every generated draft — so this is read purely to decide what the card
        // SAYS about a day that has deliberately no plan.
        const dayType = resolvePlannerDayType(day.day, dayTypes)
        const isSetAside = dayType === DayType.Life
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
          // FEAT-138: null when the row is freely editable. A locked row keeps
          // its buttons visible but disabled, and states the reason below —
          // tooltips don't open on a phone, and a silently inert button beside
          // an advertised action is the lie this run exists to stop telling.
          const lockReason = itemEditLockReason?.(dayIndex, itemIndex) ?? null
          const locked = lockReason !== null
          const canSwapWatch = onSwapWatchItem && item.itemType === 'watch'
          // UX-251: a one-item day has no reorder to offer, so it must not count
          // toward "this row has actions" either — otherwise a caller passing
          // only `onMoveItem` would render an empty actions box.
          const canReorder = !!onMoveItem && totalItems > 1
          const showActions =
            canReorder || !!onRemoveItem || !!onMoveItemToDay || !!canSwapWatch

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
                  /* UX-240: no toggle means this card is a MIRROR, not a
                     worksheet — the applied week, or the chat's read-only next-
                     week draft. A green tick there answers a question the card
                     cannot answer: whether the child has done it. That lives on
                     Today, and every row on a freshly-applied week wore the tick
                     the moment it was written. An included row gets a neutral
                     bullet; an excluded one keeps the empty ring it already had,
                     beside the strike-through the row already carries. */
                  item.accepted ? (
                    <Box
                      data-testid="plan-row-bullet"
                      sx={{
                        width: 20,
                        mr: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <CircleIcon sx={{ fontSize: 8, color: 'text.disabled' }} aria-hidden />
                    </Box>
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
                {(() => {
                  const advisor = advisorByItemId.get(item.id)
                  if (!advisor || advisor.action === 'keep') return null
                  return (
                    <SkipAdvisorChip
                      result={advisor}
                      label={advisor.action === 'skip' ? 'Skip eligible' : 'Lighter'}
                    />
                  )
                })()}
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
                {showActions && (
                  <Box sx={{ display: 'flex', gap: 0, ml: 0.5, opacity: 0.6 }}>
                    {/* UX-251: the within-day reorder used to be two bare 16px
                        arrows at `p: 0.25`, first in a row that can also carry a
                        change-video button, a move-to-another-day button and a
                        remove button — five icons beside a title, an App chip, a
                        skip chip and the editable minutes, on a 390px phone,
                        repeated across ~15 rows a day and five days.

                        It is the least-used of them (the model orders the day;
                        the parent's real edits are remove and move-to-another-
                        day) and the hardest to hit, so it goes behind one
                        overflow: the row loses a target, and reordering gains
                        full-width labelled menu rows instead of two adjacent
                        arrows a thumb cannot separate. The capability is
                        unchanged — same `onMoveItem`, same draft edit, same
                        `!applied` gate one level up in `PlanDayCards`.

                        Nothing is rendered for a one-item day, where both
                        directions are dead ends. */}
                    {canReorder && (
                      <IconButton
                        size="small"
                        onClick={(e) =>
                          setReorderMenu({
                            anchorEl: e.currentTarget,
                            dayIndex,
                            itemIndex,
                            totalItems,
                          })
                        }
                        sx={{ p: 0.25 }}
                        aria-label="Reorder this item"
                      >
                        <MoreVertIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                    {canSwapWatch && (
                      <Tooltip title={lockReason ?? 'Change video'} arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={locked}
                            onClick={() => onSwapWatchItem(dayIndex, itemIndex)}
                            sx={{ p: 0.25 }}
                            aria-label="Change video"
                          >
                            <SwitchVideoIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {onMoveItemToDay && (
                      <Tooltip title={lockReason ?? 'Move to another day'} arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={locked}
                            onClick={() => onMoveItemToDay(dayIndex, itemIndex)}
                            sx={{ p: 0.25 }}
                            aria-label="Move to another day"
                          >
                            <CalendarMonthIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {onRemoveItem && (
                      <Tooltip title={lockReason ?? 'Remove from this day'} arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={locked}
                            onClick={() => setRemoveConfirm({ dayIndex, itemIndex, title: item.title })}
                            sx={{ p: 0.25 }}
                            aria-label="Remove from this day"
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Box>
                )}
              </Stack>
              {showActions && locked && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', pl: 3.5, mt: -0.25, mb: 0.25 }}
                >
                  {lockReason}
                </Typography>
              )}
            </Box>
          )
        }

        return (
          <Box key={day.day} sx={{ mb: 2 }}>
            {/* UX-261 puts a third control on this row, and UX-182 is the
                cautionary tale for exactly that: FEAT-200's day-type chip was
                added to the end of a full non-wrapping row and was sheared off
                the right edge of the owner's 390px phone, so the feature had no
                reachable entry point on the only device she uses. This row wraps
                and gains a row gap, so day name / budget / day type break onto a
                second line rather than off the screen. */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {weekStart ? formatDayCardLabel(weekStart, day.day) : day.day}
              </Typography>
              {/* UX-71: an empty day rendered a GREEN `0m / 150m` over "No
                  items" — the success colour saying "within budget" about a day
                  that has no plan at all. A zero here is absence, not
                  achievement, so it gets the neutral chip and says so.
                  UX-261: a set-aside day gets no budget chip at all. Both of
                  UX-71's strings are wrong for it — `0m / 260m` reads as a
                  shortfall against a target and "Nothing planned yet" reads as
                  an omission, when nothing planned is precisely what the parent
                  chose. The day-type chip beside it already says what this is. */}
              {!isSetAside && (
                <Chip
                  label={total > 0 ? `${total}m / ${budgetMinutes}m` : 'Nothing planned yet'}
                  size="small"
                  variant="outlined"
                  color={
                    total === 0
                      ? 'default'
                      : total > budgetMinutes + 15
                        ? 'error'
                        : total <= budgetMinutes
                          ? 'success'
                          : 'warning'
                  }
                />
              )}
              <PlannerDayTypeChip
                day={day.day}
                dayType={dayType}
                onChange={
                  onDayTypeChange
                    ? (next) => onDayTypeChange(day.day, next)
                    : undefined
                }
              />
            </Stack>
            {generatedOverBudget && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 0.5, pl: 1 }}>
                Focus items ({generatedTotal}m) exceed remaining budget ({additionsBudget}m beyond routine).
              </Typography>
            )}

            {day.items.length === 0 ? (
              // UX-261: "No items" is a true sentence and the wrong one here.
              // On a day the parent SET ASIDE it reads as a plan that failed to
              // fill, when it is a plan that was declined — the same no-shame
              // rule FEAT-200 holds on Today, where nothing on a Life Day may
              // read as unfinished. A day that is empty for any other reason
              // keeps the original wording.
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                {isSetAside
                  ? PLANNER_DAY_TYPE_CHOICES.find((c) => c.value === DayType.Life)?.description
                  : 'No items'}
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

                  {/* FOCUS section — highlighted, themed */}
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
                        {/* UX-239: it is Monday's focus, or Thursday's \u2014 the
                            day is named in the header two lines up. Every day
                            card in a five-day plan said "Today's", including on
                            a plan for a week that has not started.

                            UX-257: the "\u00b7 Choose 2" suffix is gone. The only
                            2 in the codebase is `KidTodayView`'s local
                            `const maxChoices = 2`, which limits KID Today's
                            *Choose* section \u2014 the items with
                            `category: 'choose'`. This section is a different,
                            larger set (`!isRoutineItem`: everything that is
                            neither must-do nor mvdEssential, so `choose`,
                            `routine` and untyped items alike), on a PARENT
                            surface that has no such limit: Apply writes every
                            accepted row to the day and parent Today shows all of
                            them. It was not the wrong number \u2014 it was a kid
                            surface's rule applied to a superset of the rows it
                            governs, on a screen where it does not hold. Making
                            "choose 2 of 7" true means the day becoming a real
                            menu, with something saying what happens to the other
                            five: UX-206 / UX-208 / UX-209, owner-led. */}
                        Focus
                      </Typography>
                      <Stack spacing={0.25}>
                        {focusItems.map(item => renderItem(item, false))}
                      </Stack>
                    </Box>
                  )}

                </>
              )
            })()}

            {/* Plan a curated video onto this day (FEAT-104) — picks from the
                vetted library, never an open search. */}
            {/* UX-261: not on a set-aside day. Pre-Apply the row would be
                erased by the next `enforceDayTypes`; at Apply the day is
                skipped entirely, so it would never be written. An affordance
                whose result is discarded is the "silently inert button" FEAT-138
                went out of its way to stop rendering. */}
            {onAddWatchItem && !isSetAside && (
              <Button
                size="small"
                startIcon={<OndemandVideoIcon sx={{ fontSize: 16 }} />}
                onClick={() => onAddWatchItem(dayIndex)}
                sx={{ mt: 0.5, ml: 1, textTransform: 'none' }}
              >
                Add a video
              </Button>
            )}
          </Box>
        )
      })}

      {/* UX-251: the row's reorder overflow. One menu for every row on the card,
          anchored to whichever ⋮ was tapped — a Menu per row would be ~75 mounted
          popovers on a five-day plan. */}
      <Menu
        anchorEl={reorderMenu?.anchorEl ?? null}
        open={!!reorderMenu}
        onClose={() => setReorderMenu(null)}
      >
        <MenuItem
          disabled={reorderMenu?.itemIndex === 0}
          onClick={() => {
            if (reorderMenu) onMoveItem?.(reorderMenu.dayIndex, reorderMenu.itemIndex, -1)
            setReorderMenu(null)
          }}
        >
          <KeyboardArrowUpIcon fontSize="small" sx={{ mr: 1 }} />
          Move up
        </MenuItem>
        <MenuItem
          disabled={
            reorderMenu ? reorderMenu.itemIndex === reorderMenu.totalItems - 1 : true
          }
          onClick={() => {
            if (reorderMenu) onMoveItem?.(reorderMenu.dayIndex, reorderMenu.itemIndex, 1)
            setReorderMenu(null)
          }}
        >
          <KeyboardArrowDownIcon fontSize="small" sx={{ mr: 1 }} />
          Move down
        </MenuItem>
      </Menu>

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
