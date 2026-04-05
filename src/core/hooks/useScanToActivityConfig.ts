import { useCallback } from 'react'
import { doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { activityConfigsCollection } from '../firebase/firestore'
import type { ActivityConfig, CurriculumDetected, WorksheetScanResult } from '../types'
import { ActivityType, SubjectBucket } from '../types/enums'
import type { SubjectBucket as SubjectBucketType } from '../types/enums'

export interface ScanConfigResult {
  action: 'created' | 'updated' | 'none'
  configId?: string
  configName?: string
  position?: number | null
}

/**
 * Hook that creates or updates an activity config when a scan identifies a curriculum.
 * This replaces the old workbookConfigs-based position update flow.
 */
export function useScanToActivityConfig() {
  const familyId = useFamilyId()

  const syncScanToConfig = useCallback(
    async (
      childId: string,
      scanResult: WorksheetScanResult,
    ): Promise<ScanConfigResult> => {
      if (!familyId) return { action: 'none' }

      const detected = scanResult.curriculumDetected
      if (!detected?.name && !scanResult.subject) return { action: 'none' }

      const curriculumName = detected?.name || scanResult.subject || 'Unknown'
      const lessonNumber = detected?.lessonNumber ?? detected?.pageNumber ?? null

      // Find existing activity config for this curriculum
      const configsSnap = await getDocs(
        query(
          activityConfigsCollection(familyId),
          where('childId', 'in', [childId, 'both']),
          where('type', '==', 'workbook'),
        ),
      )

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const scanNorm = normalize(curriculumName)

      const existing = configsSnap.docs.find((d) => {
        const config = d.data()
        const configName = normalize(config.name ?? '')
        const configCurr = normalize(config.curriculum ?? '')
        return (
          configName.includes(scanNorm) ||
          scanNorm.includes(configName) ||
          configCurr.includes(scanNorm) ||
          scanNorm.includes(configCurr)
        )
      })

      if (existing) {
        // UPDATE existing config with new position
        const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
        if (lessonNumber != null) {
          const current = existing.data().currentPosition ?? 0
          if (lessonNumber > current) {
            updates.currentPosition = lessonNumber
          }
        }
        await updateDoc(existing.ref, updates)
        return {
          action: 'updated',
          configId: existing.id,
          configName: existing.data().name,
          position: lessonNumber,
        }
      }

      // CREATE new activity config from scan
      const subject = mapSubjectBucket(curriculumName, detected?.provider ?? null)
      const ref = doc(activityConfigsCollection(familyId))
      const isCover = (scanResult as WorksheetScanResult & { isCover?: boolean }).isCover === true
      const totalUnits = isCover
        ? ((scanResult as WorksheetScanResult & { totalUnits?: number }).totalUnits ?? 0)
        : 0

      const newConfig: Omit<ActivityConfig, 'id'> & { id: string } = {
        id: ref.id,
        name: curriculumName,
        type: ActivityType.Workbook,
        subjectBucket: subject,
        defaultMinutes: scanResult.estimatedMinutes || 30,
        frequency: 'daily',
        childId,
        sortOrder: mapSortOrder(subject),
        curriculum: curriculumName,
        totalUnits,
        currentPosition: lessonNumber ?? 1,
        unitLabel: 'lesson',
        completed: false,
        scannable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await setDoc(ref, newConfig)
      return {
        action: 'created',
        configId: ref.id,
        configName: curriculumName,
        position: lessonNumber,
      }
    },
    [familyId],
  )

  return { syncScanToConfig }
}

function mapSubjectBucket(
  name: string,
  provider: string | null,
): SubjectBucketType {
  const lower = name.toLowerCase()
  if (provider === 'reading-eggs' || lower.includes('reading')) return SubjectBucket.Reading
  if (lower.includes('math')) return SubjectBucket.Math
  if (lower.includes('language art') || lower.includes('handwriting') || lower.includes('writing'))
    return SubjectBucket.LanguageArts
  if (lower.includes('phonics')) return SubjectBucket.Reading
  if (lower.includes('science')) return SubjectBucket.Science
  if (lower.includes('history') || lower.includes('geography'))
    return SubjectBucket.SocialStudies
  return SubjectBucket.Other
}

function mapSortOrder(subject: SubjectBucketType): number {
  switch (subject) {
    case SubjectBucket.Reading:
      return 11
    case SubjectBucket.Math:
      return 12
    case SubjectBucket.LanguageArts:
      return 13
    case SubjectBucket.Science:
      return 21
    case SubjectBucket.SocialStudies:
      return 22
    default:
      return 55
  }
}
