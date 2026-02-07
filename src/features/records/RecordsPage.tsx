import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { doc, getDocs, query, where, writeBatch } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  db,
  daysCollection,
  hoursCollection,
} from '../../core/firebase/firestore'
import type { DayLog, HoursEntry } from '../../core/types/domain'
import { LearningLocation, SubjectBucket } from '../../core/types/enums'
import { formatDateForCsv, formatDateForInput, toCsvValue } from '../../lib/format'
import { getSchoolYearRange } from '../../lib/time'

type DayLogTotals = {
  totalMinutes: number
  coreMinutes: number
  coreHomeMinutes: number
  byDateMinutes: Record<string, number>
}

const coreBuckets = new Set<SubjectBucket>([
  SubjectBucket.Reading,
  SubjectBucket.LanguageArts,
  SubjectBucket.Math,
  SubjectBucket.Science,
  SubjectBucket.SocialStudies,
])

const sumMinutes = (log: DayLog) =>
  log.blocks.reduce((total, block) => total + (block.actualMinutes ?? 0), 0)

const entryMinutes = (entry: HoursEntry) => {
  if (entry.minutes != null) {
    return entry.minutes
  }
  if (entry.hours != null) {
    return Math.round(entry.hours * 60)
  }
  return 0
}

const computeDayLogTotals = (logs: DayLog[]): DayLogTotals => {
  return logs.reduce<DayLogTotals>(
    (totals, log) => {
      const dayTotal = sumMinutes(log)
      const coreTotal = log.blocks.reduce((total, block) => {
        if (!block.subjectBucket || !coreBuckets.has(block.subjectBucket)) {
          return total
        }
        return total + (block.actualMinutes ?? 0)
      }, 0)
      const coreHomeTotal = log.blocks.reduce((total, block) => {
        if (
          !block.subjectBucket ||
          !coreBuckets.has(block.subjectBucket) ||
          block.location !== LearningLocation.Home
        ) {
          return total
        }
        return total + (block.actualMinutes ?? 0)
      }, 0)

      totals.totalMinutes += dayTotal
      totals.coreMinutes += coreTotal
      totals.coreHomeMinutes += coreHomeTotal
      totals.byDateMinutes[log.date] = dayTotal
      return totals
    },
    {
      totalMinutes: 0,
      coreMinutes: 0,
      coreHomeMinutes: 0,
      byDateMinutes: {},
    },
  )
}

const computeHoursEntryTotals = (entries: HoursEntry[]): DayLogTotals => {
  return entries.reduce<DayLogTotals>(
    (totals, entry) => {
      const minutes = entryMinutes(entry)
      if (minutes <= 0) {
        return totals
      }
      const subjectBucket = entry.subjectBucket
      const location = entry.location
      const isCore = subjectBucket != null && coreBuckets.has(subjectBucket)
      const isCoreHome = isCore && location === LearningLocation.Home

      totals.totalMinutes += minutes
      if (isCore) {
        totals.coreMinutes += minutes
      }
      if (isCoreHome) {
        totals.coreHomeMinutes += minutes
      }
      totals.byDateMinutes[entry.date] =
        (totals.byDateMinutes[entry.date] ?? 0) + minutes
      return totals
    },
    {
      totalMinutes: 0,
      coreMinutes: 0,
      coreHomeMinutes: 0,
      byDateMinutes: {},
    },
  )
}

const formatHours = (hours: number) => hours.toFixed(2)

export default function RecordsPage() {
  const familyId = DEFAULT_FAMILY_ID
  const { start, end } = useMemo(() => getSchoolYearRange(), [])
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(end)
  const [hoursEntries, setHoursEntries] = useState<HoursEntry[]>([])
  const [dayLogs, setDayLogs] = useState<DayLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    const hoursQuery = query(
      hoursCollection(familyId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    )
    const daysQuery = query(
      daysCollection(familyId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    )

    const [hoursSnapshot, daysSnapshot] = await Promise.all([
      getDocs(hoursQuery),
      getDocs(daysQuery),
    ])

    const hours = hoursSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as HoursEntry
      const minutes = entryMinutes(data)
      return {
        ...data,
        id: data.id ?? docSnapshot.id,
        date: data.date ?? docSnapshot.id,
        minutes,
      }
    })
    const logs = daysSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as DayLog
      return { ...data, date: data.date ?? docSnapshot.id }
    })

    setHoursEntries(hours)
    setDayLogs(logs)
    setIsLoading(false)
  }, [endDate, familyId, startDate])

  useEffect(() => {
    const load = async () => {
      await loadRecords()
    }

    void load()
  }, [loadRecords])

  const totalsFromLogs = useMemo(() => computeDayLogTotals(dayLogs), [dayLogs])
  const totalsFromEntries = useMemo(
    () => computeHoursEntryTotals(hoursEntries),
    [hoursEntries],
  )
  const hasHoursEntries = hoursEntries.length > 0
  const totals = hasHoursEntries ? totalsFromEntries : totalsFromLogs
  const totalHours = useMemo(() => {
    if (hoursEntries.length > 0) {
      return totalsFromEntries.totalMinutes / 60
    }
    return totalsFromLogs.totalMinutes / 60
  }, [hoursEntries.length, totalsFromEntries.totalMinutes, totalsFromLogs.totalMinutes])

  const coreHours = totals.coreMinutes / 60
  const coreHomeHours = totals.coreHomeMinutes / 60
  const showGenerate = !hasHoursEntries && dayLogs.length > 0

  const handleGenerateHours = useCallback(async () => {
    if (dayLogs.length === 0) return
    setIsGenerating(true)

    const batch = writeBatch(db)
    dayLogs.forEach((log) => {
      log.blocks.forEach((block) => {
        const minutes = block.actualMinutes ?? 0
        if (minutes <= 0) {
          return
        }
        const entryRef = doc(hoursCollection(familyId))
        batch.set(entryRef, {
          date: log.date,
          minutes,
          blockType: block.type,
          subjectBucket: block.subjectBucket,
          location: block.location,
          quickCapture: block.quickCapture,
          notes: block.notes,
        })
      })
    })

    await batch.commit()
    await loadRecords()
    setIsGenerating(false)
  }, [dayLogs, familyId, loadRecords])

  const handleExportCsv = useCallback(() => {
    const rows = hasHoursEntries
      ? [...hoursEntries]
          .sort((a, b) => a.date.localeCompare(b.date))
          .filter((entry) => entryMinutes(entry) > 0)
          .map((entry) => ({
            date: formatDateForCsv(entry.date),
            blockType: entry.blockType ?? '',
            subjectBucket: entry.subjectBucket ?? '',
            location: entry.location ?? '',
            minutes: entryMinutes(entry) || '',
            quickCapture: entry.quickCapture ?? '',
          }))
      : [...dayLogs]
          .sort((a, b) => a.date.localeCompare(b.date))
          .flatMap((log) =>
            log.blocks
              .filter((block) => block.actualMinutes != null)
              .map((block) => ({
                date: formatDateForCsv(log.date),
                blockType: block.type,
                subjectBucket: block.subjectBucket ?? '',
                location: block.location ?? '',
                minutes: block.actualMinutes ?? '',
                quickCapture: block.quickCapture ?? '',
              })),
          )

    const header = [
      'date',
      'blockType',
      'subjectBucket',
      'location',
      'minutes',
      'quickCapture',
    ]
    const csv = [
      header.map(toCsvValue).join(','),
      ...rows.map((row) =>
        [
          formatDateForCsv(row.date),
          row.blockType,
          row.subjectBucket,
          row.location,
          row.minutes,
          row.quickCapture,
        ]
          .map(toCsvValue)
          .join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `daily-logs-${formatDateForInput(startDate)}-to-${formatDateForInput(endDate)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }, [dayLogs, endDate, hasHoursEntries, hoursEntries, startDate])

  return (
    <Page>
      <SectionCard title="Records">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Start date"
              type="date"
              value={startDate}
              onChange={(event) =>
                setStartDate(formatDateForInput(event.target.value))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End date"
              type="date"
              value={endDate}
              onChange={(event) =>
                setEndDate(formatDateForInput(event.target.value))
              }
              InputLabelProps={{ shrink: true }}
            />
            <Button
              variant="outlined"
              onClick={handleExportCsv}
              disabled={!hasHoursEntries && dayLogs.length === 0}
            >
              Export Daily Log CSV
            </Button>
          </Stack>
          <Typography color="text.secondary">
            Showing records for {startDate} through {endDate}.
          </Typography>
          <Divider />
          {isLoading ? (
            <Typography color="text.secondary">Loading records...</Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="subtitle1">
                Total hours: {formatHours(totalHours)}
              </Typography>
              <Typography variant="subtitle1">
                Core hours (Reading, Language Arts, Math, Science, Social Studies):{' '}
                {formatHours(coreHours)}
              </Typography>
              <Typography variant="subtitle1">
                Core hours at Home: {formatHours(coreHomeHours)}
              </Typography>
              <Typography color="text.secondary">
                Hours entries found: {hoursEntries.length}. Day logs found:{' '}
                {dayLogs.length}.
              </Typography>
              {showGenerate && (
                <Button
                  variant="contained"
                  onClick={handleGenerateHours}
                  disabled={isGenerating}
                >
                  Generate Hours From Logs
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </SectionCard>
    </Page>
  )
}
