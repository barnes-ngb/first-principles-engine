import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import StarOutlineIcon from '@mui/icons-material/StarOutline'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PersonIcon from '@mui/icons-material/Person'
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
import SectionCard from '../../components/SectionCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import { scansCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useActivityConfigs } from '../../core/hooks/useActivityConfigs'
import type { NewActivityConfig } from '../../core/hooks/useActivityConfigs'
import { useCertificateProgress } from '../../core/hooks/useCertificateProgress'
import { useScan } from '../../core/hooks/useScan'
import { isWorkbookMatch, useScanToActivityConfig } from '../../core/hooks/useScanToActivityConfig'
import type { ActivityConfig, CertificateScanResult, ScanRecord, ScanResult } from '../../core/types'
import { isCertificateScan, isWorksheetScan } from '../../core/types/planning'
import { ActivityFrequencyLabel } from '../../core/types/enums'
import { nameKey } from '../../core/utils/nameKey'
import AddActivityDialog from './AddActivityDialog'
import EditRoutinesDialog from './EditRoutinesDialog'
import {
  CURRICULUM_SECTION_TITLE,
  CurriculumSection,
  groupCurriculumConfigs,
  OTHER_ACTIVITIES_DESCRIPTION,
} from './curriculumGrouping'
import { processScanBatch } from './multiPageScan'
import {
  buildDeleteActivityPrompt,
  deleteFailureNotice,
  DELETE_ACTIVITY_MENU_LABEL,
} from './removeActivityCopy'

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

  // Group configs by type — a PARTITION, not a set of filters (UX-204). Four
  // independent filters over a six-member enum left `activity` and `app` configs
  // rendered nowhere while they went on planning every day; `groupCurriculumConfigs`
  // places every type by a `Record<ActivityType, …>` a new member cannot escape.
  const { workbooks, routines, other, evaluations, completed } = useMemo(
    () => groupCurriculumConfigs(configs),
    [configs],
  )

  // Match scans to workbooks
  const scansForWorkbook = useCallback(
    (config: ActivityConfig): ScanRecord[] => {
      // UX-205: the one shared name-comparison rule, not a fourth copy of it.
      const norm = nameKey
      const configName = norm(config.name)
      const configCurriculum = norm(config.curriculum)
      return recentScans.filter((s) => {
        if (!s.results || s.results.pageType === 'certificate') return false
        const scanSubject = norm(s.results.subject)
        const detected = s.results.curriculumDetected
        const scanCurr = norm(detected?.name)
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
  /** UX-48: the destructive tap now stops here first. See `removeActivityCopy`. */
  const [confirmDelete, setConfirmDelete] = useState<ActivityConfig | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reassign-owner dialog (DATA-08): move a workbook to its real child owner.
  const [reassign, setReassign] = useState<ActivityConfig | null>(null)

  // Edit routines dialog
  const [editRoutinesOpen, setEditRoutinesOpen] = useState(false)

  // Add activity dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Scan state
  const { scan, scanning, clearScan } = useScan()
  const { syncScanToConfig } = useScanToActivityConfig()
  const {
    buildPreview: buildCertPreview,
    applyUpdate: applyCertUpdate,
    preview: certPreview,
    applying: certApplying,
    error: certError,
    clearState: clearCertState,
  } = useCertificateProgress()
  const [scanSnack, setScanSnack] = useState<string | null>(null)
  /** Which card is currently scanning (null = "Add to Curriculum" generic scan). */
  const [scanningConfigId, setScanningConfigId] = useState<string | null>(null)
  /** Pending certificate result awaiting confirmation, scoped to a specific card. */
  const [certConfirm, setCertConfirm] = useState<{
    result: CertificateScanResult
    config: ActivityConfig
  } | null>(null)
  /** Mismatch warning when scan detects a different curriculum than the card. */
  const [mismatchPrompt, setMismatchPrompt] = useState<{
    result: ScanResult
    config: ActivityConfig
    detectedName: string
  } | null>(null)

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

  /**
   * UX-48. Two changes from the unguarded original: it is reachable only
   * through the confirm dialog, and a REJECTED delete now says so. The old
   * `void handleDelete(config)` floated the promise and only the success snack
   * existed, so a failed `deleteDoc` said nothing at all.
   */
  const handleDelete = async (config: ActivityConfig) => {
    setDeleting(true)
    try {
      await deleteConfig(config.id)
      setConfirmDelete(null)
      setSnack(`"${config.name}" deleted`)
    } catch (err) {
      console.error('[Curriculum] Failed to delete activity config:', err)
      setConfirmDelete(null)
      setSnack(deleteFailureNotice(config.name))
    } finally {
      setDeleting(false)
    }
  }

  /**
   * FEAT-199: flip whether this activity is offered on Kid Today's "I Did More!"
   * quick-log row. One boolean on one doc — no day, no hour and no plan moves,
   * and it changes only what chips a kid is OFFERED, never what a logged item
   * already says.
   */
  const handleToggleQuickLog = async (config: ActivityConfig) => {
    const next = config.quickLog !== true
    await updateConfig(config.id, { quickLog: next })
    setSnack(
      next
        ? `"${config.name}" added to the kids' quick log`
        : `"${config.name}" removed from the kids' quick log`,
    )
  }

  const handleReassign = async (config: ActivityConfig, childId: string) => {
    await updateConfig(config.id, { childId })
    const owner = childList.find((c) => c.id === childId)?.name ?? childId
    setReassign(null)
    setSnack(`"${config.name}" assigned to ${owner}`)
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
  const feedSkillMap = useCallback(
    async (results: ScanResult) => {
      if (!familyId || !activeChildId) return
      if (!isWorksheetScan(results)) return
      const skills = results.skillsTargeted
      if (skills.length === 0) return
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
    },
    [familyId, activeChildId],
  )

  // ── Multi-page staging (Curriculum tab, opt-in) ──
  // Stage N workbook photos, then process them sequentially so same-workbook
  // pages merge (DATA-15 matcher) and distinct workbooks each get a config.
  const [stagedPages, setStagedPages] = useState<{ file: File; url: string }[]>([])
  const [batchProcessing, setBatchProcessing] = useState(false)

  // Revoke any pending object URLs on unmount.
  const stagedRef = useRef(stagedPages)
  useEffect(() => {
    stagedRef.current = stagedPages
  }, [stagedPages])
  useEffect(
    () => () => {
      stagedRef.current.forEach((p) => URL.revokeObjectURL(p.url))
    },
    [],
  )

  const handleStagePages = useCallback((files: File[]) => {
    setStagedPages((prev) => [
      ...prev,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ])
  }, [])

  const removeStagedPage = useCallback((index: number) => {
    setStagedPages((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.url)
      return next
    })
  }, [])

  const handleScanPages = useCallback(async () => {
    if (!familyId || !activeChildId || stagedPages.length === 0) return
    const pages = stagedPages
    setBatchProcessing(true)
    try {
      const summary = await processScanBatch(
        pages.map((p) => p.file),
        {
          // Sequential: each scan + apply awaits before the next page (see
          // processScanBatch). No Promise.all — that's the write-race fix.
          scanOne: (file) => scan(file, familyId, activeChildId),
          syncOne: (results) => syncScanToConfig(activeChildId, results),
          onWorksheet: (results) => feedSkillMap(results),
        },
      )
      setScanSnack(summary.message)
    } catch (err) {
      console.error('[CurriculumTab] Multi-page scan failed', err)
      setScanSnack('Scan failed — please try again')
    } finally {
      pages.forEach((p) => URL.revokeObjectURL(p.url))
      setStagedPages([])
      setBatchProcessing(false)
      // Discard the last single-page record left in useScan state.
      clearScan()
    }
  }, [familyId, activeChildId, stagedPages, scan, syncScanToConfig, feedSkillMap, clearScan])

  /**
   * Apply a scan result to a specific card. Worksheet results write directly
   * to the card's config; certificate results open a confirm dialog.
   */
  const applyScanToCard = useCallback(
    async (results: ScanResult, config: ActivityConfig) => {
      if (!familyId || !activeChildId) return
      if (isCertificateScan(results)) {
        try {
          await buildCertPreview(familyId, activeChildId, results, { targetConfigId: config.id })
          setCertConfirm({ result: results, config })
        } catch (err) {
          console.error('[CurriculumTab] Failed to build certificate preview', err)
          setScanSnack('Failed to read certificate')
        }
        return
      }
      try {
        const r = await syncScanToConfig(activeChildId, results, { targetConfigId: config.id })
        if (r.action === 'updated' && r.position) {
          setScanSnack(`Updated ${r.configName} to lesson ${r.position}`)
        } else if (r.action === 'updated') {
          setScanSnack(`Updated ${r.configName}`)
        }
      } catch (err) {
        console.error('[CurriculumTab] Failed to sync config:', err)
      }
      await feedSkillMap(results)
    },
    [familyId, activeChildId, buildCertPreview, syncScanToConfig, feedSkillMap],
  )

  const handleCardCapture = useCallback(
    async (config: ActivityConfig, file: File) => {
      if (!familyId || !activeChildId) return
      setScanningConfigId(config.id)
      try {
        const record = await scan(file, familyId, activeChildId)
        if (!record?.results) return

        const results = record.results
        const cardName = config.curriculum || config.name
        const detectedName = isCertificateScan(results)
          ? results.curriculumName
          : results.curriculumDetected?.name || results.subject

        if (detectedName && cardName && !isWorkbookMatch(cardName, detectedName)) {
          setMismatchPrompt({ result: results, config, detectedName })
          return
        }

        await applyScanToCard(results, config)
      } finally {
        setScanningConfigId(null)
      }
    },
    [familyId, activeChildId, scan, applyScanToCard],
  )

  const handleConfirmCertificate = useCallback(async () => {
    if (!familyId || !activeChildId || !certConfirm) return
    try {
      await applyCertUpdate(familyId, activeChildId, certConfirm.result, {
        targetConfigId: certConfirm.config.id,
      })
      setScanSnack(`Updated ${certConfirm.config.name}`)
    } catch (err) {
      console.error('[CurriculumTab] Failed to apply certificate update', err)
    } finally {
      setCertConfirm(null)
      clearCertState()
    }
  }, [familyId, activeChildId, certConfirm, applyCertUpdate, clearCertState])

  const handleCancelCertificate = useCallback(() => {
    setCertConfirm(null)
    clearCertState()
  }, [clearCertState])

  const handleAcceptMismatch = useCallback(async () => {
    if (!mismatchPrompt) return
    const { result, config } = mismatchPrompt
    setMismatchPrompt(null)
    await applyScanToCard(result, config)
  }, [mismatchPrompt, applyScanToCard])

  const handleCancelMismatch = useCallback(() => {
    setMismatchPrompt(null)
  }, [])

  const loading = isLoadingChildren || configsLoading

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <LoadingState fullHeight label="Loading curriculum..." />
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
            <EmptyState
              title="No scans this week yet"
              description="Capture work on the Today page to see AI analysis here."
            />
          ) : (
            <Stack spacing={0.5}>
              {weeklyScans.map((scanRec) => (
                <ScanAnalysisPanel key={scanRec.id} scan={scanRec} />
              ))}
            </Stack>
          )}
        </SectionCard>

        {/* Active Workbooks */}
        <SectionCard title={CURRICULUM_SECTION_TITLE[CurriculumSection.Workbooks]}>
          {workbooks.length === 0 ? (
            <EmptyState
              title="No workbooks configured"
              description="Scan a page or add one manually."
            />
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
                    onReassign={() => setReassign(config)}
                    onScanCapture={(file) => void handleCardCapture(config, file)}
                    scanning={scanning && scanningConfigId === config.id}
                  />
                )
              })}
            </Stack>
          )}
        </SectionCard>

        {/* Routine Activities */}
        <SectionCard
          title={CURRICULUM_SECTION_TITLE[CurriculumSection.Routines]}
          action={
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditRoutinesOpen(true)}>
              Edit routines
            </Button>
          }
        >
          {routines.length === 0 ? (
            <EmptyState title="No routine activities configured." />
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

        {/*
          Apps & Other Activities (UX-204) — the section that did not exist.

          `activity` and `app` configs plan every school day and count toward the
          day budget, and until now they appeared on no screen: no row, no menu,
          no way to delete one. Rendered with the SAME `ListItem` + `openMenu`
          shape as Routine Activities, so the existing ⋮ menu (mark complete /
          quick-log toggle / delete permanently) comes with it rather than
          growing a second, weaker one. Nothing is auto-retyped or auto-removed:
          the rows are the owner's data, and the fix is that they are now visible.
        */}
        {other.length > 0 && (
          <SectionCard title={CURRICULUM_SECTION_TITLE[CurriculumSection.Other]}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {OTHER_ACTIVITIES_DESCRIPTION}
            </Typography>
            <List dense disablePadding>
              {other.map((config) => (
                <ListItem
                  key={config.id}
                  secondaryAction={
                    <IconButton size="small" onClick={(e) => openMenu(e, config)}>
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
          </SectionCard>
        )}

        {/* Evaluations (auto-managed) */}
        {evaluations.length > 0 && (
          <SectionCard title={CURRICULUM_SECTION_TITLE[CurriculumSection.Evaluations]}>
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

        {/* Scan to Add New Workbook — multi-page staging + sequential apply */}
        <Card sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add to Curriculum
          </Typography>
          {batchProcessing ? (
            <Box sx={{ mt: 1 }}>
              <LoadingState
                label={`Scanning ${stagedPages.length} page${stagedPages.length === 1 ? '' : 's'}…`}
              />
            </Box>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary">
                Scan one or more workbook pages. Pages from the same workbook merge into one
                card; different workbooks each get their own.
              </Typography>
              <ScanButton multiple onCaptureFiles={handleStagePages} variant="button" />

              {stagedPages.length > 0 && (
                <>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                    {stagedPages.map((p, i) => (
                      <Box key={p.url} sx={{ position: 'relative' }}>
                        <Box
                          component="img"
                          src={p.url}
                          alt={`Page ${i + 1}`}
                          sx={{
                            width: 84,
                            height: 84,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                        <IconButton
                          size="small"
                          aria-label={`Remove page ${i + 1}`}
                          onClick={() => removeStagedPage(i)}
                          sx={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            '&:hover': { bgcolor: 'background.paper' },
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                  <Button variant="contained" onClick={() => void handleScanPages()}>
                    Scan {stagedPages.length} page{stagedPages.length === 1 ? '' : 's'}
                  </Button>
                </>
              )}

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
        {/* FEAT-199: the quick-log row is the family's, and this is where a
            season's activity — packing, independent play — joins or leaves it. */}
        <MenuItem
          onClick={() => {
            if (menuConfig) void handleToggleQuickLog(menuConfig)
            closeMenu()
          }}
        >
          <StarOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          {menuConfig?.quickLog === true
            ? "Remove from the kids' quick log"
            : "Show on the kids' quick log"}
        </MenuItem>
        {menuConfig?.type === 'workbook' && (
          <MenuItem
            onClick={() => {
              if (menuConfig) setReassign(menuConfig)
              closeMenu()
            }}
          >
            <PersonIcon fontSize="small" sx={{ mr: 1 }} />
            Assign to a child
          </MenuItem>
        )}
        {/* UX-48: the label names what the tap does, and the tap opens a
            dialog rather than deleting the document where it stands. */}
        <MenuItem
          onClick={() => {
            if (menuConfig) setConfirmDelete(menuConfig)
            closeMenu()
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          {DELETE_ACTIVITY_MENU_LABEL}
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

      {/* Confirm Delete dialog (UX-48) — the same shape and weight as the
          "Mark as complete" dialog above it, which is the point: the
          reversible act had a full confirm and the irreversible one had none.
          Copy is pure and tested in `removeActivityCopy`. */}
      <Dialog
        open={confirmDelete !== null}
        onClose={() => {
          if (!deleting) setConfirmDelete(null)
        }}
        maxWidth="xs"
        fullWidth
      >
        {confirmDelete &&
          (() => {
            const prompt = buildDeleteActivityPrompt(confirmDelete)
            return (
              <>
                <DialogTitle>{prompt.title}</DialogTitle>
                <DialogContent>
                  <DialogContentText>{prompt.whatGoes}</DialogContentText>
                  <DialogContentText sx={{ mt: 1.5 }}>{prompt.whatStays}</DialogContentText>
                  {prompt.gentlerPath && (
                    <DialogContentText sx={{ mt: 1.5 }}>{prompt.gentlerPath}</DialogContentText>
                  )}
                </DialogContent>
                <DialogActions>
                  <Button disabled={deleting} onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    disabled={deleting}
                    onClick={() => {
                      void handleDelete(confirmDelete)
                    }}
                  >
                    {prompt.confirmLabel}
                  </Button>
                </DialogActions>
              </>
            )
          })()}
      </Dialog>

      {/* Reassign workbook owner dialog (DATA-08) */}
      <Dialog open={reassign !== null} onClose={() => setReassign(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign to a child</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            Workbooks belong to one child. Who owns &ldquo;{reassign?.name}&rdquo;?
          </DialogContentText>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {childList.map((c) => (
              <Button
                key={c.id}
                variant={reassign?.childId === c.id ? 'contained' : 'outlined'}
                onClick={() => {
                  if (reassign) void handleReassign(reassign, c.id)
                }}
              >
                {c.name}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassign(null)}>Cancel</Button>
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

      {/* Per-card certificate confirm dialog */}
      <Dialog
        open={certConfirm !== null}
        onClose={handleCancelCertificate}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Progress Update</DialogTitle>
        <DialogContent>
          {certPreview && certConfirm && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>Card:</strong> {certConfirm.config.name}
              </Typography>
              <Typography variant="body2">
                <strong>Milestone:</strong> {certPreview.updates.lastMilestone}
              </Typography>
              {certPreview.updates.level && (
                <Typography variant="body2">
                  <strong>Level:</strong> {certPreview.updates.level}
                </Typography>
              )}
              {certPreview.updates.currentPosition !== null && (
                <Typography variant="body2">
                  <strong>Position:</strong>{' '}
                  {certPreview.existingConfig
                    ? `${certPreview.existingConfig.currentPosition} → ${certPreview.updates.currentPosition}`
                    : certPreview.updates.currentPosition}
                </Typography>
              )}
              {certPreview.updates.masteredSkills.length > 0 && (
                <Typography variant="body2">
                  <strong>Skills to mark mastered:</strong>{' '}
                  {certPreview.updates.masteredSkills.join(', ')}
                </Typography>
              )}
              {certError && <ErrorState message={certError} />}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelCertificate} disabled={certApplying}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => void handleConfirmCertificate()}
            disabled={certApplying}
            startIcon={certApplying ? <CircularProgress size={16} /> : undefined}
          >
            {certApplying ? 'Updating...' : 'Confirm Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Curriculum mismatch warning */}
      <Dialog
        open={mismatchPrompt !== null}
        onClose={handleCancelMismatch}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Curriculum mismatch?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This looks like <strong>{mismatchPrompt?.detectedName}</strong>, not{' '}
            <strong>{mismatchPrompt?.config.name}</strong>. Update anyway?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelMismatch}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleAcceptMismatch()}
          >
            Update anyway
          </Button>
        </DialogActions>
      </Dialog>

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
  onReassign: () => void
  onScanCapture: (file: File) => void
  scanning: boolean
}

function WorkbookCard({ config, recentScans, onOpenMenu, onReassign, onScanCapture, scanning }: WorkbookCardProps) {
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

      {/* DATA-08 reconciliation: a workbook tagged 'both' bleeds across kids. */}
      {config.childId === 'both' && (
        <Alert
          severity="warning"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={onReassign}>
              Assign
            </Button>
          }
        >
          This workbook is shared with every child. Assign it to its real owner.
        </Alert>
      )}

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
