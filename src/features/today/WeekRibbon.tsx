/**
 * Today's week ribbon (parent only): a chip stating the week's COUNTED time and
 * five Mon–Fri dots that double as the day switcher.
 *
 * Since `FIX-254` it reads the Review's three sources through
 * `useWeekHoursInputs` (live) and computes nothing itself — the rules are in
 * `weekRibbon.logic.ts`, whose header says what the old `2.3/25` chip counted
 * and why it changed (UX-443 / UX-444).
 *
 * **Child switch: SAFE, and it has no census row.** It holds no editable state
 * and writes nothing; its reads are `useWeekHoursInputs`, whose `requestKey`
 * (`familyId|childId|weekKey`) resets the arrays during render and re-keys the
 * listeners, so a switch can only replace one child's week with the other's.
 * The census heuristic now derives the same answer — it requires editable state
 * — and checks in both directions, so the row it used to carry (for the old
 * inline `subscriptionKey`) would fail as `not-a-candidate`; the verdict lives
 * here instead, the `WeekBySubject` precedent.
 */
import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { useWeekHoursInputs } from '../weekly-review/useWeekHoursInputs'
import {
  HOURS_SOURCE_CAPTION,
  HOURS_UNAVAILABLE_LINE,
} from '../weekly-review/weekHours'
import {
  buildWeekDates,
  computeRibbonWeek,
  countedDayLine,
  DAY_LABELS,
  DAY_NO_PLAN_LINE,
  formatCountedHours,
  isWeekEmpty,
  PLAN_WEEK_LINK,
  RIBBON_HEADING,
  rowsDoneLine,
  WEEK_EMPTY_LINE,
  WEEK_RANGE_NOTE,
  type DayStats,
  type DotState,
} from './weekRibbon.logic'

export interface WeekRibbonProps {
  childId: string
  familyId: string
  /** YYYY-MM-DD — Monday of the week to display. */
  weekStart: string
  /** YYYY-MM-DD — calendar today, used to highlight the current dot. */
  today: string
  /** YYYY-MM-DD — the day currently being viewed (drives the selected highlight). */
  selectedDate?: string
  /** When provided, day dots become tappable and call this with the tapped dateKey. */
  onSelectDate?: (dateKey: string) => void
}

function formatLongDate(dateKey: string): string {
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function getDotPaletteColor(
  state: DotState,
): { borderToken: string; fillToken?: string; halfFillToken?: string } {
  switch (state) {
    case 'done':
      return { borderToken: 'success.main', fillToken: 'success.light' }
    case 'partial':
      return { borderToken: 'warning.main', halfFillToken: 'warning.main' }
    case 'in-progress':
      return { borderToken: 'primary.main', fillToken: 'primary.light' }
    case 'logged':
      // UX-444: time was counted on a day with no plan — filled, never the
      // empty ring, and not the plan's green either.
      return { borderToken: 'info.main', fillToken: 'info.light' }
    case 'skipped':
    case 'empty':
    case 'pending':
    default:
      return { borderToken: 'divider' }
  }
}

interface DayDotProps {
  stats: DayStats
  isToday: boolean
  isSelected: boolean
  onSelect?: (dateKey: string) => void
}

function DayDot({ stats, isToday, isSelected, onSelect }: DayDotProps) {
  const palette = getDotPaletteColor(stats.state)
  const interactive = Boolean(onSelect)
  // The day's counted minutes, and — on a planned day — how many ROWS are
  // ticked. Never minutes against planned minutes: that is the denominator the
  // owner removed (UX-443).
  const tooltipBody = (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
        {formatLongDate(stats.date)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        {countedDayLine(stats.countedMinutes)}
        {stats.subjects.length > 0 ? ` · ${stats.subjects.join(', ')}` : ''}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        {stats.rowsPlanned > 0
          ? rowsDoneLine(stats.rowsDone, stats.rowsPlanned)
          : DAY_NO_PLAN_LINE}
      </Typography>
    </Box>
  )

  return (
    <Tooltip title={tooltipBody} placement="top" arrow>
      <Stack
        alignItems="center"
        spacing={0.25}
        {...(interactive
          ? {
              onClick: () => onSelect?.(stats.date),
              onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                // The dot is a role="button" div, so it must handle Enter/Space
                // itself to stay keyboard-operable (the removed MUI Chip was a
                // native button). Space is preventDefault'd to avoid page scroll.
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect?.(stats.date)
                }
              },
              role: 'button',
              tabIndex: 0,
              'aria-label': `View ${formatLongDate(stats.date)}`,
              'aria-current': isSelected ? ('date' as const) : undefined,
            }
          : {})}
        sx={{
          flex: 1,
          minWidth: { xs: 44, sm: 64 },
          cursor: interactive ? 'pointer' : 'default',
          py: 0.25,
          borderRadius: 1,
          ...(isSelected ? { bgcolor: 'action.selected' } : {}),
          ...(interactive ? { '&:hover': { bgcolor: 'action.hover' } } : {}),
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: isToday ? 700 : 500,
            color: isToday ? 'primary.main' : 'text.secondary',
            lineHeight: 1.2,
          }}
        >
          {stats.label}
        </Typography>
        <Box
          aria-label={`${stats.label} ${stats.state}`}
          sx={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '2px solid',
            borderColor: palette.borderToken,
            backgroundColor: palette.fillToken ?? 'transparent',
            ...(palette.halfFillToken
              ? {
                  background: (theme) =>
                    `linear-gradient(90deg, ${
                      theme.palette.warning.main
                    } 50%, transparent 50%)`,
                }
              : {}),
            boxShadow: isToday
              ? (theme) =>
                  `0 0 0 3px ${theme.palette.primary.main}33`
              : 'none',
          }}
        />
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.65rem',
            color: 'text.secondary',
            lineHeight: 1,
            display: { xs: 'none', sm: 'block' },
          }}
        >
          {stats.countedMinutes > 0 ? `${Math.round(stats.countedMinutes)}m` : '–'}
        </Typography>
      </Stack>
    </Tooltip>
  )
}

export default function WeekRibbon({
  childId,
  familyId,
  weekStart,
  today,
  selectedDate,
  onSelectDate,
}: WeekRibbonProps) {
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart])
  // UX-443: the Review's three reads, live — one loader, not a `days`-only
  // subscription beside it. It re-keys on (family, child, week) itself.
  const { dayLogs, hoursEntries, adjustments, loading, error } = useWeekHoursInputs(
    familyId,
    childId,
    weekStart,
    { live: true },
  )
  const week = useMemo(
    () =>
      computeRibbonWeek({ dayLogs, hoursEntries, adjustments, childId, weekDates, today }),
    [dayLogs, hoursEntries, adjustments, childId, weekDates, today],
  )

  if (!childId) return null

  // A failed read is not an empty week (UX-211's rule): the sentence, never
  // `0 min`, and no dots that would read as five empty days.
  if (error) {
    return (
      <Box
        sx={{
          px: 1.5,
          py: 1,
          mb: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
          {RIBBON_HEADING}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {HOURS_UNAVAILABLE_LINE}
        </Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box
        sx={{
          px: { xs: 1, sm: 1.5 },
          py: 1,
          mb: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 0.75 }}
        >
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
            {RIBBON_HEADING}
          </Typography>
          <Skeleton variant="rounded" width={72} height={22} />
        </Stack>
        <Stack
          direction="row"
          spacing={{ xs: 0.5, sm: 1 }}
          justifyContent="space-between"
          aria-label="Week ribbon loading"
        >
          {DAY_LABELS.map((label) => (
            <Stack
              key={label}
              alignItems="center"
              spacing={0.25}
              sx={{ flex: 1, minWidth: { xs: 44, sm: 64 } }}
            >
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Skeleton variant="circular" width={22} height={22} />
              <Skeleton
                variant="text"
                width={32}
                height={12}
                sx={{ display: { xs: 'none', sm: 'block' } }}
              />
            </Stack>
          ))}
        </Stack>
      </Box>
    )
  }

  const { stats, totalMinutes } = week

  if (isWeekEmpty(stats, totalMinutes)) {
    return (
      <Box
        sx={{
          px: 1.5,
          py: 1,
          mb: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {/* UX-24: the shared EmptyState convention — warm, no negation. */}
        <Typography variant="body2" color="text.secondary">
          {WEEK_EMPTY_LINE}
        </Typography>
        <Typography
          component={RouterLink}
          to="/planner/chat"
          variant="body2"
          sx={{
            color: 'primary.main',
            textDecoration: 'none',
            fontWeight: 600,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {PLAN_WEEK_LINK}
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 1.5 },
        py: 1,
        mb: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 0.5 }}
      >
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontWeight: 600, letterSpacing: 0.5 }}
        >
          {RIBBON_HEADING}
        </Typography>
        <Tooltip title={`${HOURS_SOURCE_CAPTION} ${WEEK_RANGE_NOTE}`} arrow>
          <Chip
            label={formatCountedHours(totalMinutes)}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Tooltip>
      </Stack>
      <Stack
        direction="row"
        spacing={{ xs: 0.5, sm: 1 }}
        justifyContent="space-between"
      >
        {stats.map((d) => (
          <DayDot
            key={d.date}
            stats={d}
            isToday={d.date === today}
            isSelected={d.date === selectedDate}
            onSelect={onSelectDate}
          />
        ))}
      </Stack>
    </Box>
  )
}
