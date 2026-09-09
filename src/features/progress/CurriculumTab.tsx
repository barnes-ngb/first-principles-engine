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
import { ScanDoor } from '../../core/hooks/scanFailureNote'
import { isWorkbookMatch, useScanToActivityConfig } from '../../core/hooks/useScanToActivityConfig'
import type { ActivityConfig, CertificateScanResult, ScanRecord, ScanResult } from '../../core/types'
import { isCertificateScan, isWorksheetScan } from '../../core/types/planning'
import { ActivityFrequencyLabel } from '../../core/types/enums'
import { activityNames } from '../../core/utils/activityNames'
import { nameKey } from '../../core/utils/nameKey'
import AddActivityDialog from './AddActivityDialog'
import RenameActivityDialog from './RenameActivityDialog'
import { ALIAS_SECTION_LABEL } from './renameActivity'
import SetPositionDialog from './SetPositionDialog'
import { positionFailureNotice, positionSavedNotice } from './manualPosition'
import EditRoutinesDialog from './EditRoutinesDialog'
import {
  CURRICULUM_SECTION_TITLE,
  CurriculumSection,
  groupCurriculumConfigs,
  OTHER_ACTIVITIES_DESCRIPTION,
  STRANDS_DESCRIPTION,
} from './curriculumGrouping'
import { mostRecentTopic, strandRowSummary } from './strand'
import StrandSessionDialog from './StrandSessionDialog'
import type { StrandSessionEvidence } from './strandSession'
import {
  logStrandSession,
  STRAND_SESSION_FAILED_CLEAN,
  StrandSessionFailure,
  StrandSessionRefused,
} from '../../core/firebase/strandSessionWrites'
import { failedPageIndexes, processScanBatch } from './multiPageScan'
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
    isChildProfile,
  } = useActiveChild()
  const {
    configs,
    loading: configsLoading,
    addConfig,
    updateConfig,
    deleteConfig,
    markComplete,
    updatePosition,
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

  // ── Strand session capture (UX-283) ──────────────────────────────────────
  // The row's own door onto recording a session. Parent-gated on capability at
  // the control AND again at the write, because this tab renders for a kid
  // profile today and a session moves a curriculum row's count.
  const [sessionTarget, setSessionTarget] = useState<ActivityConfig | null>(null)
  const [sessionSaving, setSessionSaving] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const handleLogSession = useCallback(
    async (topic: string, evidence: StrandSessionEvidence) => {
      if (!familyId || !activeChildId || !sessionTarget) return
      if (isChildProfile) return
      setSessionSaving(true)
      setSessionError(null)
      try {
        await logStrandSession({
          familyId,
          config: sessionTarget,
          childId: activeChildId,
          topic,
          evidence,
        })
        setSessionTarget(null)
      } catch (err) {
        // The refusal sentences are the writer's, so the parent reads one
        // wording of the rule. Anything else says what did NOT happen rather
        // than implying the session was recorded (the `deleteFailureNotice`
        // doctrine): the dialog stays open with her capture intact.
        setSessionError(
          // Both of ours carry the parent-facing sentence already: a refusal
          // states the rule, and a failure states which of the two truths
          // applies — cleaned up, or evidence left behind that a blind retry
          // would duplicate (Codex round 1).
          // One base for every failure that carries its own sentence (Codex
          // round 2), rather than a growing `instanceof` list here: a refusal
          // states the rule; a failure states which truth applies — cleaned up,
          // evidence left behind that a blind retry would duplicate, or the
          // strand removed while the dialog was open.
          err instanceof StrandSessionRefused || err instanceof StrandSessionFailure
            ? err.message
            : STRAND_SESSION_FAILED_CLEAN,
        )
      } finally {
        setSessionSaving(false)
      }
    },
    [familyId, activeChildId, sessionTarget, isChildProfile],
  )

  // Group configs by type — a PARTITION, not a set of filters (UX-204). Four
  // independent filters over a six-member enum left `activity` and `app` configs
  // rendered nowhere while they went on planning every day; `groupCurriculumConfigs`
  // places every type by a `Record<ActivityType, …>` a new member cannot escape.
  const { workbooks, routines, other, evaluations, strands, completed } = useMemo(
    () => groupCurriculumConfigs(configs),
    [configs],
  )

  // Match scans to workbooks
  const scansForWorkbook = useCallback(
    (config: ActivityConfig): ScanRecord[] => {
      // UX-205: the one shared name-comparison rule, not a fourth copy of it.
      const norm = nameKey
      // UX-280: every name this row answers to, plus the publisher slot. A card
      // whose name she shortened would otherwise show none of its own scans —
      // they were detected under the cover's title, which is now an alternate.
      const configKeys = [...activityNames(config), config.curriculum ?? '']
        .map(norm)
        .filter(Boolean)
      return recentScans.filter((s) => {
        if (!s.results || s.results.pageType === 'certificate') return false
        const scanSubject = norm(s.results.subject)
        const detected = s.results.curriculumDetected
        const scanCurr = norm(detected?.name)
        return configKeys.some((key) => scanSubject.includes(key) || scanCurr.includes(key))
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

  /** UX-279: rename dialog. Parent-only, on capability — see `handleRename`. */
  const [renaming, setRenaming] = useState<ActivityConfig | null>(null)

  /** UX-314: set-a-position-by-hand dialog. Parent-only, on capability. */
  const [settingPosition, setSettingPosition] = useState<ActivityConfig | null>(null)
  const [savingPosition, setSavingPosition] = useState(false)

  // Edit routines dialog
  const [editRoutinesOpen, setEditRoutinesOpen] = useState(false)

  // Add activity dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Scan state
  // `scanning` is deliberately not read: a card's spinner follows
  // `scanningConfigId`, which spans a whole multi-page capture, while this flag
  // drops between the pages of one (UX-312).
  const { scan, lastError: lastScanError, clearScan } = useScan(ScanDoor.Curriculum)
  const { syncScanToConfig } = useScanToActivityConfig()
  const {
    buildPreview: buildCertPreview,
    applyUpdate: applyCertUpdate,
    preview: certPreview,
    applying: certApplying,
    error: certError,
    clearState: clearCertState,
  } = useCertificateProgress()
  /**
   * The scan notice. `failed` keeps a failure on screen until it's dismissed —
   * a reason that auto-hides in three seconds is the "sometimes just
   * disappears" half of the owner's report (UX-275).
   */
  const [scanSnack, setScanSnack] = useState<{ message: string; failed: boolean } | null>(
    null,
  )
  /** Staged pages left over from the last batch because they failed (UX-275). */
  const [failedPageCount, setFailedPageCount] = useState(0)
  /** Which card is currently scanning (null = "Add to Curriculum" generic scan). */
  const [scanningConfigId, setScanningConfigId] = useState<string | null>(null)
  /**
   * Pending certificate result awaiting confirmation, scoped to a specific card
   * — and, since UX-321, to the CHILD it was scanned for.
   *
   * `handleConfirmCertificate` used to pair the card captured when the scan ran
   * with whatever `activeChildId` was when the parent tapped Confirm. Those are
   * the same value almost always and different exactly when it matters: switch
   * the child selector while a scan is in flight and the write updated the old
   * child's card while `useCertificateProgress` wrote the certificate's
   * mastered skills into the NEW child's snapshot (Codex round 2, P1).
   *
   * Carrying the child here binds the whole confirmation to one child, so the
   * dialog can only ever write where its own scan came from — the single-page
   * path included, where the same hazard existed with a narrower window.
   */
  const [certConfirm, setCertConfirm] = useState<{
    result: CertificateScanResult
    config: ActivityConfig
    childId: string
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

  /**
   * Write a rename (UX-279).
   *
   * Writes `name` and the alternates, and **nothing else** — no day log, no
   * applied week, no artifact title, no recorded minute. A logged label is
   * evidence of the day it was logged on; renaming the program does not change
   * what happened.
   *
   * Parent-gated at the write as well as at the menu. The tab renders for a kid
   * profile today, so a control that only hid itself would be a control a kid
   * could still reach through a stale dialog — the same two-layer rule the
   * planner's curriculum follow-up uses (UX-232).
   */
  const handleRename = async (configId: string, name: string, aliases: string[]) => {
    if (isChildProfile) return
    const config = configs.find((c) => c.id === configId)
    if (!config || config.completed) return
    // Deliberately UNCAUGHT: the dialog awaits this and keeps itself open on a
    // rejection, so swallowing the error here would close it over a write that
    // never landed (Codex round 1, P2).
    await updateConfig(configId, { name, aliases })
    setSnack(`Renamed to "${name}"`)
  }

  /**
   * Write a hand-typed position (UX-314).
   *
   * Parent-gated at the WRITE as well as at the menu, the rule this tab has
   * used since the rename door: it renders for a kid profile today, and a
   * capability check that lives only in the UI is not a check.
   *
   * Goes through `updatePosition` — the shared writer the Ask AI confirm card
   * uses — so a position set here and one set from a chat fold into the learner
   * model identically, rather than this door inventing a second lane.
   */
  const handleSetPosition = async (position: number) => {
    const config = settingPosition
    if (!config || isChildProfile || config.completed) return
    setSavingPosition(true)
    try {
      await updatePosition(config.id, position)
      setSnack(positionSavedNotice(config, position))
      setSettingPosition(null)
    } catch (err) {
      console.error('[CurriculumTab] Failed to set position by hand', err)
      // The row is UNCHANGED and the dialog stays open — the failure to avoid
      // is a parent believing a correction was recorded when it was not.
      setSnack(positionFailureNotice(config))
    } finally {
      setSavingPosition(false)
    }
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
  /**
   * The child these photos were picked for. Staged pages now OUTLIVE a failed
   * batch (UX-275), so without this a parent could switch the child selector and
   * hit "Retry failed pages" and the scan records, `activityConfigs` position
   * and skill-map writes would all land on the OTHER child — pages of Lincoln's
   * math book written into London's curriculum (Codex round 1, P1). A record
   * written to the wrong child is the one failure this tab must not have, so the
   * batch is bound to its child at staging time and dropped on a switch: the
   * photos are two taps to re-pick, a wrong record is not.
   */
  const [stagedChildId, setStagedChildId] = useState<string | null>(null)
  /**
   * The active child as it is NOW, readable from inside an in-flight batch. A
   * running `handleScanPages` holds the child it started with in its closure —
   * correct for its own writes — but its `finally` restores the failed pages
   * long after a switch may have happened, and the switch effect cannot see a
   * batch that has not finished (Codex round 2, P1).
   */
  const activeChildIdRef = useRef(activeChildId)
  useEffect(() => {
    activeChildIdRef.current = activeChildId
  }, [activeChildId])
  /**
   * Set when the switch effect drops a batch. A flag rather than an endpoint
   * comparison, because switching away and back again during a scan also leaves
   * the staged pages cleared and their object URLs revoked.
   */
  const batchInvalidatedRef = useRef(false)

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

  // A staged batch belongs to the child it was picked for. Switching the child
  // selector drops it rather than carrying it across — see `stagedChildId`.
  useEffect(() => {
    if (!stagedChildId || stagedChildId === activeChildId) return
    batchInvalidatedRef.current = true
    stagedPages.forEach((p) => URL.revokeObjectURL(p.url))
    if (stagedPages.length > 0) {
      setScanSnack({
        message: 'Staged pages cleared — they were picked for another child.',
        failed: false,
      })
    }
    setStagedPages([])
    setFailedPageCount(0)
    setStagedChildId(null)
  }, [activeChildId, stagedChildId, stagedPages])

  const handleStagePages = useCallback(
    (files: File[]) => {
      if (!activeChildId) return
      setFailedPageCount(0)
      setStagedChildId(activeChildId)
      setStagedPages((prev) => [
        ...prev,
        ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ])
    },
    [activeChildId],
  )

  const removeStagedPage = useCallback((index: number) => {
    setFailedPageCount(0)
    setStagedPages((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.url)
      return next
    })
  }, [])

  const handleScanPages = useCallback(async () => {
    if (!familyId || !activeChildId || stagedPages.length === 0) return
    // The guard at the write, not only in the effect above: a batch is scanned
    // for the child it was picked for or it is not scanned at all. Nothing here
    // may write a scan record, a workbook position or a skill map to a child
    // whose name was not on the screen when the photos were taken.
    if (stagedChildId && stagedChildId !== activeChildId) return
    const pages = stagedPages
    batchInvalidatedRef.current = false
    setBatchProcessing(true)
    setFailedPageCount(0)
    // UX-275: which pages to KEEP staged. `null` means "we don't know" — keep
    // every one of them, because re-picking six photos is the recovery problem
    // the owner asked us to fix.
    let keep: Set<number> | null = null
    try {
      const summary = await processScanBatch(
        pages.map((p) => p.file),
        {
          // Sequential: each scan + apply awaits before the next page (see
          // processScanBatch). No Promise.all — that's the write-race fix.
          //
          // UX-275: `scan` reports a failure by returning null and setting
          // React state the loop can't read, so re-throw the reason it kept for
          // us — otherwise every page's outcome reads a bare "Scan failed".
          //
          // UX-321: test `results`, not the record. A page whose ANALYSIS was
          // unusable comes back as a non-null record with `results: null`, and
          // testing the record alone let `processScanBatch` replace the
          // classified UX-311 reason with a generic "No analysis returned" —
          // the same defect UX-275 fixed, reintroduced by the second route a
          // scan can fail through.
          scanOne: async (file) => {
            const record = await scan(file, familyId, activeChildId)
            if (!record?.results) throw new Error(lastScanError() ?? 'Scan failed')
            return record
          },
          syncOne: (results) => syncScanToConfig(activeChildId, results),
          onWorksheet: (results) => feedSkillMap(results),
        },
      )
      setScanSnack({ message: summary.message, failed: summary.failedCount > 0 })
      keep = new Set(failedPageIndexes(summary))
      setFailedPageCount(keep.size)
    } catch (err) {
      console.error('[CurriculumTab] Multi-page scan failed', err)
      const msg = err instanceof Error ? err.message : String(err)
      setScanSnack({ message: `Scan failed — ${msg}`, failed: true })
      setFailedPageCount(pages.length)
    } finally {
      if (batchInvalidatedRef.current || activeChildIdRef.current !== activeChildId) {
        // The child changed WHILE this batch was running. Restoring the failed
        // pages now would hand them to the new child with no owner recorded —
        // the switch effect has already run and cleared `stagedChildId`, so the
        // retry guard would wave them through. Discard the completion instead:
        // nothing written this run is affected (every write used the child this
        // batch started with, from the closure), and re-picking is two taps.
        pages.forEach((p) => URL.revokeObjectURL(p.url))
        setStagedPages([])
        setStagedChildId(null)
        setFailedPageCount(0)
      } else {
        const kept = (i: number) => keep === null || keep.has(i)
        pages.forEach((p, i) => {
          if (!kept(i)) URL.revokeObjectURL(p.url)
        })
        const remaining = pages.filter((_, i) => kept(i))
        setStagedPages(remaining)
        // Re-stamp the owner: the batch outlived it only if pages did.
        setStagedChildId(remaining.length > 0 ? activeChildId : null)
      }
      setBatchProcessing(false)
      // Discard the last single-page record left in useScan state.
      clearScan()
    }
  }, [
    familyId,
    activeChildId,
    stagedChildId,
    stagedPages,
    scan,
    lastScanError,
    syncScanToConfig,
    feedSkillMap,
    clearScan,
  ])

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
          // Stamp the child the preview was built for, so Confirm cannot pair
          // this card with a different child later (UX-321).
          setCertConfirm({ result: results, config, childId: activeChildId })
        } catch (err) {
          console.error('[CurriculumTab] Failed to build certificate preview', err)
          setScanSnack({ message: 'Failed to read certificate', failed: true })
        }
        return
      }
      try {
        const r = await syncScanToConfig(activeChildId, results, { targetConfigId: config.id })
        if (r.action === 'updated' && r.position) {
          setScanSnack({
            message: `Updated ${r.configName} to lesson ${r.position}`,
            failed: false,
          })
        } else if (r.action === 'updated') {
          setScanSnack({ message: `Updated ${r.configName}`, failed: false })
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
        if (!record?.results) {
          // UX-275: a failure on a card's own camera used to render nothing at
          // all — spinner, then the page as it was. Say what happened.
          setScanSnack({
            message: lastScanError() ?? 'Scan failed — no analysis came back.',
            failed: true,
          })
          return
        }

        const results = record.results
        // UX-280 (Codex round 1, P2): every name this row answers to, not one.
        // The untargeted lookup gained the alias ladder and this guard did not,
        // so scanning the OLD cover from a renamed card raised a false
        // "that doesn't look like this workbook" prompt — on the exact path the
        // alternates exist to keep working.
        const cardNames = [config.curriculum ?? '', ...activityNames(config)].filter(Boolean)
        const detectedName = isCertificateScan(results)
          ? results.curriculumName
          : results.curriculumDetected?.name || results.subject

        if (
          detectedName &&
          cardNames.length > 0 &&
          !cardNames.some((cardName) => isWorkbookMatch(cardName, detectedName))
        ) {
          setMismatchPrompt({ result: results, config, detectedName })
          return
        }

        await applyScanToCard(results, config)
      } finally {
        setScanningConfigId(null)
      }
    },
    [familyId, activeChildId, scan, lastScanError, applyScanToCard],
  )

  /**
   * Several pages onto ONE card (UX-312).
   *
   * The owner's report: *"the card only allows me to do one image at a time — I
   * thought we had multiple image uploads for these curriculums."* He was right;
   * the app has had multi-capture since the staging batch below, and this door
   * declined it for no stated reason.
   *
   * A single file still takes the untouched single-page path, mismatch prompt
   * and all — `ScanButton` in multi mode routes the CAMERA here too, one shot at
   * a time, and that flow must not change. Two or more pages go through the SAME
   * `processScanBatch` the staging area uses (sequential, never `Promise.all`),
   * with every page targeted at this card.
   *
   * Order does not matter: `syncScanToConfig` only ever moves a position
   * FORWARD (`lessonNumber > current`), so photographing lessons 12, 10 and 14
   * in any order leaves the card at 14.
   */
  const handleCardCaptureFiles = useCallback(
    async (config: ActivityConfig, files: File[]) => {
      if (!familyId || !activeChildId || files.length === 0) return
      if (files.length === 1) {
        await handleCardCapture(config, files[0])
        return
      }
      setScanningConfigId(config.id)
      try {
        const cardNames = [config.curriculum ?? '', ...activityNames(config)].filter(Boolean)
        /**
         * Does a scanned page name THIS card? One definition for both branches
         * (Codex round 2, P1): the worksheet guard lived in `syncOne` only, so
         * the certificate branch claimed any certificate at all — and
         * `applyUpdate` deliberately writes to its `targetConfigId` regardless
         * of the certificate's own name, so a Reading Eggs certificate in a
         * Math K batch would have written its milestone and skills onto Math K.
         */
        const matchesCard = (detectedName: string | undefined | null): boolean => {
          if (!detectedName || cardNames.length === 0) return true
          return cardNames.some((cardName) => isWorkbookMatch(cardName, detectedName))
        }
        // UX-321: a certificate keeps its confirm card here, exactly as it does
        // for a single-page capture. Claimed during the loop, acted on after it
        // — the dialog must not open while pages are still being scanned.
        const claimedCertificates: CertificateScanResult[] = []
        const summary = await processScanBatch(files, {
          scanOne: async (file) => {
            const record = await scan(file, familyId, activeChildId)
            // `results`, not the record: `useScan` reports an unusable analysis
            // by RETURNING a record with `results: null` and keeping the
            // classified reason in `lastError()`. Testing the record alone let
            // `processScanBatch` replace that reason with a generic "No
            // analysis returned" — losing the UX-311 diagnosis on exactly the
            // page that needed it (Codex round 1, P2).
            if (!record?.results) throw new Error(lastScanError() ?? 'Scan failed')
            return record
          },
          claimNonWorksheet: (results) => {
            if (!isCertificateScan(results)) return false
            // A certificate for a DIFFERENT book is not this card's to claim.
            // Left unclaimed it reports as "not recognized", which is the
            // honest answer for this door — and the safe one, since claiming it
            // would write another curriculum's milestone onto this card.
            if (!matchesCard(results.curriculumName)) return false
            claimedCertificates.push(results)
            return true
          },
          syncOne: async (results) => {
            // The card's own mismatch guard, per page. A batch cannot stop to
            // ask about each one, so a page that names a different workbook is
            // reported by name and NOT applied — the alternative is writing a
            // reading page's lesson number onto the math card silently.
            const detectedName = results.curriculumDetected?.name || results.subject
            if (!matchesCard(detectedName)) {
              throw new Error(`doesn't look like ${config.name}`)
            }
            return syncScanToConfig(activeChildId, results, { targetConfigId: config.id })
          },
          onWorksheet: (results) => feedSkillMap(results),
        })
        // More than one certificate in a batch has one dialog between them, so
        // say which is being confirmed rather than silently dropping the rest.
        const extraCerts =
          claimedCertificates.length > 1
            ? '; confirming the first — scan the others one at a time'
            : ''
        setScanSnack({
          message: `${summary.message}${extraCerts}`,
          failed: summary.failedCount > 0,
        })
        if (claimedCertificates[0] && activeChildIdRef.current === activeChildId) {
          // Opens the same confirm dialog a single-page certificate capture
          // does, targeted at this card.
          //
          // Guarded on the child (Codex round 2, P1): a batch spans several
          // scans, so the selector can move under it, and installing a
          // confirmation built for the previous child's card after the
          // component has re-rendered for the new one is how a certificate ends
          // up written across two children's records. The same `ref` the
          // staging batch uses — readable from inside an in-flight run, which
          // the state value is not.
          await applyScanToCard(claimedCertificates[0], config)
        }
      } catch (err) {
        console.error('[CurriculumTab] Multi-page card scan failed', err)
        const msg = err instanceof Error ? err.message : String(err)
        setScanSnack({ message: `Scan failed — ${msg}`, failed: true })
      } finally {
        setScanningConfigId(null)
        // Discard the last single-page record left in useScan state.
        clearScan()
      }
    },
    [
      familyId,
      activeChildId,
      handleCardCapture,
      // UX-321: the certificate branch calls it, so a stale closure here would
      // open a confirm card built against an earlier config or child.
      applyScanToCard,
      scan,
      lastScanError,
      syncScanToConfig,
      feedSkillMap,
      clearScan,
    ],
  )

  const handleConfirmCertificate = useCallback(async () => {
    if (!familyId || !certConfirm) return
    try {
      // The child this certificate was SCANNED for, never the one selected now
      // (UX-321). The card and the child must come from the same scan, or the
      // position lands on one child's record and the mastered skills on
      // another's.
      await applyCertUpdate(familyId, certConfirm.childId, certConfirm.result, {
        targetConfigId: certConfirm.config.id,
      })
      setScanSnack({ message: `Updated ${certConfirm.config.name}`, failed: false })
    } catch (err) {
      console.error('[CurriculumTab] Failed to apply certificate update', err)
    } finally {
      setCertConfirm(null)
      clearCertState()
    }
  }, [familyId, certConfirm, applyCertUpdate, clearCertState])

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
                    onScanCaptureFiles={(files) => void handleCardCaptureFiles(config, files)}
                    // UX-312: `scanningConfigId` spans the WHOLE capture —
                    // `scanning` drops between the pages of a batch, which
                    // would flicker the button back to "Add Page" mid-run.
                    scanning={scanningConfigId === config.id}
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
                    secondary={
                      <>
                        {`${config.defaultMinutes}m · ${ActivityFrequencyLabel[config.frequency] ?? config.frequency}`}
                        <ActivityAliases config={config} />
                      </>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
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
                    secondary={
                      <>
                        {`${config.defaultMinutes}m · ${ActivityFrequencyLabel[config.frequency] ?? config.frequency}`}
                        <ActivityAliases config={config} />
                      </>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              ))}
            </List>
          </SectionCard>
        )}

        {/*
          Strands (UX-281) — curriculum with no lessons, that still keeps count.

          Its own section, because its row is a different row: a count with no
          total and the topic it last covered. Rendered with the SAME `ListItem`
          + `openMenu` shape as Routine Activities, so rename / mark-complete /
          quick-log / delete come with it rather than growing a second, weaker
          menu — the UX-204 rule that a new section inherits the existing ⋮
          rather than reinventing part of it.

          There is no progress bar and no total, deliberately. A strand has no
          end, so a bar would either be empty forever or imply one.
        */}
        {strands.length > 0 && (
          <SectionCard title={CURRICULUM_SECTION_TITLE[CurriculumSection.Strands]}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {STRANDS_DESCRIPTION}
            </Typography>
            <List dense disablePadding>
              {strands.map((config) => {
                const topic = mostRecentTopic(config)
                return (
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
                      secondary={
                        <>
                          {strandRowSummary(
                            config,
                            ActivityFrequencyLabel[config.frequency] ?? config.frequency,
                          )}
                          {topic && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block' }}
                            >
                              {`Last topic: ${topic}`}
                            </Typography>
                          )}
                          <ActivityAliases config={config} />
                          {!isChildProfile && (
                            <Button
                              size="small"
                              sx={{ mt: 0.5, ml: -1 }}
                              onClick={() => {
                                setSessionError(null)
                                setSessionTarget(config)
                              }}
                            >
                              Record a session
                            </Button>
                          )}
                        </>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItem>
                )
              })}
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
                    secondary={
                      <>
                        {`${config.defaultMinutes}m · ${ActivityFrequencyLabel[config.frequency] ?? config.frequency}`}
                        <ActivityAliases config={config} />
                      </>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
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

              {/* UX-275: pages that failed stay staged, so retrying is one tap
                  instead of re-picking six photos from the gallery. */}
              {failedPageCount > 0 && stagedPages.length > 0 && (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => void handleScanPages()}
                    >
                      Retry failed pages
                    </Button>
                  }
                >
                  {failedPageCount} page{failedPageCount === 1 ? '' : 's'} didn&apos;t go
                  through — still here, nothing lost.
                </Alert>
              )}

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
        {/* UX-279: the publisher's name on the cover and what the family calls
            it are different strings, and until now the row had one slot for
            both. Parent-only on capability, never on a name. A finished program
            never reaches here — the Completed section has no menu. */}
        {!isChildProfile && (
          <MenuItem
            onClick={() => {
              if (menuConfig) setRenaming(menuConfig)
              closeMenu()
            }}
          >
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Rename
          </MenuItem>
        )}
        {/* UX-314: the by-hand route to a position. Offered on rows that HAVE
            a position (a workbook), never on a strand — a strand's count is an
            increment written only by a captured session (UX-283), and a
            typeable count would make it a number rather than a record.
            Parent-only on capability, as Rename is: this tab renders for a kid
            profile today. */}
        {!isChildProfile && menuConfig?.type === 'workbook' && (
          <MenuItem
            onClick={() => {
              if (menuConfig) setSettingPosition(menuConfig)
              closeMenu()
            }}
          >
            <LocationOnIcon fontSize="small" sx={{ mr: 1 }} />
            Set lesson
          </MenuItem>
        )}
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
      <RenameActivityDialog
        config={renaming}
        siblings={configs}
        onSave={handleRename}
        onClose={() => setRenaming(null)}
      />

      {/* UX-314: where we are, by hand — the route that has to work when the
          scanner does not. */}
      {settingPosition && (
        <SetPositionDialog
          // Keyed by the row: opening a different card mounts a fresh dialog
          // seeded from THAT row, with no effect re-seeding state.
          key={settingPosition.id}
          config={settingPosition}
          saving={savingPosition}
          onSave={handleSetPosition}
          onClose={() => setSettingPosition(null)}
        />
      )}

      {sessionTarget && (
        <StrandSessionDialog
          open
          config={sessionTarget}
          isChildProfile={isChildProfile}
          voiceProfile={{ id: activeChildId ?? '' }}
          saving={sessionSaving}
          error={sessionError}
          onClose={() => {
            setSessionTarget(null)
            setSessionError(null)
          }}
          onSave={(topic, evidence) => void handleLogSession(topic, evidence)}
        />
      )}

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
      {/* A failure stays until it is read; a success still gets out of the way. */}
      <Snackbar
        open={!!scanSnack}
        autoHideDuration={scanSnack?.failed ? null : 3000}
        onClose={(_e, reason) => {
          if (scanSnack?.failed && reason === 'clickaway') return
          setScanSnack(null)
        }}
      >
        <Alert
          severity={scanSnack?.failed ? 'error' : 'success'}
          variant="filled"
          onClose={() => setScanSnack(null)}
        >
          {scanSnack?.message ?? ''}
        </Alert>
      </Snackbar>
    </Container>
  )
}

// ── Workbook Card ──────────────────────────────────────────────

interface WorkbookCardProps {
  config: ActivityConfig
  recentScans: ScanRecord[]
  onOpenMenu: (e: React.MouseEvent<HTMLElement>, config: ActivityConfig) => void
  onReassign: () => void
  /**
   * Every page the parent picked (UX-312). The gallery can hand over several at
   * once; the camera still returns one shot per tap, so a one-file call is the
   * ordinary single-page capture and behaves exactly as it always has.
   */
  onScanCaptureFiles: (files: File[]) => void
  scanning: boolean
}

/**
 * The row's other names, small, beneath it (UX-280) — the owner's "tags of
 * alternate names beneath the curriculum".
 *
 * Quiet on purpose: these are a matching aid, not a second title. A row with
 * none renders nothing extra, which is every row that exists today.
 */
function ActivityAliases({ config }: { config: ActivityConfig }) {
  const aliases = activityNames(config).slice(1)
  if (aliases.length === 0) return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
      {ALIAS_SECTION_LABEL}: {aliases.join(' · ')}
    </Typography>
  )
}

function WorkbookCard({ config, recentScans, onOpenMenu, onReassign, onScanCaptureFiles, scanning }: WorkbookCardProps) {
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
          <ActivityAliases config={config} />
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
          <ScanButton
            multiple
            onCaptureFiles={onScanCaptureFiles}
            variant="button"
            loading={scanning}
          />
        </Box>
      )}
    </Card>
  )
}
