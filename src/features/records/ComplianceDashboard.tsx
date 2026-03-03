import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'

import SectionCard from '../../components/SectionCard'
import type { HoursSummary } from './records.logic'

// ─── MO Compliance Constants ────────────────────────────────────────────────

const TOTAL_HOURS_TARGET = 1000
const CORE_HOURS_TARGET = 600

const MO_REQUIRED_SUBJECTS = [
  'Reading',
  'LanguageArts',
  'Math',
  'Science',
  'SocialStudies',
] as const

const SUBJECT_LABELS: Record<string, string> = {
  Reading: 'Reading',
  LanguageArts: 'Language Arts',
  Math: 'Math',
  Science: 'Science',
  SocialStudies: 'Social Studies',
}

// ─── Status helpers ─────────────────────────────────────────────────────────

const Status = {
  Green: 'green',
  Yellow: 'yellow',
  Red: 'red',
} as const
type Status = (typeof Status)[keyof typeof Status]

const STATUS_COLORS: Record<Status, string> = {
  [Status.Green]: '#4caf50',
  [Status.Yellow]: '#ff9800',
  [Status.Red]: '#f44336',
}

const STATUS_BG: Record<Status, string> = {
  [Status.Green]: '#e8f5e9',
  [Status.Yellow]: '#fff3e0',
  [Status.Red]: '#ffebee',
}

function getSchoolYearProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()
  const totalMs = end.getTime() - start.getTime()
  if (totalMs <= 0) return 1
  const elapsedMs = Math.max(0, now.getTime() - start.getTime())
  return Math.min(1, elapsedMs / totalMs)
}

function projectTotal(current: number, progress: number): number {
  if (progress <= 0) return 0
  return current / progress
}

function getHoursStatus(
  currentHours: number,
  targetHours: number,
  yearProgress: number,
): Status {
  const expectedHours = targetHours * yearProgress
  const ratio = expectedHours > 0 ? currentHours / expectedHours : 1
  if (ratio >= 0.9) return Status.Green
  if (ratio >= 0.75) return Status.Yellow
  return Status.Red
}

function getSubjectStatus(
  subjectMinutes: number,
  yearProgress: number,
): Status {
  // Each of 5 core subjects should contribute roughly equal share of 600 core hours
  const perSubjectTarget = CORE_HOURS_TARGET / MO_REQUIRED_SUBJECTS.length
  const expectedHours = perSubjectTarget * yearProgress
  const currentHours = subjectMinutes / 60
  const ratio = expectedHours > 0 ? currentHours / expectedHours : 1
  if (ratio >= 0.85) return Status.Green
  if (ratio >= 0.6) return Status.Yellow
  return Status.Red
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ComplianceDashboardProps {
  summary: HoursSummary
  startDate: string
  endDate: string
}

export default function ComplianceDashboard({
  summary,
  startDate,
  endDate,
}: ComplianceDashboardProps) {
  const yearProgress = useMemo(
    () => getSchoolYearProgress(startDate, endDate),
    [startDate, endDate],
  )

  const totalHours = summary.totalMinutes / 60
  const coreHours = summary.coreMinutes / 60
  const projectedTotal = projectTotal(totalHours, yearProgress)
  const projectedCore = projectTotal(coreHours, yearProgress)

  const totalStatus = getHoursStatus(totalHours, TOTAL_HOURS_TARGET, yearProgress)
  const coreStatus = getHoursStatus(coreHours, CORE_HOURS_TARGET, yearProgress)

  const subjectByBucket = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of summary.bySubject) {
      map.set(row.subjectBucket, row.totalMinutes)
    }
    return map
  }, [summary.bySubject])

  const alerts = useMemo(() => {
    const items: string[] = []
    if (totalStatus === Status.Red)
      items.push(`Total hours (${totalHours.toFixed(0)}h) are significantly behind the ${TOTAL_HOURS_TARGET}h target`)
    if (coreStatus === Status.Red)
      items.push(`Core hours (${coreHours.toFixed(0)}h) are significantly behind the ${CORE_HOURS_TARGET}h target`)
    for (const subject of MO_REQUIRED_SUBJECTS) {
      const minutes = subjectByBucket.get(subject) ?? 0
      const status = getSubjectStatus(minutes, yearProgress)
      if (status === Status.Red) {
        items.push(`${SUBJECT_LABELS[subject]} (${(minutes / 60).toFixed(0)}h) is falling behind`)
      }
    }
    return items
  }, [totalHours, coreHours, totalStatus, coreStatus, subjectByBucket, yearProgress])

  const yearProgressPct = Math.round(yearProgress * 100)

  return (
    <SectionCard title="MO Compliance">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          School year {yearProgressPct}% complete ({startDate} to {endDate})
        </Typography>

        {/* Total Hours */}
        <HoursGauge
          label="Total Hours"
          current={totalHours}
          target={TOTAL_HOURS_TARGET}
          projected={projectedTotal}
          status={totalStatus}
        />

        {/* Core Hours */}
        <HoursGauge
          label="Core Hours"
          current={coreHours}
          target={CORE_HOURS_TARGET}
          projected={projectedCore}
          status={coreStatus}
        />

        {/* Per-Subject Breakdown */}
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          Required Subjects
        </Typography>
        {MO_REQUIRED_SUBJECTS.map((subject) => {
          const minutes = subjectByBucket.get(subject) ?? 0
          const hours = minutes / 60
          const status = getSubjectStatus(minutes, yearProgress)
          return (
            <SubjectRow
              key={subject}
              label={SUBJECT_LABELS[subject]}
              hours={hours}
              status={status}
            />
          )
        })}

        {/* Alerts */}
        {alerts.length > 0 && (
          <Box
            sx={{
              bgcolor: '#ffebee',
              borderRadius: 1,
              p: 1.5,
              mt: 1,
            }}
          >
            <Typography variant="subtitle2" color="error.dark" sx={{ mb: 0.5 }}>
              Attention Needed
            </Typography>
            {alerts.map((alert) => (
              <Typography key={alert} variant="body2" color="error.dark">
                {alert}
              </Typography>
            ))}
          </Box>
        )}

        {alerts.length === 0 && (
          <Box
            sx={{
              bgcolor: '#e8f5e9',
              borderRadius: 1,
              p: 1.5,
              mt: 1,
            }}
          >
            <Typography variant="body2" color="success.dark">
              On track for MO compliance. Keep it up!
            </Typography>
          </Box>
        )}
      </Stack>
    </SectionCard>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function HoursGauge({
  label,
  current,
  target,
  projected,
  status,
}: {
  label: string
  current: number
  target: number
  projected: number
  status: Status
}) {
  const pct = Math.min(100, (current / target) * 100)

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {current.toFixed(0)}h / {target}h
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: STATUS_BG[status],
          '& .MuiLinearProgress-bar': {
            bgcolor: STATUS_COLORS[status],
            borderRadius: 4,
          },
        }}
      />
      <Typography variant="caption" color="text.secondary">
        Projected: {projected.toFixed(0)}h by end of year
        {projected < target && (
          <Typography component="span" variant="caption" color="error.main">
            {' '}({(target - projected).toFixed(0)}h short)
          </Typography>
        )}
      </Typography>
    </Box>
  )
}

function SubjectRow({
  label,
  hours,
  status,
}: {
  label: string
  hours: number
  status: Status
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: STATUS_COLORS[status],
          flexShrink: 0,
        }}
      />
      <Typography variant="body2" sx={{ minWidth: 120 }}>
        {label}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {hours.toFixed(1)}h
      </Typography>
    </Stack>
  )
}
