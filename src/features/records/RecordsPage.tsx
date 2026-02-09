import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  artifactsCollection,
  db,
  daysCollection,
  evaluationsCollection,
  hoursAdjustmentsCollection,
  hoursCollection,
} from '../../core/firebase/firestore'
import { useChildren } from '../../core/hooks/useChildren'
import type {
  Artifact,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types/domain'
import { SubjectBucket } from '../../core/types/enums'
import { formatDateForInput } from '../../lib/format'
import { getSchoolYearRange } from '../../lib/time'
import { parseDateFromDocId } from '../today/daylog.model'
import {
  buildComplianceZip,
  computeHoursSummary,
  generateDailyLogCsv,
  generateEvaluationMarkdown,
  generateHoursSummaryCsv,
  generatePortfolioMarkdown,
} from './records.logic'

const formatHours = (minutes: number) => (minutes / 60).toFixed(2)

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const subjectBucketOptions = Object.values(SubjectBucket)

export default function RecordsPage() {
  const familyId = useFamilyId()
  const { start, end } = useMemo(() => getSchoolYearRange(), [])
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(end)
  const [allHoursEntries, setAllHoursEntries] = useState<HoursEntry[]>([])
  const [allDayLogs, setAllDayLogs] = useState<DayLog[]>([])
  const [allAdjustments, setAllAdjustments] = useState<HoursAdjustment[]>([])
  const { children, selectedChildId, setSelectedChildId } = useChildren()
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([])
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [snackMessage, setSnackMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId),
    [children, selectedChildId],
  )
  const childNameLower = selectedChild?.name.toLowerCase() ?? ''

  // Filter data by selected child
  const hoursEntries = useMemo(
    () => allHoursEntries.filter((e) => e.childId === selectedChildId),
    [allHoursEntries, selectedChildId],
  )
  const dayLogs = useMemo(
    () => allDayLogs.filter((l) => l.childId === selectedChildId),
    [allDayLogs, selectedChildId],
  )
  const adjustments = useMemo(
    () => allAdjustments.filter((a) => !a.childId || a.childId === selectedChildId),
    [allAdjustments, selectedChildId],
  )
  const artifacts = useMemo(
    () => allArtifacts.filter((a) => a.childId === selectedChildId),
    [allArtifacts, selectedChildId],
  )
  const evaluations = useMemo(
    () => allEvaluations.filter((e) => e.childId === selectedChildId),
    [allEvaluations, selectedChildId],
  )

  // Adjustment form
  const [adjDate, setAdjDate] = useState(formatDateForInput(new Date()))
  const [adjMinutes, setAdjMinutes] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjSubject, setAdjSubject] = useState<SubjectBucket | ''>('')
  const [adjSaving, setAdjSaving] = useState(false)

  const fetchRecords = useCallback(async () => {
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
    const adjQuery = query(
      hoursAdjustmentsCollection(familyId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    )
    const evalsQuery = query(
      evaluationsCollection(familyId),
      where('monthStart', '>=', startDate),
      where('monthStart', '<=', endDate),
    )

    const [hoursSnap, daysSnap, adjSnap, artSnap, evalSnap] =
      await Promise.all([
        getDocs(hoursQuery),
        getDocs(daysQuery),
        getDocs(adjQuery),
        getDocs(
          query(
            artifactsCollection(familyId),
            where('createdAt', '>=', startDate),
            where('createdAt', '<=', endDate + 'T23:59:59'),
          ),
        ),
        getDocs(evalsQuery),
      ])

    return {
      hoursEntries: hoursSnap.docs.map((d) => {
        const data = d.data() as HoursEntry
        return { ...data, id: data.id ?? d.id, date: data.date ?? d.id }
      }),
      dayLogs: daysSnap.docs.map((d) => {
        const data = d.data() as DayLog
        return { ...data, date: data.date ?? parseDateFromDocId(d.id) }
      }),
      adjustments: adjSnap.docs.map((d) => {
        const data = d.data() as HoursAdjustment
        return { ...data, id: d.id }
      }),
      artifacts: artSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
      evaluations: evalSnap.docs.map((d) => {
        const data = d.data() as Evaluation
        return { ...data, id: d.id }
      }),
    }
  }, [endDate, familyId, startDate])

  const applyRecords = useCallback((data: Awaited<ReturnType<typeof fetchRecords>>) => {
    setAllHoursEntries(data.hoursEntries)
    setAllDayLogs(data.dayLogs)
    setAllAdjustments(data.adjustments)
    setAllArtifacts(data.artifacts)
    setAllEvaluations(data.evaluations)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchRecords()
      .then((data) => {
        if (!cancelled) applyRecords(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setIsLoading(false)
          setSnackMessage({ text: `Failed to load records: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
        }
      })
    return () => { cancelled = true }
  }, [fetchRecords, applyRecords])

  const summary = useMemo(
    () => computeHoursSummary(dayLogs, hoursEntries, adjustments),
    [dayLogs, hoursEntries, adjustments],
  )

  const hasHoursEntries = hoursEntries.length > 0
  const showGenerate = !hasHoursEntries && dayLogs.length > 0

  const handleGenerateHours = useCallback(async () => {
    if (dayLogs.length === 0) return
    setIsGenerating(true)
    try {
      const batch = writeBatch(db)
      dayLogs.forEach((log) => {
        log.blocks.forEach((block) => {
          const minutes = block.actualMinutes ?? 0
          if (minutes <= 0) return
          const entryRef = doc(hoursCollection(familyId))
          batch.set(entryRef, {
            childId: log.childId,
            date: log.date,
            minutes,
            blockType: block.type,
            subjectBucket: block.subjectBucket,
            location: block.location,
            quickCapture: block.quickCapture,
            notes: block.notes,
            dayLogId: log.childId ? `${log.date}_${log.childId}` : log.date,
          })
        })
      })

      await batch.commit()
      const data = await fetchRecords()
      applyRecords(data)
      setSnackMessage({ text: 'Hours generated successfully', severity: 'success' })
    } catch (err) {
      setSnackMessage({ text: `Failed to generate hours: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    } finally {
      setIsGenerating(false)
    }
  }, [dayLogs, familyId, fetchRecords, applyRecords])

  // Manual adjustment
  const handleAddAdjustment = useCallback(async () => {
    if (!adjMinutes || !adjReason.trim()) return
    setAdjSaving(true)
    try {
      await addDoc(hoursAdjustmentsCollection(familyId), {
        childId: selectedChildId || undefined,
        date: adjDate,
        minutes: Number(adjMinutes),
        reason: adjReason.trim(),
        subjectBucket: adjSubject || undefined,
        createdAt: new Date().toISOString(),
      })

      setAdjMinutes('')
      setAdjReason('')
      setAdjSubject('')
      const data = await fetchRecords()
      applyRecords(data)
      setSnackMessage({ text: 'Adjustment saved', severity: 'success' })
    } catch (err) {
      setSnackMessage({ text: `Failed to save adjustment: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    } finally {
      setAdjSaving(false)
    }
  }, [adjDate, adjMinutes, adjReason, adjSubject, familyId, selectedChildId, fetchRecords, applyRecords])

  // Export handlers
  const filePrefix = childNameLower ? `${childNameLower}-` : ''

  const handleExportHoursCsv = useCallback(() => {
    downloadFile(
      generateHoursSummaryCsv(summary),
      `${filePrefix}hours-summary-${startDate}-to-${endDate}.csv`,
      'text/csv',
    )
  }, [summary, filePrefix, startDate, endDate])

  const handleExportDailyLogCsv = useCallback(() => {
    downloadFile(
      generateDailyLogCsv(dayLogs, hoursEntries),
      `${filePrefix}daily-logs-${startDate}-to-${endDate}.csv`,
      'text/csv',
    )
  }, [dayLogs, hoursEntries, filePrefix, startDate, endDate])

  const handleExportEvaluationMd = useCallback(() => {
    const md = generateEvaluationMarkdown(
      evaluations,
      children.map((c) => ({ id: c.id, name: c.name })),
      artifacts,
    )
    downloadFile(
      md,
      `${filePrefix}evaluations-${startDate}-to-${endDate}.md`,
      'text/markdown',
    )
  }, [evaluations, children, artifacts, filePrefix, startDate, endDate])

  const handleExportPortfolioMd = useCallback(() => {
    const md = generatePortfolioMarkdown(
      artifacts,
      children.map((c) => ({ id: c.id, name: c.name })),
      startDate,
      endDate,
    )
    downloadFile(
      md,
      `${filePrefix}portfolio-${startDate}-to-${endDate}.md`,
      'text/markdown',
    )
  }, [artifacts, children, filePrefix, startDate, endDate])

  const [isZipping, setIsZipping] = useState(false)

  const handleDownloadZip = useCallback(async () => {
    setIsZipping(true)
    try {
      const blob = await buildComplianceZip({
        summary,
        dayLogs,
        hoursEntries,
        evaluations,
        artifacts,
        children: children.map((c) => ({ id: c.id, name: c.name })),
        startDate,
        endDate,
        childName: selectedChild?.name,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filePrefix}compliance-pack-${startDate}-to-${endDate}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setSnackMessage({ text: 'Compliance pack downloaded', severity: 'success' })
    } catch (err) {
      setSnackMessage({ text: `Failed to build zip: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    } finally {
      setIsZipping(false)
    }
  }, [summary, dayLogs, hoursEntries, evaluations, artifacts, children, selectedChild, filePrefix, startDate, endDate])

  const hasData = hasHoursEntries || dayLogs.length > 0

  return (
    <Page>
      {/* Date Range & Totals */}
      <SectionCard title="Records">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Start date"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) =>
                setStartDate(formatDateForInput(e.target.value))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End date"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(formatDateForInput(e.target.value))}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <ChildSelector
            children={children}
            selectedChildId={selectedChildId}
            onSelect={setSelectedChildId}
          />
          <Typography color="text.secondary" variant="body2">
            Showing records for {selectedChild?.name ?? 'child'} from {startDate} through {endDate}.
          </Typography>

          {isLoading ? (
            <Typography color="text.secondary">Loading records...</Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="subtitle1">
                Total hours: {formatHours(summary.totalMinutes)}
              </Typography>
              <Typography variant="subtitle1">
                Core hours: {formatHours(summary.coreMinutes)}
              </Typography>
              <Typography variant="subtitle1">
                Core hours at Home: {formatHours(summary.coreHomeMinutes)}
              </Typography>
              {summary.adjustmentMinutes !== 0 && (
                <Typography variant="body2" color="text.secondary">
                  Includes {summary.adjustmentMinutes > 0 ? '+' : ''}
                  {summary.adjustmentMinutes} minutes in manual adjustments
                </Typography>
              )}
              <Typography color="text.secondary" variant="body2">
                Hours entries: {hoursEntries.length} | Day logs: {dayLogs.length}{' '}
                | Adjustments: {adjustments.length}
              </Typography>
              {showGenerate && (
                <Button
                  variant="contained"
                  size="small"
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

      {/* Hours Breakdown by Subject */}
      {!isLoading && hasData && (
        <SectionCard title="Hours by Subject">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Subject</TableCell>
                <TableCell align="right">Total Hours</TableCell>
                <TableCell align="right">Home Hours</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.bySubject.map((row) => (
                <TableRow key={row.subjectBucket}>
                  <TableCell>{row.subjectBucket}</TableCell>
                  <TableCell align="right">
                    {formatHours(row.totalMinutes)}
                  </TableCell>
                  <TableCell align="right">
                    {formatHours(row.homeMinutes)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <strong>Total</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>{formatHours(summary.totalMinutes)}</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>{formatHours(summary.coreHomeMinutes)}</strong>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {/* Manual Adjustment */}
      <SectionCard title="Manual Hours Adjustment">
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Add or subtract hours manually. Use negative minutes to reduce.
            Each adjustment is tracked for audit.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={adjDate}
              onChange={(e) =>
                setAdjDate(formatDateForInput(e.target.value))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Minutes (+/-)"
              type="number"
              size="small"
              value={adjMinutes}
              onChange={(e) => setAdjMinutes(e.target.value)}
              sx={{ maxWidth: 120 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Subject (optional)</InputLabel>
              <Select
                value={adjSubject}
                label="Subject (optional)"
                onChange={(e) =>
                  setAdjSubject(e.target.value as SubjectBucket | '')
                }
              >
                <MenuItem value="">None</MenuItem>
                {subjectBucketOptions.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <TextField
            label="Reason"
            size="small"
            fullWidth
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            placeholder="Why is this adjustment needed?"
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleAddAdjustment}
            disabled={adjSaving || !adjMinutes || !adjReason.trim()}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add Adjustment
          </Button>

          {adjustments.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2">Adjustment History</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Minutes</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {adjustments.map((adj) => (
                    <TableRow key={adj.id ?? adj.date + adj.reason}>
                      <TableCell>{adj.date}</TableCell>
                      <TableCell align="right">
                        {adj.minutes > 0 ? '+' : ''}
                        {adj.minutes}
                      </TableCell>
                      <TableCell>{adj.subjectBucket ?? '—'}</TableCell>
                      <TableCell>{adj.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Stack>
      </SectionCard>

      {/* Export Pack */}
      <SectionCard title="Export Pack">
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Download a single zip with all compliance records, or use the
            individual buttons below for a specific file.
          </Typography>
          <Button
            variant="contained"
            onClick={handleDownloadZip}
            disabled={!hasData || isZipping}
          >
            {isZipping ? 'Building zip\u2026' : 'Download Compliance Pack (.zip)'}
          </Button>
          <Divider />
          <Typography variant="body2" color="text.secondary">
            Individual exports
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              onClick={handleExportHoursCsv}
              disabled={!hasData}
            >
              Hours Summary CSV
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleExportDailyLogCsv}
              disabled={!hasData}
            >
              Daily Log CSV
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleExportEvaluationMd}
              disabled={evaluations.length === 0}
            >
              Evaluations Markdown
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleExportPortfolioMd}
              disabled={artifacts.length === 0}
            >
              Portfolio Index Markdown
            </Button>
          </Stack>
        </Stack>
      </SectionCard>

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMessage(null)}
          severity={snackMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackMessage?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}
