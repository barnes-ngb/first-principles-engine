import { useCallback } from 'react'
import { doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { activityConfigsCollection } from '../firebase/firestore'
import type { ActivityConfig, WorksheetScanResult } from '../types'
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

      const subject = mapSubjectBucket(curriculumName, detected?.provider ?? null)

      const existing = configsSnap.docs.find((d) => {
        const config = d.data()
        return (
          isWorkbookMatch(config.name ?? '', curriculumName) ||
          isWorkbookMatch(config.curriculum ?? '', curriculumName) ||
          // Fallback: same subject workbook (one primary workbook per subject)
          (config.type === 'workbook' &&
            config.subjectBucket?.toLowerCase() === subject.toLowerCase())
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
        // If scan name is more specific (longer), upgrade the name
        const existingName = existing.data().name ?? ''
        if (curriculumName.length > existingName.length && curriculumName.length < 100) {
          updates.name = curriculumName
          updates.curriculum = curriculumName
        }
        await updateDoc(existing.ref, updates)
        return {
          action: 'updated',
          configId: existing.id,
          configName: (updates.name as string) ?? existing.data().name,
          position: lessonNumber,
        }
      }

      // CREATE new activity config from scan
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

function normalizeForMatch(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/\s+level\s+\d+/i, '')
    .replace(/\s*\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function isWorkbookMatch(configName: string, scanName: string): boolean {
  const a = normalizeForMatch(configName)
  const b = normalizeForMatch(scanName)

  if (!a || !b) return false

  // Exact match after normalization
  if (a === b) return true

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true

  // Both are GATB — match if same subject
  const subjects = ['math', 'reading', 'languagearts', 'language', 'phonics', 'spelling']
  const isGATB = (s: string) =>
    s.includes('gatb') || s.includes('goodandthebeautiful') || s.includes('goodandbeautiful')

  if (isGATB(a) && isGATB(b)) {
    for (const subj of subjects) {
      if (a.includes(subj) && b.includes(subj)) return true
    }
  }

  // Subject-based matching for generic names like "Language arts workbook"
  const genericWorkbook = (s: string) =>
    s.includes('workbook') && !isGATB(s)
  if (genericWorkbook(a) || genericWorkbook(b)) {
    for (const subj of subjects) {
      if (a.includes(subj) && b.includes(subj)) return true
    }
  }

  return false
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
