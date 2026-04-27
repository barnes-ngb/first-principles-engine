import { useCallback } from 'react'
import { doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { activityConfigsCollection, normalizeCurriculumKey, skillSnapshotsCollection } from '../firebase/firestore'
import type { ActivityConfig, SkillSnapshot, WorksheetScanResult, WorkingLevel, WorkingLevels } from '../types'
import { ActivityType, SubjectBucket } from '../types/enums'
import type { SubjectBucket as SubjectBucketType } from '../types/enums'
import {
  deriveMathWorkingLevelFromScan,
  derivePhonicsWorkingLevelFromScan,
  deriveReadingWorkingLevelFromScan,
  canOverwriteWorkingLevel,
} from '../../features/quest/workingLevels'

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
          isWorkbookMatch(config.name ?? '', curriculumName, config.subjectBucket, subject) ||
          isWorkbookMatch(config.curriculum ?? '', curriculumName, config.subjectBucket, subject)
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
        // Use scan's estimated minutes if current is suspiciously low (5m default)
        const existingMinutes = existing.data().defaultMinutes ?? 0
        const estimatedMinutes = scanResult.estimatedMinutes ?? 0
        if (existingMinutes < 10 && estimatedMinutes >= 10) {
          updates.defaultMinutes = estimatedMinutes
        }
        await updateDoc(existing.ref, updates)

        // Update working level from curriculum scan (fire-and-forget)
        void updateWorkingLevelFromScan(familyId, childId, lessonNumber, curriculumName, subject)

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

      // Update working level from curriculum scan (fire-and-forget)
      void updateWorkingLevelFromScan(familyId, childId, lessonNumber, curriculumName, subject)

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

/**
 * Maps a subject bucket to a workingLevels key and derives the level from a scan.
 * Returns null for subjects that don't have a working-level mapping (e.g. Science, Art).
 */
function deriveLevelForSubject(
  subject: SubjectBucketType,
  lessonNumber: number | null,
  curriculumName: string,
): { key: keyof WorkingLevels; level: WorkingLevel } | null {
  switch (subject) {
    case SubjectBucket.Math: {
      const level = deriveMathWorkingLevelFromScan(lessonNumber, curriculumName)
      return level ? { key: 'math', level } : null
    }
    case SubjectBucket.Reading: {
      // Reading bucket includes both phonics and comprehension workbooks.
      // Use curriculum name to disambiguate.
      const lower = curriculumName.toLowerCase()
      if (lower.includes('phonics')) {
        const level = derivePhonicsWorkingLevelFromScan(lessonNumber, curriculumName)
        return level ? { key: 'phonics', level } : null
      }
      const level = deriveReadingWorkingLevelFromScan(lessonNumber, curriculumName)
      return level ? { key: 'comprehension', level } : null
    }
    case SubjectBucket.LanguageArts: {
      // LA workbooks (e.g. GATB Language Arts) often cover phonics skills
      const level = derivePhonicsWorkingLevelFromScan(lessonNumber, curriculumName)
      return level ? { key: 'phonics', level } : null
    }
    default:
      return null
  }
}

async function updateWorkingLevelFromScan(
  familyId: string,
  childId: string,
  lessonNumber: number | null,
  curriculumName: string,
  subject: SubjectBucketType,
): Promise<void> {
  try {
    const derived = deriveLevelForSubject(subject, lessonNumber, curriculumName)
    if (!derived) return

    const snapshotRef = doc(skillSnapshotsCollection(familyId), childId)
    const snapshotSnap = await getDoc(snapshotRef)
    const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
      ? snapshotSnap.data()
      : {}

    const currentLevel = existing.workingLevels?.[derived.key]
    if (!canOverwriteWorkingLevel(currentLevel)) return

    const mergedWorkingLevels = { ...(existing.workingLevels ?? {}), [derived.key]: derived.level }
    await updateDoc(snapshotRef, {
      workingLevels: mergedWorkingLevels,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn(`[ScanToConfig] Failed to update ${subject} working level`, err)
  }
}

function normalizeForMatch(name: string): string {
  return normalizeCurriculumKey(
    (name || '')
      .replace(/^the\s+/i, '')
      .replace(/\s+level\s+\d+/i, '')
      .replace(/\s*\(.*?\)/g, ''),
  ).replace(/-/g, '')
}

function isWorkbookMatch(
  configName: string,
  scanName: string,
  configSubject?: string,
  scanSubject?: string,
): boolean {
  const a = normalizeForMatch(configName)
  const b = normalizeForMatch(scanName)

  if (!a || !b) return false

  // Exact match after normalization
  if (a === b) return true

  // One contains the other (min length 3 to avoid false positives)
  if (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a))) return true

  // Both are GATB — match if same subject
  const subjects = ['math', 'reading', 'languagearts', 'language', 'phonics', 'spelling']
  const isGATB = (s: string) =>
    s.includes('gatb') || s.includes('goodandthebeautiful') || s.includes('goodandbeautiful')

  if (isGATB(a) && isGATB(b)) {
    for (const subj of subjects) {
      if (a.includes(subj) && b.includes(subj)) return true
    }
  }

  // Same subject + at least one is GATB (e.g. config "Good and the Beautiful Math" vs scan subject "Math")
  if (configSubject && scanSubject) {
    const cs = configSubject.toLowerCase()
    const ss = scanSubject.toLowerCase()
    if (cs === ss && (isGATB(a) || isGATB(b))) return true
  }

  // Subject-based matching for generic names like "Language arts workbook"
  const genericWorkbook = (s: string) =>
    s.includes('workbook') && !isGATB(s)
  if (genericWorkbook(a) || genericWorkbook(b)) {
    for (const subj of subjects) {
      if (a.includes(subj) && b.includes(subj)) return true
    }
  }

  // Fallback: same subject workbook (one primary workbook per subject)
  if (configSubject && scanSubject) {
    if (configSubject.toLowerCase() === scanSubject.toLowerCase()) return true
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
