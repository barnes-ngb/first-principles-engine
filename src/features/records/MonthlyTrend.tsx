import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type { DayLog, HoursAdjustment, HoursEntry } from '../../core/types'
import { computeMonthlyTrend } from './records.logic'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MonthlyTrendProps {
  dayLogs: DayLog[]
  hoursEntries: HoursEntry[]
  adjustments: HoursAdjustment[]
  startDate: string
  endDate: string
  childId: string
}

export default function MonthlyTrend({ dayLogs, hoursEntries, adjustments, startDate, endDate, childId }: MonthlyTrendProps) {
  // Reconciled with the canonical compliance figure (DATA-01/DATA-11): this
  // chart reads computeMonthlyTrend() from records.logic, which consumes the
  // SAME shared counting path (collectHoursContributions — child filtering,
  // day logs + hours entries + adjustments, partial-day rule) as
  // computeHoursSummary(). The cumulative core/total below therefore match the
  // summary / MO-compliance cards for any data within [startDate, endDate].
  const months = useMemo(() => {
    return computeMonthlyTrend(dayLogs, hoursEntries, adjustments, startDate, endDate, childId).map((d) => ({
      ...d,
      label: MONTH_LABELS[Number(d.month.split('-')[1]) - 1],
    }))
  }, [dayLogs, hoursEntries, adjustments, startDate, endDate, childId])

  const maxMonthlyMinutes = Math.max(...months.map(m => m.totalMinutes), 1)
  const targetMonthlyMinutes = (1000 * 60) / 12  // ~83h/month average

  // Current month
  const currentMonth = new Date().toISOString().slice(0, 7)

  return (
    <SectionCard title="📊 Monthly Trend">
      <Stack spacing={1}>
        {/* Legend */}
        <Stack direction="row" spacing={2}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, bgcolor: '#4caf50', borderRadius: 1 }} />
            <Typography variant="caption">Core</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, bgcolor: '#90caf9', borderRadius: 1 }} />
            <Typography variant="caption">Non-Core</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, bgcolor: 'transparent', border: '1px dashed #999', borderRadius: 1 }} />
            <Typography variant="caption">~83h/mo target</Typography>
          </Stack>
        </Stack>

        {/* Bar chart */}
        {months.map((m) => {
          const coreWidth = maxMonthlyMinutes > 0 ? (m.coreMinutes / maxMonthlyMinutes) * 100 : 0
          const nonCoreWidth = maxMonthlyMinutes > 0 ? (m.nonCoreMinutes / maxMonthlyMinutes) * 100 : 0
          const targetWidth = maxMonthlyMinutes > 0 ? (targetMonthlyMinutes / maxMonthlyMinutes) * 100 : 0
          const isCurrent = m.month === currentMonth
          const totalHours = (m.totalMinutes / 60).toFixed(1)

          return (
            <Stack key={m.month} spacing={0.25}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography
                  variant="caption"
                  sx={{
                    minWidth: 32,
                    fontWeight: isCurrent ? 700 : 400,
                    color: isCurrent ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {m.label}
                </Typography>
                <Box sx={{ flex: 1, position: 'relative', height: 20 }}>
                  {/* Target line */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: `${Math.min(targetWidth, 100)}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      borderLeft: '1px dashed #999',
                      zIndex: 1,
                    }}
                  />
                  {/* Core bar */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 2,
                      height: 16,
                      width: `${coreWidth}%`,
                      bgcolor: '#4caf50',
                      borderRadius: '4px 0 0 4px',
                    }}
                  />
                  {/* Non-core bar (stacked after core) */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: `${coreWidth}%`,
                      top: 2,
                      height: 16,
                      width: `${nonCoreWidth}%`,
                      bgcolor: '#90caf9',
                      borderRadius: '0 4px 4px 0',
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ minWidth: 48, textAlign: 'right' }}>
                  {totalHours}h
                </Typography>
              </Stack>
            </Stack>
          )
        })}

        {/* Cumulative summary */}
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}
        >
          <Typography variant="body2" fontWeight={600}>
            Cumulative: {((months[months.length - 1]?.cumulativeTotal ?? 0) / 60).toFixed(0)}h total
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`${((months[months.length - 1]?.cumulativeCore ?? 0) / 60).toFixed(0)}h core`}
              size="small"
              color="success"
              variant="outlined"
            />
            <Chip
              label={`${(((months[months.length - 1]?.cumulativeTotal ?? 0) - (months[months.length - 1]?.cumulativeCore ?? 0)) / 60).toFixed(0)}h non-core`}
              size="small"
              color="info"
              variant="outlined"
            />
          </Stack>
        </Stack>

        {/* Pace check */}
        {(() => {
          const now = new Date()
          const [startY, startM] = startDate.split('-').map(Number)
          const monthsElapsed = (now.getFullYear() - startY) * 12 + (now.getMonth() + 1 - startM)
          const monthsRemaining = 12 - monthsElapsed
          const currentTotal = (months[months.length - 1]?.cumulativeTotal ?? 0) / 60
          const needed = 1000 - currentTotal
          const perMonthNeeded = monthsRemaining > 0 ? needed / monthsRemaining : 0

          if (currentTotal >= 1000) {
            return (
              <Typography variant="body2" color="success.main" fontWeight={600}>
                ✅ 1,000 hour target reached!
              </Typography>
            )
          }

          return (
            <Typography variant="body2" color="text.secondary">
              Need ~{perMonthNeeded.toFixed(0)}h/month for {monthsRemaining} remaining months to reach 1,000h
              ({(perMonthNeeded / 4.33).toFixed(1)}h/week)
            </Typography>
          )
        })()}
      </Stack>
    </SectionCard>
  )
}
