import { useCallback, useState } from 'react'
import { addDoc, doc, getDoc, updateDoc } from 'firebase/firestore'

import { artifactsCollection, skillSnapshotsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { useScan } from '../../core/hooks/useScan'
import { useScanToActivityConfig } from '../../core/hooks/useScanToActivityConfig'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import type { Artifact, ConceptualBlock, DayLog, ScanRecord, SkillSnapshot, WorksheetScanResult } from '../../core/types'
import { isWorksheetScan } from '../../core/types/planning'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import type { ScanConfigResult } from '../../core/hooks/useScanToActivityConfig'
import { autoCompleteBypassedItems } from './scanAdvance'
import { mergeBlock } from '../../core/utils/blockerLifecycle'
import { detectBlockersFromScan } from './scanBlocker'
import { downscaleImage } from '../../core/utils/downscaleImage'
import { withTimeout, UploadTimeoutError } from '../foundations-review/uploadTimeout'
import { findWorkbookConfigId } from '../../core/utils/workbookMatching'
import type { WorkbookConfigLike } from '../../core/utils/workbookMatching'

/** Hard ceiling on the workbook-scan analysis so the spinner never hangs (FEAT-62, mirrors FEAT-61). */
const WORKBOOK_SCAN_TIMEOUT_MS = 120_000

export interface UseUnifiedCaptureOptions {
  familyId: string
  childId: string
  childName: string
  today: string
  dayLog: DayLog | null
  persistDayLogImmediate: (updated: DayLog) => void
  /** Callback when a snack/toast message should be shown. */
  onMessage?: (msg: { text: string; severity: 'success' | 'error' }) => void
  /** Callback when a new artifact is created (for updating local artifact lists). */
  onArtifactCreated?: (artifact: Artifact) => void
  /**
   * FEAT-62 (legacy-item fallback): the child's scannable workbook configs, used
   * to resolve a `workbookConfigId` for legacy/unstamped items via the same
   * name/subject fuzzy match as lock-in. When a photo capture or backfill resolves
   * a config this way, the id is stamped onto the item so the resolution is
   * permanent — exactly what lock-in would have done. Absent → no fallback.
   */
  configs?: WorkbookConfigLike[]
}

export interface UseUnifiedCaptureResult {
  /** Run the unified capture pipeline for a checklist item. */
  handleUnifiedCapture: (file: File, index: number) => Promise<void>
  /**
   * FEAT-62 backfill: re-analyze a workbook-linked item's already-captured photo
   * and register it as a curriculum scan (no new artifact). One-tap recovery for
   * photos stranded as plain artifacts.
   *
   * `photoUris` (FEAT-62 polish) lets the caller pass the exact photo(s) it can
   * *display* — resolved the same way the Today Artifacts section resolves them
   * (by `tags.planItem` / title over the day's artifacts), not just the item's
   * single `evidenceArtifactId`. Pass one URI for a single page, several for
   * "analyze all". When omitted, falls back to the item's linked evidence
   * artifact (the original path).
   */
  handleBackfillWorkbookScan: (index: number, photoUris?: string[]) => Promise<void>
  /** Index of the checklist item currently being captured/scanned. */
  scanItemIndex: number | null
  setScanItemIndex: (index: number | null) => void
  /** Current scan result (for parent view's ScanAnalysisPanel). */
  scanResult: ScanRecord | null
  /** True while scan is in progress. */
  scanLoading: boolean
  /** Error from most recent scan attempt. */
  scanError: string | null
  /** Clear the current scan state. */
  clearScan: () => void
  /** Record action (added/skipped) on a scan result. */
  recordScanAction: (familyId: string, scanRecord: ScanRecord, action: 'added' | 'skipped') => Promise<void>
  /** Sync scan result to activity config (for pre-completion scans). */
  syncScanToConfig: (childId: string, result: WorksheetScanResult) => Promise<ScanConfigResult>
  /** Run a scan without the full capture pipeline (for pre-completion "should I skip?" advice). */
  runScan: (file: File, familyId: string, childId: string) => Promise<ScanRecord | null>
}

/**
 * Shared hook for unified photo capture. Routes photos through AI scan pipeline,
 * then to scans collection (curriculum) or artifacts collection (non-curriculum).
 *
 * Used by both parent TodayPage and kid KidTodayView.
 */
export function useUnifiedCapture({
  familyId,
  childId,
  childName,
  today,
  dayLog,
  persistDayLogImmediate,
  onMessage,
  onArtifactCreated,
  configs = [],
}: UseUnifiedCaptureOptions): UseUnifiedCaptureResult {
  const { scan: runScan, recordAction: recordScanAction, scanResult, scanning: scanLoading, error: scanError, clearScan } = useScan()
  const { syncScanToConfig } = useScanToActivityConfig()
  const [scanItemIndex, setScanItemIndex] = useState<number | null>(null)

  /**
   * FEAT-62: analyze a workbook page against a KNOWN config and advance its
   * position — the deterministic route. Writes a `scans` doc (via runScan) and
   * pins the position update with `targetConfigId` (no fuzzy match, no
   * classification gate). Best-effort and timeout-guarded: never throws, returns
   * the registration (name + lesson) on success or null on any failure so the
   * caller's capture always succeeds. Mirrors the Progress per-card scan.
   */
  const analyzeWorkbookPage = useCallback(
    async (
      scanFile: File,
      configId: string,
    ): Promise<{ configName: string; position: number | null } | null> => {
      try {
        const shrunk = await downscaleImage(scanFile, 1600, 0.85)
        const scanImage =
          shrunk instanceof File
            ? shrunk
            : new File([shrunk], scanFile.name || 'scan.jpg', { type: 'image/jpeg' })
        const record = await withTimeout(
          () => runScan(scanImage, familyId, childId),
          WORKBOOK_SCAN_TIMEOUT_MS,
        )
        if (!record?.results || !isWorksheetScan(record.results)) return null
        const configResult = await syncScanToConfig(
          childId,
          record.results as WorksheetScanResult,
          { targetConfigId: configId },
        )
        // action 'none' = the target config vanished — nothing registered.
        if (configResult.action === 'none') return null
        return {
          configName: configResult.configName ?? 'workbook',
          position: configResult.position ?? null,
        }
      } catch (err) {
        if (err instanceof UploadTimeoutError) {
          console.warn('[UnifiedCapture] Workbook scan timed out (non-blocking):', err)
        } else {
          console.warn('[UnifiedCapture] Workbook scan analysis failed (non-blocking):', err)
        }
        return null
      } finally {
        // Never surface the interactive add-to-plan panel for the routed capture;
        // the quiet "registered to…" line stands in for it.
        clearScan()
      }
    },
    [runScan, syncScanToConfig, familyId, childId, clearScan],
  )

  const handleUnifiedCapture = useCallback(
    async (file: File, index: number) => {
      if (!dayLog?.checklist) return
      const item = dayLog.checklist[index]
      setScanItemIndex(index)

      // ── FEAT-62: workbook-linked items take the deterministic route ──
      // The photo becomes an artifact (evidence, as today) AND registers as a
      // scan against the stamped workbook. Capture succeeds even if analysis
      // fails; a plain artifact remains. Non-workbook items fall through to the
      // unchanged classification-based path below.
      //
      // Legacy-item fallback: an unstamped item (planned before lock-in) resolves
      // its config via the same name/subject fuzzy match. When it resolves, we
      // stamp `workbookConfigId` onto the item below so the resolution is
      // permanent — exactly what lock-in would have done.
      const resolvedConfigId = item.workbookConfigId ?? findWorkbookConfigId(item, configs)
      const stampConfigId = !item.workbookConfigId && resolvedConfigId ? { workbookConfigId: resolvedConfigId } : {}
      if (resolvedConfigId) {
        try {
          // Analysis first (best-effort, timeout-guarded) so its lesson/name can
          // stamp the visibility line in the same single checklist write.
          const registration = await analyzeWorkbookPage(file, resolvedConfigId)

          // Artifact (evidence) — always, mirrors the plain artifacts path.
          const artifact = {
            childId,
            title: `${item.label.replace(/\s*\(\d+m\)/, '')} — ${childName}'s work`,
            type: EvidenceType.Photo,
            dayLogId: today,
            createdAt: new Date().toISOString(),
            tags: {
              engineStage: EngineStage.Build,
              domain: '',
              subjectBucket: item.subjectBucket ?? SubjectBucket.Other,
              location: 'Home',
              planItem: item.label,
            },
          }
          const docRef = await addDoc(artifactsCollection(familyId), artifact)
          const ext = file.name.split('.').pop() ?? 'jpg'
          const filename = generateFilename(ext)
          const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
          await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

          const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
            i === index
              ? {
                  ...ci,
                  ...stampConfigId,
                  evidenceArtifactId: docRef.id,
                  evidenceCollection: 'artifacts' as const,
                  ...(registration
                    ? { workbookScanRegistration: registration, scanned: true }
                    : {}),
                }
              : ci,
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          onArtifactCreated?.({ ...artifact, id: docRef.id, uri: downloadUrl } as Artifact)
          onMessage?.(
            registration
              ? {
                  text: `Registered to ${registration.configName}${registration.position != null ? ` · Lesson ${registration.position}` : ''}`,
                  severity: 'success',
                }
              : { text: 'Work captured!', severity: 'success' },
          )
        } catch (err) {
          console.error('[UnifiedCapture] Workbook capture failed:', {
            childId,
            itemLabel: item.label,
            fileName: file.name,
            error: err,
          })
          onMessage?.({ text: 'Photo capture failed. Try again.', severity: 'error' })
        } finally {
          setScanItemIndex(null)
        }
        return
      }

      try {
        // 1. Try the scan pipeline (AI vision analysis)
        const record = await runScan(file, familyId, childId)
        if (!record) {
          clearScan()
        }

        // 2. Route based on scan result
        const isCurriculumScan =
          record?.results &&
          record.results.pageType !== 'certificate' &&
          ['worksheet', 'textbook', 'test'].includes(record.results.pageType)

        if (isCurriculumScan && record?.results && record.id) {
          // ── SCANS path: curriculum evidence ──
          let configResult: ScanConfigResult = { action: 'none' }
          try {
            configResult = await syncScanToConfig(childId, record.results as WorksheetScanResult)
            if (configResult.action === 'created') {
              onMessage?.({ text: `New workbook added: ${configResult.configName}`, severity: 'success' })
            } else if (configResult.action === 'updated' && configResult.position) {
              onMessage?.({ text: `Updated ${configResult.configName} to lesson ${configResult.position}`, severity: 'success' })
            } else {
              onMessage?.({ text: 'Work captured!', severity: 'success' })
            }
          } catch (err) {
            console.error('[UnifiedCapture] Failed to sync scan to config:', err)
            onMessage?.({ text: 'Work captured!', severity: 'success' })
          }

          // Feed scan skills into the Learning Map (non-blocking)
          const skills = (record.results as WorksheetScanResult).skillsTargeted
          if (skills.length > 0) {
            try {
              const findings = skills.map((s) => ({
                skill: s.skill,
                status: (s.alignsWithSnapshot === 'ahead' ? 'mastered' : 'emerging') as 'mastered' | 'emerging',
                evidence: `Workbook scan: ${s.skill} (${s.level})`,
                testedAt: new Date().toISOString(),
              }))
              await updateSkillMapFromFindings(familyId, childId, findings)
            } catch (err) {
              console.warn('[UnifiedCapture] Failed to update skill map (non-blocking):', err)
            }
          }

          // Phase 1: write blockers for challenging / too-hard scans (non-blocking).
          try {
            const detected = detectBlockersFromScan(record.results as WorksheetScanResult, {
              scanId: record.id,
            })
            if (detected.length > 0) {
              const snapshotRef = doc(skillSnapshotsCollection(familyId), childId)
              const snapshotSnap = await getDoc(snapshotRef)
              const existing: Partial<SkillSnapshot> = snapshotSnap.exists() ? snapshotSnap.data() : {}
              let merged: ConceptualBlock[] = existing.conceptualBlocks ?? []
              for (const b of detected) {
                if (!b.id) continue
                merged = mergeBlock(merged, b as Parameters<typeof mergeBlock>[1])
              }
              await updateDoc(snapshotRef, {
                conceptualBlocks: JSON.parse(JSON.stringify(merged)),
                blocksUpdatedAt: new Date().toISOString(),
              })
            }
          } catch (err) {
            console.warn('[UnifiedCapture] Failed to merge scan blockers (non-blocking):', err)
          }

          // Link scan doc to checklist item
          let updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
            i === index
              ? { ...ci, evidenceArtifactId: record!.id!, evidenceCollection: 'scans' as const, scanned: true }
              : ci,
          )

          // Auto-complete bypassed checklist items when scan advances position
          if (configResult.position != null) {
            const wsResult = record.results as WorksheetScanResult
            const recommendation = isWorksheetScan(wsResult) ? wsResult.recommendation : undefined
            const autoCompleted = autoCompleteBypassedItems(
              updatedChecklist,
              index,
              configResult.configId,
              configResult.position,
              recommendation,
            )
            if (autoCompleted) {
              updatedChecklist = autoCompleted
            }
          }

          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        } else {
          // ── ARTIFACTS path: non-curriculum or scan failed ──
          const artifact = {
            childId,
            title: `${item.label.replace(/\s*\(\d+m\)/, '')} — ${childName}'s work`,
            type: EvidenceType.Photo,
            dayLogId: today,
            createdAt: new Date().toISOString(),
            tags: {
              engineStage: EngineStage.Build,
              domain: '',
              subjectBucket: item.subjectBucket ?? SubjectBucket.Other,
              location: 'Home',
              planItem: item.label,
            },
          }
          const docRef = await addDoc(artifactsCollection(familyId), artifact)
          const ext = file.name.split('.').pop() ?? 'jpg'
          const filename = generateFilename(ext)
          const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
          await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

          // Link artifact to checklist item
          const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
            i === index
              ? { ...ci, evidenceArtifactId: docRef.id, evidenceCollection: 'artifacts' as const }
              : ci,
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          onArtifactCreated?.({ ...artifact, id: docRef.id, uri: downloadUrl } as Artifact)
          onMessage?.({ text: 'Work captured!', severity: 'success' })
          // No scan analysis to show for artifacts — clear the index
          setScanItemIndex(null)
        }
      } catch (err) {
        console.error('[UnifiedCapture] Capture failed:', {
          childId,
          itemLabel: item.label,
          fileName: file.name,
          error: err,
        })
        onMessage?.({ text: 'Photo capture failed. Try again.', severity: 'error' })
        setScanItemIndex(null)
      }
    },
    [runScan, clearScan, familyId, childId, childName, today, dayLog, persistDayLogImmediate, syncScanToConfig, onMessage, onArtifactCreated, analyzeWorkbookPage, configs],
  )

  /**
   * FEAT-62 backfill: recover a stranded photo. A workbook-linked item that
   * already has an artifact photo but no scan registration (captured before the
   * routing fix, or when analysis failed) can be registered with one tap — pull
   * the saved image back and run the same deterministic workbook analysis. No
   * new artifact is created; only the registration is stamped. Owner-initiated —
   * there is no auto-backfill sweep.
   *
   * FEAT-62 polish (display-parity lookup): the caller passes `photoUris` — the
   * photo(s) the Today page can already *show* for this item, resolved by the
   * same `tags.planItem`/title join the Artifacts section uses. This unblocks the
   * owner's real cohort: legacy items whose photo lives in the day's artifacts
   * but whose checklist row lost its `evidenceArtifactId` link. Multiple URIs =
   * "analyze all"; each page is scanned in turn and the last registration (latest
   * position) is stamped. When `photoUris` is omitted we fall back to the item's
   * own `evidenceArtifactId` (the original single-photo path).
   */
  const handleBackfillWorkbookScan = useCallback(
    async (index: number, photoUris?: string[]) => {
      if (!dayLog?.checklist) return
      const item = dayLog.checklist[index]
      if (!item) return
      // Legacy-item fallback: resolve an unstamped item's config via name/subject
      // match, then stamp it below so the resolution is permanent.
      const resolvedConfigId = item.workbookConfigId ?? findWorkbookConfigId(item, configs)
      if (!resolvedConfigId) return
      const stampConfigId = !item.workbookConfigId ? { workbookConfigId: resolvedConfigId } : {}
      setScanItemIndex(index)
      try {
        // Prefer the display-resolved URIs; fall back to the item's linked
        // evidence artifact when the caller passed none (original path).
        let uris = (photoUris ?? []).filter((u): u is string => !!u)
        if (uris.length === 0) {
          if (!item.evidenceArtifactId) {
            onMessage?.({ text: "Couldn't find the photo to analyze.", severity: 'error' })
            return
          }
          const artifactSnap = await getDoc(doc(artifactsCollection(familyId), item.evidenceArtifactId))
          const data = artifactSnap.exists()
            ? (artifactSnap.data() as { uri?: string; mediaUrls?: string[] })
            : undefined
          const uri = data?.uri ?? data?.mediaUrls?.[0]
          if (!uri) {
            onMessage?.({ text: "Couldn't find the photo to analyze.", severity: 'error' })
            return
          }
          uris = [uri]
        }

        // Analyze each page in turn (one workbook page per photo). Best-effort:
        // a page that fails to read is skipped; the last success advances the
        // position we stamp. No artifact is ever created or removed here.
        let lastRegistration: { configName: string; position: number | null } | null = null
        let registeredCount = 0
        for (const uri of uris) {
          const resp = await fetch(uri)
          const blob = await resp.blob()
          const scanFile = new File([blob], 'workbook-page.jpg', { type: blob.type || 'image/jpeg' })
          const registration = await analyzeWorkbookPage(scanFile, resolvedConfigId)
          if (registration) {
            lastRegistration = registration
            registeredCount += 1
          }
        }

        if (!lastRegistration) {
          onMessage?.({ text: "Couldn't read the workbook page. The photo is still saved.", severity: 'error' })
          return
        }
        const updatedChecklist = (dayLog.checklist ?? []).map((ci, i) =>
          i === index ? { ...ci, ...stampConfigId, workbookScanRegistration: lastRegistration!, scanned: true } : ci,
        )
        persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        const lessonSuffix = lastRegistration.position != null ? ` · Lesson ${lastRegistration.position}` : ''
        onMessage?.({
          text:
            registeredCount > 1
              ? `Registered ${registeredCount} pages to ${lastRegistration.configName}${lessonSuffix}`
              : `Registered to ${lastRegistration.configName}${lessonSuffix}`,
          severity: 'success',
        })
      } catch (err) {
        console.error('[UnifiedCapture] Backfill workbook scan failed:', err)
        onMessage?.({ text: 'Analysis failed. The photo is still saved.', severity: 'error' })
      } finally {
        setScanItemIndex(null)
      }
    },
    [dayLog, familyId, analyzeWorkbookPage, persistDayLogImmediate, onMessage, configs],
  )

  return {
    handleUnifiedCapture,
    handleBackfillWorkbookScan,
    scanItemIndex,
    setScanItemIndex,
    scanResult,
    scanLoading,
    scanError,
    clearScan,
    recordScanAction,
    syncScanToConfig,
    runScan,
  }
}
