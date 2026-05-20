import { useCallback, useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import ScanAnalysisPanel from '../../components/ScanAnalysisPanel'
import ScanButton from '../../components/ScanButton'
import ScanResultsPanel from '../../components/ScanResultsPanel'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import { scansCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useActivityConfigs } from '../../core/hooks/useActivityConfigs'
import type { NewActivityConfig } from '../../core/hooks/useActivityConfigs'
import { useScan } from '../../core/hooks/useScan'
import { useScanToActivityConfig } from '../../core/hooks/useScanToActivityConfig'
import type { ActivityConfig, CurriculumDetected, ScanRecord } from '../../core/types'
import { isWorksheetScan } from '../../core/types/planning'
import { ActivityFrequencyLabel } from '../../core/types/enums'
import AddActivityDialog from './AddActivityDialog'
import EditRoutinesDialog from './EditRoutinesDialog'

export default function CurriculumTab() {
  const familyId = useFamilyId()
  const {
    children: childList,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()
  const {
    configs,
    loading: configsLoading,
    addConfig,
    updateConfig,
    deleteConfig,
    markComplete,
  } = useActivityConfigs(activeChildId)

  // Scans from Firestore
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([])
  useEffect(() => {
    if (!familyId || !activeChildId) return
    const q = query(
      scansCollection(familyId),
      where('childId', '==', activeChildId),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRecentScans(
          snap.docs.map((d) => {
            const data = d.data() as ScanRecord
            // Firestore serverTimestamp() returns a Timestamp object, not a string.
            // Convert to ISO string so downstream date comparisons and formatting work.
            const raw = data.createdAt
            if (raw && typeof raw !== 'string' && typeof (raw as unknown as { toDate: () => Date }).toDate === 'function') {
              data.createdAt = (raw as unknown as { toDate: () => Date }).toDate().toISOString()
            }
            return { ...data, id: d.id }
          }),
        )
      },
      (err) => console.error('[CurriculumTab] Failed to load scans', err),
    )
    return unsub
  }, [familyId, activeChildId])

  // Group configs by type
  const workbooks = configs.filter((c) => c.type === 'workbook' && !c.completed)
  const routines = configs.filter(
    (c) => (c.type === 'routine' || c.type === 'formation') && !c.completed,
  )
  const evaluations = configs.filter((c) => c.type === 'evaluation' && !c.completed)
  const completed = configs.filter((c) => c.completed)

  // Match scans to workbooks
  const scansForWorkbook = useCallback(
    (config: ActivityConfig): ScanRecord[] => {
      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const configName = norm(config.name)
      const configCurriculum = norm(config.curriculum || '')
      return recentScans.filter((s) => {
        if (!s.results || s.results.pageType === 'certificate') return false
        const scanSubject = norm(s.results.subject || '')
        const detected = s.results.curriculumDetected
        const scanCurr = norm(detected?.name || '')
        return (
          (configName && scanSubject.includes(configName)) ||
          (configName && scanCurr.includes(configName)) ||
          (configCurriculum && scanCurr.includes(configCurriculum)) ||
          (configCurriculum && scanSubject.includes(configCurriculum))
        )
      })
    },
    [recentScans],
  )

  // This week's scans (last 7 days, all curriculum-relevant page types)
  const weeklyScans = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoff = sevenDaysAgo.toISOString()
    return recentScans.filter(
      (s) =>
        s.results &&
        s.results.pageType !== 'certificate' &&
        s.results.pageType !== 'other' &&
        (s.createdAt ?? '') >= cutoff,
    )
  }, [recentScans])

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [menuConfig, setMenuConfig] = useState<ActivityConfig | null>(null)

  // Confirm complete dialog
  const [confirmComplete, setConfirmComplete] = useState<ActivityConfig | null>(null)

  // Edit routines dialog
  const [editRoutinesOpen, setEditRoutinesOpen] = useState(false)

  // Add activity dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Scan state
  const { scan, scanResult, scanning, error: scanError, clearScan } = useScan()
  const { syncScanToConfig } = useScanToActivityConfig()
  const [scanSnack, setScanSnack] = useState<string | null>(null)

  // Snackbar
  const [snack, setSnack] = useState<string | null>(null)

  const openMenu = (e: React.MouseEvent<HTMLElement>, config: ActivityConfig) => {
    setMenuAnchor(e.currentTarget)
    setMenuConfig(config)
  }
  const closeMenu = () => {
    setMenuAnchor(null)
    setMenuConfig(null)
  }

  const handleMarkComplete = async (config: ActivityConfig) => {
    await markComplete(config.id)
    setSnack(`"${config.name}" marked as complete`)
    setConfirmComplete(null)
  }

  const handleDelete = async (config: ActivityConfig) => {
    await deleteConfig(config.id)
    setSnack(`"${config.name}" removed`)
  }

  const handleSaveRoutines = async (updated: ActivityConfig[]) => {
    // Delete removed routines
    const updatedIds = new Set(updated.map((u) => u.id))
    const toDelete = routines.filter((r) => !updatedIds.has(r.id))
    for (const r of toDelete) {
      await deleteConfig(r.id)
    }

    // Add new or update existing
    for (const item of updated) {
      if (item.id.startsWith('new-')) {
        await addConfig({
          name: item.name,
          type: item.type as NewActivityConfig['type'],
          subjectBucket: item.subjectBucket as NewActivityConfig['subjectBucket'],
          defaultMinutes: item.defaultMinutes,
          frequency: item.frequency as NewActivityConfig['frequency'],
          childId: item.childId,
          sortOrder: item.sortOrder,
          scannable: false,
        })
      } else {
        await updateConfig(item.id, {
          name: item.name,
          defaultMinutes: item.defaultMinutes,
          frequency: item.frequency,
        })
      }
    }

    setEditRoutinesOpen(false)
    setSnack('Routines updated')
  }

  const handleAddActivity = async (data: NewActivityConfig) => {
    await addConfig(data)
    setSnack(`"${data.name}" added`)
  }

  // Scan handlers
  const handleCapture = useCallback(
    async (file: File) => {
      if (!familyId || !activeChildId) return
      const record = await scan(file, familyId, activeChildId)

      if (record?.results && isWorksheetScan(record.results)) {
        try {
          const result = await syncScanToConfig(activeChildId, record.results)
          if (result.action === 'created') {
            setScanSnack(`New workbook added: ${result.configName}`)
          } else if (result.action === 'updated' && result.position) {
            setScanSnack(`Updated ${result.configName} to lesson ${result.position}`)
          }
        } catch (err) {
          console.error('[CurriculumTab] Failed to sync config:', err)
        }

        const skills = record.results.skillsTargeted
        if (skills.length > 0) {
          try {
            const findings = skills.map((s) => ({
              skill: s.skill,
              status: (s.alignsWithSnapshot === 'ahead' ? 'mastered' : 'emerging') as
                | 'mastered'
                | 'emerging',
              evidence: `Workbook scan: ${s.skill} (${s.level})`,
              testedAt: new Date().toISOString(),
            }))
            await updateSkillMapFromFindings(familyId, activeChildId, findings)
          } catch (err) {
            console.warn('[CurriculumTab] Failed to update skill map:', err)
          }
        }
      }
    },
    [familyId, activeChildId, scan, syncScanToConfig, setScanSnack],
  )

  const handleUpdatePosition = useCallback(
    async (curriculum: CurriculumDetected) => {
      if (!familyId || !activeChildId || !curriculum.lessonNumber) return
      try {
        const result = await syncScanToConfig(activeChildId, {
          pageType: 'worksheet',
          subject: curriculum.name || 'unknown',
          specificTopic: '',
          skillsTargeted: [],
          estimatedDifficulty: 'appropriate',
          recommendation: 'do',
          recommendationReason: '',
          estimatedMinutes: 30,
          teacherNotes: '',
          curriculumDetected: curriculum,
        })
        if (result.action === 'created') {
          setScanSnack(`New workbook "${result.configName}" created at Lesson ${curriculum.lessonNumber}!`)
        } else if (result.action === 'updated') {
          setScanSnack(`Position updated to Lesson ${curriculum.lessonNumber}!`)
        }
      } catch (err) {
        console.error('[CurriculumTab] Failed to update position', err)
        setScanSnack('Failed to update position')
      }
    },
    [familyId, activeChildId, syncScanToConfig, setScanSnack],
  )

  const handleSkipToNext = useCallback(
    async (nextLesson: number) => {
      if (!familyId || !activeChildId || !scanResult?.results) return
      const results = scanResult.results
      if (results.pageType === 'certificate') return
      const curriculum = results.curriculumDetected
      if (!curriculum) return
      try {
        await syncScanToConfig(activeChildId, {
          ...results,
          curriculumDetected: { ...curriculum, lessonNumber: nextLesson },
        })
        setScanSnack(`Skipping ahead — next lesson: ${nextLesson}`)
      } catch (err) {
        console.error('[CurriculumTab] Failed to skip to next', err)
        setScanSnack('Failed to update position')
      }
    },
    [familyId, activeChildId, scanResult, syncScanToConfig, setScanSnack],
  )

  const handleScanAnother = useCallback(() => {
    clearScan()
  }, [clearScan])

  const loading = isLoadingChildren || configsLoading

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography color="text.secondary">Loading curriculum...</Typography>
        </Stack>
      </Container>
    )
  }

  const childName = activeChild?.name ?? 'Child'

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack spacing={2}>
        {/* Child selector */}
        {childList.length > 1 && (
          <ChildSelector
            children={childList}
            selectedChildId={activeChildId}
            onSelect={setActiveChildId}
            onChildAdded={addChild}
          />
        )}

        <Typography variant="h5" fontWeight={600}>
          {childName}&apos;s Curriculum
        </Typography>

        {/* This Week's Scans */}
        <SectionCard
          title={`This week\u2019s scans${weeklyScans.length > 0 ? ` (${weeklyScans.length})` : ''}`}
        >
          {weeklyScans.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No scans this week yet — capture work on the Today page to see AI analysis here.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {weeklyScans.map((scanRec) => (
                <ScanAnalysisPanel key={scanRec.id} scan={scanRec} />
              ))}
            </Stack>
          )}
        </SectionCard>

        {/* Active Workbooks */}
        <SectionCard title="Active Workbooks">
          {workbooks.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No workbooks configured. Scan a page or add one manually.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {workbooks.map((config) => {
                const matchedScans = scansForWorkbook(config)
                return (
                  <WorkbookCard
                    key={config.id}
                    config={config}
                    recentScans={matchedScans}
                    onOpenMenu={openMenu}
                    onScanCapture={handleCapture}
                    scanning={scanning}
                  />
                )
              })}
            </Stack>
          )}
        </SectionCard>

        {/* Routine Activities */}
        <SectionCard
          title="Routine Activities"
          action={
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditRoutinesOpen(true)}>
              Edit routines
            </Button>
          }
        >
          {routines.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No routine activities configured.
            </Typography>
          ) : (
            <List dense disablePadding>
              {routines.map((config) => (
                <ListItem
                  key={config.id}
                  secondaryAction={
                    <IconButton
                      size="small"
                      onClick={(e) => openMenu(e, config)}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={config.name}
                    secondary={`${config.defaultMinutes}m · ${ActivityFrequencyLabel[config.frequency] ?? config.frequency}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </SectionCard>

        {/* Evaluations (auto-managed) */}
        {evaluations.length > 0 && (
          <SectionCard title="Evaluations (auto-managed)">
            <List dense disablePadding>
              {evaluations.map((config) => (
                <ListItem key={config.id}>
                  <ListItemText
                    primary={config.name}
                    secondary={`${config.defaultMinutes}m · ${ActivityFrequencyLabel[config.frequency] ?? config.frequency}`}
                  />
                </ListItem>
              ))}
            </List>
          </SectionCard>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <SectionCard title="Completed">
            <Stack spacing={1}>
              {completed.map((config) => (
                <Stack
                  key={config.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ opacity: 0.7 }}
                >
                  <CheckCircleOutlineIcon color="success" fontSize="small" />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {config.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {config.completedDate
                      ? new Date(config.completedDate).toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'completed'}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </SectionCard>
        )}

        {/* Scan to Add New Workbook */}
        <Card sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add to Curriculum
          </Typography>
          {!scanResult && !scanning && (
            <Stack spacing={1}>
              <ScanButton onCapture={handleCapture} variant="button" />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setAddDialogOpen(true)}
                fullWidth
              >
                Add Activity Manually
              </Button>
            </Stack>
          )}

          {scanning && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Analyzing image...
              </Typography>
            </Stack>
          )}

          {scanError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {scanError}
            </Alert>
          )}

          {scanResult?.results && (
            <Box sx={{ mt: 1 }}>
              <ScanResultsPanel
                results={scanResult.results}
                imageUrl={scanResult.imageUrl}
                onUpdatePosition={handleUpdatePosition}
                onSkipToNext={handleSkipToNext}
                onScanAnother={handleScanAnother}
                childName={childName}
              />
            </Box>
          )}
        </Card>
      </Stack>

      {/* Three-dot context menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menuConfig) {
              setConfirmComplete(menuConfig)
            }
            closeMenu()
          }}
        >
          <CheckCircleOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Mark as complete
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuConfig) void handleDelete(menuConfig)
            closeMenu()
          }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Remove
        </MenuItem>
      </Menu>

      {/* Confirm Complete dialog */}
      <Dialog
        open={confirmComplete !== null}
        onClose={() => setConfirmComplete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Mark as complete?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Mark &ldquo;{confirmComplete?.name}&rdquo; as complete? It won&apos;t appear in future
            weekly plans but will stay in your records.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmComplete(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => {
              if (confirmComplete) void handleMarkComplete(confirmComplete)
            }}
          >
            Mark Complete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Routines dialog */}
      <EditRoutinesDialog
        open={editRoutinesOpen}
        routines={routines}
        onSave={(updated) => void handleSaveRoutines(updated)}
        onClose={() => setEditRoutinesOpen(false)}
      />

      {/* Add Activity dialog */}
      <AddActivityDialog
        open={addDialogOpen}
        childId={activeChildId}
        nextSortOrder={configs.length + 1}
        onAdd={(data) => void handleAddActivity(data)}
        onClose={() => setAddDialogOpen(false)}
      />

      {/* Snackbars */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
      <Snackbar
        open={!!scanSnack}
        autoHideDuration={3000}
        onClose={() => setScanSnack(null)}
        message={scanSnack}
      />
    </Container>
  )
}

// ── Workbook Card ──────────────────────────────────────────────

interface WorkbookCardProps {
  config: ActivityConfig
  recentScans: ScanRecord[]
  onOpenMenu: (e: React.MouseEvent<HTMLElement>, config: ActivityConfig) => void
  onScanCapture: (file: File) => void
  scanning: boolean
}

function WorkbookCard({ config, recentScans, onOpenMenu, onScanCapture, scanning }: WorkbookCardProps) {
  const progress =
    config.currentPosition && config.totalUnits
      ? (config.currentPosition / config.totalUnits) * 100
      : null

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {config.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {config.subjectBucket} · {ActivityFrequencyLabel[config.frequency] ?? config.frequency}{' '}
            · {config.defaultMinutes}m
          </Typography>
        </Box>
        <IconButton size="small" onClick={(e) => onOpenMenu(e, config)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Position + progress bar */}
      {config.currentPosition != null && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon fontSize="small" color="primary" />
          <Typography variant="body2">
            {config.unitLabel
              ? `${config.unitLabel.charAt(0).toUpperCase() + config.unitLabel.slice(1)} ${config.currentPosition}`
              : `Lesson ${config.currentPosition}`}
            {config.totalUnits ? ` of ${config.totalUnits}` : ''}
          </Typography>
          {progress !== null && (
            <LinearProgress
              variant="determinate"
              value={Math.min(progress, 100)}
              sx={{ flex: 1, ml: 1, height: 6, borderRadius: 3 }}
            />
          )}
        </Box>
      )}

      {/* Last updated */}
      {config.updatedAt && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Last updated:{' '}
          {new Date(config.updatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </Typography>
      )}

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Recent scans:
          </Typography>
          {recentScans.slice(0, 3).map((scanRec) => {
            if (!scanRec.results || scanRec.results.pageType === 'certificate') return null
            return (
              <ScanAnalysisPanel key={scanRec.id} scan={scanRec} />
            )
          })}
        </Box>
      )}

      {/* Actions */}
      {config.scannable && (
        <Box sx={{ mt: 2 }}>
          <ScanButton onCapture={onScanCapture} variant="button" loading={scanning} />
        </Box>
      )}
    </Card>
  )
}
