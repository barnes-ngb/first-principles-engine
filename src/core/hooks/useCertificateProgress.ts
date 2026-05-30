import { useCallback, useState } from 'react'
import { doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { activityConfigsCollection, normalizeCurriculumKey } from '../firebase/firestore'
import type { ActivityConfig, CertificateScanResult, CurriculumMeta } from '../types'
import { SubjectBucket } from '../types/enums'
import type { SubjectBucket as SubjectBucketType } from '../types/enums'
import { writeSnapshotUpdate } from '../../features/evaluate/skillSnapshotWrites'

export interface CertificateProgressOptions {
  /**
   * When set, target this exact activity config doc instead of fuzzy-matching
   * by curriculum name. Used when the certificate scan is initiated from a
   * specific curriculum card.
   */
  targetConfigId?: string
}

export interface CertificatePreview {
  workbookName: string
  existingConfig: ActivityConfig | null
  updates: {
    currentPosition: number | null
    lastMilestone: string
    milestoneDate: string
    masteredSkills: string[]
    level: string
  }
}

export interface UseCertificateProgressResult {
  /** Build a preview of what will be updated (for confirmation UI). */
  buildPreview: (
    familyId: string,
    childId: string,
    result: CertificateScanResult,
    options?: CertificateProgressOptions,
  ) => Promise<CertificatePreview>
  /** Apply the certificate data to the workbook config after user confirms. */
  applyUpdate: (
    familyId: string,
    childId: string,
    result: CertificateScanResult,
    options?: CertificateProgressOptions,
  ) => Promise<void>
  /** Preview data for the confirmation dialog. */
  preview: CertificatePreview | null
  applying: boolean
  applied: boolean
  error: string | null
  clearState: () => void
}

export function useCertificateProgress(): UseCertificateProgressResult {
  const [preview, setPreview] = useState<CertificatePreview | null>(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildPreview = useCallback(
    async (
      familyId: string,
      childId: string,
      result: CertificateScanResult,
      options: CertificateProgressOptions = {},
    ): Promise<CertificatePreview> => {
      const workbookName = result.curriculumName
      const colRef = activityConfigsCollection(familyId)

      let existingConfig: ActivityConfig | null = null
      if (options.targetConfigId) {
        const targetSnap = await getDoc(doc(colRef, options.targetConfigId))
        existingConfig = targetSnap.exists() ? (targetSnap.data() as ActivityConfig) : null
      } else {
        // Match by normalized curriculum key to avoid duplicates
        const normalizedKey = normalizeCurriculumKey(workbookName)
        const allSnap = await getDocs(
          query(colRef, where('childId', 'in', [childId, 'both']), where('type', '==', 'workbook')),
        )
        const matchingDoc = allSnap.docs.find((d) =>
          normalizeCurriculumKey(d.data().name ?? d.data().curriculum ?? '') === normalizedKey,
        )
        existingConfig = (matchingDoc?.data() as ActivityConfig | undefined) ?? null
      }

      // Parse lesson range end number as new position if available
      let newPosition: number | null = null
      const rangeMatch = result.lessonRange.match(/(\d+)\s*[-–]\s*(\d+)/)
      if (rangeMatch) {
        newPosition = parseInt(rangeMatch[2], 10)
      } else {
        const singleMatch = result.lessonRange.match(/(\d+)/)
        if (singleMatch) {
          newPosition = parseInt(singleMatch[1], 10)
        }
      }

      const previewData: CertificatePreview = {
        workbookName: existingConfig?.name ?? workbookName,
        existingConfig,
        updates: {
          currentPosition: newPosition,
          lastMilestone: result.milestone,
          milestoneDate: result.date || new Date().toISOString().slice(0, 10),
          masteredSkills: result.suggestedSnapshotUpdate?.masteredSkills ?? result.skillsCovered,
          level: result.level,
        },
      }

      setPreview(previewData)
      return previewData
    },
    [],
  )

  const applyUpdate = useCallback(
    async (
      familyId: string,
      childId: string,
      result: CertificateScanResult,
      options: CertificateProgressOptions = {},
    ): Promise<void> => {
      setApplying(true)
      setError(null)

      try {
        const workbookName = result.curriculumName
        const colRef = activityConfigsCollection(familyId)

        let matchingDoc: { ref: ReturnType<typeof doc>; data: () => ActivityConfig } | null = null
        if (options.targetConfigId) {
          const targetRef = doc(colRef, options.targetConfigId)
          const targetSnap = await getDoc(targetRef)
          if (targetSnap.exists()) {
            const data = targetSnap.data() as ActivityConfig
            matchingDoc = { ref: targetRef, data: () => data }
          }
        } else {
          // Match by normalized curriculum key to find existing config
          const normalizedKey = normalizeCurriculumKey(workbookName)
          const allSnap = await getDocs(
            query(colRef, where('childId', 'in', [childId, 'both']), where('type', '==', 'workbook')),
          )
          const m = allSnap.docs.find((d) =>
            normalizeCurriculumKey(d.data().name ?? d.data().curriculum ?? '') === normalizedKey,
          )
          if (m) matchingDoc = { ref: m.ref, data: () => m.data() as ActivityConfig }
        }

        // Parse lesson range end number as new position
        let newPosition: number | null = null
        const rangeMatch = result.lessonRange.match(/(\d+)\s*[-–]\s*(\d+)/)
        if (rangeMatch) {
          newPosition = parseInt(rangeMatch[2], 10)
        } else {
          const singleMatch = result.lessonRange.match(/(\d+)/)
          if (singleMatch) {
            newPosition = parseInt(singleMatch[1], 10)
          }
        }

        const newMasteredSkills = result.suggestedSnapshotUpdate?.masteredSkills ?? result.skillsCovered
        const milestoneDate = result.date || new Date().toISOString().slice(0, 10)

        // A certificate that reads as a completion ("100%", "complete", "gold")
        // resolves the matching Skill Snapshot blocks; otherwise it advances
        // them to RESOLVING. See FUNC-02 write-through below.
        const milestoneText = (result.milestone ?? '').toLowerCase()
        const isComplete =
          milestoneText.includes('100%') ||
          milestoneText.includes('complete') ||
          milestoneText.includes('finished') ||
          milestoneText.includes('gold')

        if (!matchingDoc && options.targetConfigId) {
          throw new Error('Target curriculum card not found. It may have been deleted.')
        }

        if (matchingDoc) {
          // Update existing activity config (regardless of exact name)
          const existing = matchingDoc.data()
          const existingMastered = existing.curriculumMeta?.masteredSkills ?? []
          const mergedSkills = [...new Set([...existingMastered, ...newMasteredSkills])]

          const curriculumUpdate: CurriculumMeta = {
            ...existing.curriculumMeta,
            provider: result.curriculum,
            level: result.level,
            lastMilestone: result.milestone,
            milestoneDate,
            masteredSkills: mergedSkills,
            ...(isComplete && { completed: true }),
          }

          const updates: Record<string, unknown> = {
            curriculumMeta: curriculumUpdate,
            updatedAt: new Date().toISOString(),
          }

          if (newPosition !== null && newPosition > (existing.currentPosition ?? 0)) {
            updates.currentPosition = newPosition
          }

          await updateDoc(matchingDoc.ref, updates)
        } else {
          // Create new activity config from certificate data
          const docRef = doc(colRef)
          const subjectBucket = inferSubjectBucket(result.curriculum, result.curriculumName)

          const newConfig: ActivityConfig = {
            id: docRef.id,
            childId,
            name: workbookName,
            type: 'workbook',
            subjectBucket,
            defaultMinutes: 30,
            frequency: 'daily',
            sortOrder: 11,
            curriculum: workbookName,
            totalUnits: 0, // Unknown from certificate alone
            currentPosition: newPosition ?? 0,
            unitLabel: 'lesson',
            curriculumMeta: {
              provider: result.curriculum,
              level: result.level,
              lastMilestone: result.milestone,
              milestoneDate,
              masteredSkills: newMasteredSkills,
              ...(isComplete && { completed: true }),
            },
            completed: false,
            scannable: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          await setDoc(docRef, newConfig, { merge: true })
        }

        // FUNC-02 write-through: fold the certificate's mastered skills into the
        // Skill Snapshot so the curriculum store and the "what to teach next"
        // authority can't silently disagree. Best-effort — never block the
        // primary curriculum-config update on a snapshot write failure.
        if (newMasteredSkills.length > 0) {
          try {
            await writeSnapshotUpdate(familyId, childId, {
              masteredSkills: newMasteredSkills,
              fullyMastered: isComplete,
              source: 'scan',
              evidence: `Certificate: ${result.milestone || result.curriculumName}`,
              at: new Date().toISOString(),
            })
          } catch (err) {
            console.warn('[useCertificateProgress] Snapshot write-through failed (non-blocking):', err)
          }
        }

        setApplied(true)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      } finally {
        setApplying(false)
      }
    },
    [],
  )

  const clearState = useCallback(() => {
    setPreview(null)
    setApplying(false)
    setApplied(false)
    setError(null)
  }, [])

  return { buildPreview, applyUpdate, preview, applying, applied, error, clearState }
}

function inferSubjectBucket(
  curriculum: string,
  curriculumName: string,
): SubjectBucketType {
  const lower = curriculumName.toLowerCase()
  if (curriculum === 'reading-eggs' || lower.includes('reading')) return SubjectBucket.Reading
  if (lower.includes('language arts')) return SubjectBucket.LanguageArts
  if (lower.includes('math')) return SubjectBucket.Math
  if (lower.includes('science')) return SubjectBucket.Science
  return SubjectBucket.Other
}
