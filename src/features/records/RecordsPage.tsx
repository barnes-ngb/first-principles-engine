import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

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
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type {
  Artifact,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { formatDateForInput } from '../../core/utils/format'
import { getSchoolYearRange } from '../../core/utils/time'
import { parseDateFromDocId } from '../today/daylog.model'
import ComplianceDashboard from './ComplianceDashboard'
import EvaluationHistoryTab from './EvaluationHistoryTab'
import PortfolioPage from './PortfolioPage'
import {
  buildComplianceZip,
  computeHoursSummary,
  deriveChildIdFromDocId,
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
  const [activeTab, setActiveTab] = useState(0)

  const handleTabChange = (_: SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  return (
    <>
      <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 3 } }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Hours & Compliance" />
            <Tab label="Evaluations" />
            <Tab label="Portfolio" />
          </Tabs>
        </Box>
      </Container>
      {activeTab === 0 && <HoursComplianceTab />}
      {activeTab === 1 && <EvaluationHistoryTab />}
      {activeTab === 2 && <PortfolioPage />}
    </>
  )
}

function HoursComplianceTab() {
  const familyId = useFamilyId()
  const { start, end } = useMemo(() => getSchoolYearRange(), [])
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(end)
  const [allHoursEntries, setAllHoursEntries] = useState<HoursEntry[]>([])
  const [allDayLogs, setAllDayLogs] = useState<DayLog[]>([])
  const [allAdjustments, setAllAdjustments] = useState<HoursAdjustment[]>([])
  const { activeChildId, activeChild, children } = useActiveChild()
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([])
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [snackMessage, setSnackMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const childNameLower = activeChild?.name.toLowerCase() ?? ''

  // Filter data by active child
  const hoursEntries = useMemo(
    () => allHoursEntries.filter((e) => e.childId === activeChildId),
    [allHoursEntries, activeChildId],
  )
  const dayLogs = useMemo(
    () => allDayLogs.filter((l) => l.childId === activeChildId),
    [allDayLogs, activeChildId],
  )
  const adjustments = useMemo(
    () => allAdjustments.filter((a) => !a.childId || a.childId === activeChildId),
    [allAdjustments, activeChildId],
  )
  const artifacts = useMemo(
    () => allArtifacts.filter((a) => a.childId === activeChildId),
    [allArtifacts, activeChildId],
  )
  const evaluations = useMemo(
    () => allEvaluations.filter((e) => e.childId === activeChildId),
    [allEvaluations, activeChildId],
  )

  // Adjustment form
  const [adjDate, setAdjDate] = useState(formatDateForInput(new Date()))
  const [adjMinutes, setAdjMinutes] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjSubject, setAdjSubject] = useState<SubjectBucket | ''>('')
  const [adjSaving, setAdjSaving] = useState(false)

  // Backfill state
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [backfillMonth, setBackfillMonth] = useState('')
  const [backfillEntries, setBackfillEntries] = useState<Array<{subject: SubjectBucket, hours: number}>>([
    { subject: SubjectBucket.Reading, hours: 0 },
    { subject: SubjectBucket.LanguageArts, hours: 0 },
    { subject: SubjectBucket.Math, hours: 0 },
    { subject: SubjectBucket.Science, hours: 0 },
    { subject: SubjectBucket.SocialStudies, hours: 0 },
  ])

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
        return {
          ...data,
          id: data.id ?? d.id,
          date: data.date ?? d.id,
          childId: data.childId ?? (data.dayLogId ? deriveChildIdFromDocId(data.dayLogId) : undefined),
        }
      }),
      dayLogs: daysSnap.docs.map((d) => {
        const data = d.data() as DayLog
        return {
          ...data,
          date: data.date ?? parseDateFromDocId(d.id),
          childId: data.childId ?? deriveChildIdFromDocId(d.id) ?? '',
        }
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
    () => computeHoursSummary(dayLogs, hoursEntries, adjustments, activeChildId),
    [dayLogs, hoursEntries, adjustments, activeChildId],
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
        childId: activeChildId,
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
  }, [adjDate, adjMinutes, adjReason, adjSubject, familyId, activeChildId, fetchRecords, applyRecords])

  // Backfill handler
  const handleSaveBackfill = useCallback(async () => {
    if (!activeChildId || !backfillMonth) return

    try {
      const [year, month] = backfillMonth.split('-').map(Number)
      const midMonth = `${backfillMonth}-15`

      for (const entry of backfillEntries) {
        if (entry.hours <= 0) continue
        const minutes = Math.round(entry.hours * 60)

        await addDoc(hoursAdjustmentsCollection(familyId), {
          childId: activeChildId,
          date: midMonth,
          subjectBucket: entry.subject,
          minutes,
          reason: `Historical backfill: ${entry.subject} for ${year}-${String(month).padStart(2, '0')}`,
          source: 'backfill',
          createdAt: new Date().toISOString(),
        })
      }

      setBackfillOpen(false)
      setBackfillMonth('')
      setBackfillEntries(backfillEntries.map(e => ({ ...e, hours: 0 })))
      const data = await fetchRecords()
      applyRecords(data)
      setSnackMessage({ text: 'Historical hours saved', severity: 'success' })
    } catch (err) {
      console.error('Backfill failed:', err)
      setSnackMessage({ text: `Backfill failed: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    }
  }, [activeChildId, backfillMonth, backfillEntries, familyId, fetchRecords, applyRecords])

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
        childName: activeChild?.name ?? '',
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
  }, [summary, dayLogs, hoursEntries, evaluations, artifacts, children, activeChild, filePrefix, startDate, endDate])

  const handleClearHoursData = useCallback(async () => {
    if (!window.confirm('This will delete manual hours entries and adjustments. Auto-generated hours (Dad Lab, etc.) will be kept. Continue?')) return

    try {
      // Delete ONLY manual hours entries (no source tag or source === 'manual')
      const hoursSnap = await getDocs(hoursCollection(familyId))
      for (const docSnap of hoursSnap.docs) {
        const data = docSnap.data()
        const source = (data as unknown as Record<string, unknown>).source as string | undefined
        if (!source || source === 'manual') {
          await deleteDoc(doc(hoursCollection(familyId), docSnap.id))
        }
      }

      // Delete all adjustments (these are always manual)
      const adjSnap = await getDocs(hoursAdjustmentsCollection(familyId))
      for (const docSnap of adjSnap.docs) {
        await deleteDoc(doc(hoursAdjustmentsCollection(familyId), docSnap.id))
      }

      window.location.reload()
    } catch (err) {
      console.error('Failed to clear hours data:', err)
      setSnackMessage({ text: `Failed to clear hours data: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    }
  }, [familyId])

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
          {!activeChildId ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                Select a profile to view Records
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use the profile menu to choose a child, or visit Settings.
              </Typography>
            </Stack>
          ) : null}

          {activeChildId && (
            <Typography color="text.secondary" variant="body2">
              Showing records for {activeChild?.name ?? 'child'} from {startDate} through {endDate}.
            </Typography>
          )}

          {activeChildId && isLoading && (
            <Typography color="text.secondary">Loading records...</Typography>
          )}

          {activeChildId && !isLoading && (
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
              {(() => {
                const backfillMinutes = adjustments
                  .filter(a => a.source === 'backfill')
                  .reduce((sum, a) => sum + a.minutes, 0)
                const otherAdjMinutes = adjustments
                  .filter(a => a.source !== 'backfill')
                  .reduce((sum, a) => sum + a.minutes, 0)
                return (
                  <>
                    {backfillMinutes > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Includes {(backfillMinutes / 60).toFixed(1)}h historical (backfill)
                      </Typography>
                    )}
                    {otherAdjMinutes !== 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Includes {otherAdjMinutes > 0 ? '+' : ''}{(otherAdjMinutes / 60).toFixed(1)}h manual adjustments
                      </Typography>
                    )}
                  </>
                )
              })()}
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

      {/* Compliance Dashboard */}
      {activeChildId && !isLoading && hasData && (
        <ComplianceDashboard
          summary={summary}
          startDate={startDate}
          endDate={endDate}
        />
      )}

      {/* Hours Breakdown by Subject */}
      {activeChildId && !isLoading && hasData && (
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
      {activeChildId && <SectionCard title="Manual Hours Adjustment">
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
      </SectionCard>}

      {/* Backfill Historical Hours */}
      {activeChildId && (
        <SectionCard title="Backfill Historical Hours">
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Enter approximate monthly totals per subject for months before the app was set up.
              These count toward MO compliance totals.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setBackfillOpen(true)}
              sx={{ alignSelf: 'flex-start' }}
            >
              + Add Historical Hours
            </Button>
          </Stack>
        </SectionCard>
      )}

      {/* Export Pack */}
      {activeChildId && <SectionCard title="Export Pack">
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
      </SectionCard>}

      {activeChildId && !isLoading && (
        <Box sx={{ mx: 2, mt: 4, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" gutterBottom>
            Admin
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              color="warning"
              size="small"
              onClick={handleClearHoursData}
            >
              Clear All Hours Data
            </Button>
          </Box>
        </Box>
      )}

      <Dialog open={backfillOpen} onClose={() => setBackfillOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Historical Hours</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Enter approximate hours per subject for a past month. These count toward MO compliance totals.
            </Typography>

            <TextField
              label="Month"
              type="month"
              value={backfillMonth}
              onChange={e => setBackfillMonth(e.target.value)}
              fullWidth
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="e.g., 2025-09 for September 2025"
            />

            {activeChildId && (
              <Typography variant="caption" color="text.secondary">
                Adding hours for: {activeChild?.name ?? 'selected child'}
              </Typography>
            )}

            {backfillEntries.map((entry, i) => (
              <Stack key={entry.subject} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ minWidth: 120 }}>
                  {entry.subject}
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  value={entry.hours || ''}
                  onChange={e => {
                    const updated = [...backfillEntries]
                    updated[i] = { ...entry, hours: parseFloat(e.target.value) || 0 }
                    setBackfillEntries(updated)
                  }}
                  sx={{ width: 100 }}
                  slotProps={{ htmlInput: { min: 0, max: 200, step: 0.5 } }}
                />
                <Typography variant="caption" color="text.secondary">hours</Typography>
              </Stack>
            ))}

            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Total: {backfillEntries.reduce((sum, e) => sum + e.hours, 0).toFixed(1)} hours
            </Typography>

            <Button
              variant="contained"
              onClick={handleSaveBackfill}
              disabled={!backfillMonth || !activeChildId || backfillEntries.every(e => e.hours === 0)}
              fullWidth
            >
              Save Historical Hours
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

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
