import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { onSnapshot, query, where } from 'firebase/firestore'

import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types'
import {
  buildWeekDates,
  computeWeekStats,
  DAY_LABELS,
  formatHoursChip,
  isWeekEmpty,
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
}

function DayDot({ stats, isToday }: DayDotProps) {
  const palette = getDotPaletteColor(stats.state)
  const tooltipBody =
    stats.plannedMinutes > 0 ? (
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
          {formatLongDate(stats.date)}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block' }}>
          {stats.loggedMinutes}/{stats.plannedMinutes} min
          {stats.subjects.length > 0 ? ` · ${stats.subjects.join(', ')}` : ''}
        </Typography>
      </Box>
    ) : (
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
          {formatLongDate(stats.date)}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block' }}>
          No plan for this day
        </Typography>
      </Box>
    )

  return (
    <Tooltip title={tooltipBody} placement="top" arrow>
      <Stack
        alignItems="center"
        spacing={0.25}
        sx={{
          flex: 1,
          minWidth: { xs: 44, sm: 64 },
          cursor: 'default',
          py: 0.25,
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
          {stats.plannedMinutes > 0
            ? `${stats.loggedMinutes}/${stats.plannedMinutes}m`
            : '–'}
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
}: WeekRibbonProps) {
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart])
  const subscriptionKey = `${familyId}|${childId}|${weekStart}`
  const [data, setData] = useState<{
    key: string
    logs: Record<string, DayLog | null>
  } | null>(null)
  const [erroredKey, setErroredKey] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId || !childId || weekDates.length === 0) return

    const q = query(
      daysCollection(familyId),
      where('childId', '==', childId),
      where('date', '>=', weekDates[0]),
      where('date', '<=', weekDates[weekDates.length - 1]),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, DayLog | null> = {}
        for (const d of weekDates) map[d] = null
        for (const docSnap of snap.docs) {
          const docData = docSnap.data() as DayLog
          if (!docData?.date || !(docData.date in map)) continue
          const existing = map[docData.date]
          if (
            !existing ||
            (docData.checklist?.length ?? 0) > (existing.checklist?.length ?? 0)
          ) {
            map[docData.date] = docData
          }
        }
        setData({ key: subscriptionKey, logs: map })
      },
      (err) => {
        console.error('[WeekRibbon] Firestore error:', err)
        setErroredKey(subscriptionKey)
      },
    )
    return unsub
  }, [familyId, childId, weekDates, subscriptionKey])

  if (!childId) return null
  if (erroredKey === subscriptionKey) return null

  const logsByDate = data?.key === subscriptionKey ? data.logs : null
  if (logsByDate === null) {
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
            This Week
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

  const stats = computeWeekStats(weekDates, logsByDate, today)

  if (isWeekEmpty(stats)) {
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
        <Typography variant="body2" color="text.secondary">
          No week planned yet.
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
          → Plan My Week
        </Typography>
      </Box>
    )
  }

  const totalLogged = stats.reduce((s, d) => s + d.loggedMinutes, 0)
  const totalPlanned = stats.reduce((s, d) => s + d.plannedMinutes, 0)

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
          This Week
        </Typography>
        <Chip
          label={formatHoursChip(totalLogged, totalPlanned)}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </Stack>
      <Stack
        direction="row"
        spacing={{ xs: 0.5, sm: 1 }}
        justifyContent="space-between"
      >
        {stats.map((d) => (
          <DayDot key={d.date} stats={d} isToday={d.date === today} />
        ))}
      </Stack>
    </Box>
  )
}
