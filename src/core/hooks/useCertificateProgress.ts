import { useCallback, useState } from 'react'
import { doc, getDocs, query, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore'

import { workbookConfigsCollection, workbookConfigDocId, normalizeCurriculumKey } from '../firebase/firestore'
import type { CertificateScanResult, WorkbookConfig, CurriculumMeta } from '../types'
import { SubjectBucket } from '../types/enums'
import type { SubjectBucket as SubjectBucketType } from '../types/enums'

export interface CertificatePreview {
  workbookName: string
  existingConfig: WorkbookConfig | null
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
  ) => Promise<CertificatePreview>
  /** Apply the certificate data to the workbook config after user confirms. */
  applyUpdate: (
    familyId: string,
    childId: string,
    result: CertificateScanResult,
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
    ): Promise<CertificatePreview> => {
      const workbookName = result.curriculumName
      const colRef = workbookConfigsCollection(familyId)

      // Match by normalized curriculum key to avoid duplicates
      const normalizedKey = normalizeCurriculumKey(workbookName)
      const allSnap = await getDocs(query(colRef, where('childId', '==', childId)))
      const matchingDoc = allSnap.docs.find(d => normalizeCurriculumKey(d.data().name) === normalizedKey)
      const existingConfig = matchingDoc?.data() ?? null

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
        workbookName,
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
    ): Promise<void> => {
      setApplying(true)
      setError(null)

      try {
        const workbookName = result.curriculumName
        const colRef = workbookConfigsCollection(familyId)

        // Match by normalized curriculum key to find existing config
        const normalizedKey = normalizeCurriculumKey(workbookName)
        const allSnap = await getDocs(query(colRef, where('childId', '==', childId)))
        const matchingDoc = allSnap.docs.find(d => normalizeCurriculumKey(d.data().name) === normalizedKey)

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

        if (matchingDoc) {
          // Update existing workbook config (regardless of exact name)
          const existing = matchingDoc.data()
          const existingMastered = existing.curriculum?.masteredSkills ?? []
          const mergedSkills = [...new Set([...existingMastered, ...newMasteredSkills])]

          const milestoneText = (result.milestone ?? '').toLowerCase()
          const isComplete =
            milestoneText.includes('100%') ||
            milestoneText.includes('complete') ||
            milestoneText.includes('finished') ||
            milestoneText.includes('gold')

          const curriculumUpdate: CurriculumMeta = {
            ...existing.curriculum,
            provider: result.curriculum,
            level: result.level,
            lastMilestone: result.milestone,
            milestoneDate,
            masteredSkills: mergedSkills,
            ...(isComplete && { completed: true }),
          }

          const updates: Record<string, unknown> = {
            curriculum: curriculumUpdate,
            updatedAt: serverTimestamp(),
          }

          if (newPosition !== null && newPosition > existing.currentPosition) {
            updates.currentPosition = newPosition
          }

          await updateDoc(matchingDoc.ref, updates)
        } else {
          // Create new workbook config from certificate data
          const docId = workbookConfigDocId(childId, workbookName)
          const docRef = doc(colRef, docId)
          const subjectBucket = inferSubjectBucket(result.curriculum, result.curriculumName)

          const milestoneText = (result.milestone ?? '').toLowerCase()
          const isComplete =
            milestoneText.includes('100%') ||
            milestoneText.includes('complete') ||
            milestoneText.includes('finished') ||
            milestoneText.includes('gold')

          const newConfig: WorkbookConfig = {
            childId,
            name: workbookName,
            subjectBucket,
            totalUnits: 0, // Unknown from certificate alone
            currentPosition: newPosition ?? 0,
            unitLabel: 'lesson',
            targetFinishDate: '',
            schoolDaysPerWeek: 4,
            curriculum: {
              provider: result.curriculum,
              level: result.level,
              lastMilestone: result.milestone,
              milestoneDate,
              masteredSkills: newMasteredSkills,
              ...(isComplete && { completed: true }),
            },
          }

          await setDoc(docRef, {
            ...newConfig,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as unknown as WorkbookConfig)
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
