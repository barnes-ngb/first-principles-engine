import { useCallback, useState } from 'react'
import { addDoc, doc, updateDoc } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { useScan } from '../../core/hooks/useScan'
import { useScanToActivityConfig } from '../../core/hooks/useScanToActivityConfig'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import type { Artifact, DayLog, ScanRecord, WorksheetScanResult } from '../../core/types'
import { isWorksheetScan } from '../../core/types/planning'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import type { ScanConfigResult } from '../../core/hooks/useScanToActivityConfig'
import { autoCompleteBypassedItems } from './scanAdvance'

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
}

export interface UseUnifiedCaptureResult {
  /** Run the unified capture pipeline for a checklist item. */
  handleUnifiedCapture: (file: File, index: number) => Promise<void>
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
}: UseUnifiedCaptureOptions): UseUnifiedCaptureResult {
  const { scan: runScan, recordAction: recordScanAction, scanResult, scanning: scanLoading, error: scanError, clearScan } = useScan()
  const { syncScanToConfig } = useScanToActivityConfig()
  const [scanItemIndex, setScanItemIndex] = useState<number | null>(null)

  const handleUnifiedCapture = useCallback(
    async (file: File, index: number) => {
      if (!dayLog?.checklist) return
      const item = dayLog.checklist[index]
      setScanItemIndex(index)

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
    [runScan, clearScan, familyId, childId, childName, today, dayLog, persistDayLogImmediate, syncScanToConfig, onMessage, onArtifactCreated],
  )

  return {
    handleUnifiedCapture,
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
