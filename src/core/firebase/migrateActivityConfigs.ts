import {
  doc,
  getDocs,
  getDoc,
  limit,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

import type { ActivityConfig, WorkbookConfig } from '../types'
import type { ActivityType } from '../types/enums'
import { activityConfigsCollection, db, skillSnapshotsCollection, workbookConfigsCollection } from './firestore'

/**
 * One-time migration: create structured activity configs from existing
 * workbook configs + hardcoded routine defaults.
 *
 * Only runs when the activityConfigs collection is empty for a given child.
 */
export async function migrateToActivityConfigs(
  familyId: string,
  childId: string,
): Promise<boolean> {
  // Check if already migrated
  const existing = await getDocs(
    query(
      activityConfigsCollection(familyId),
      where('childId', 'in', [childId, 'both']),
      limit(1),
    ),
  )
  if (!existing.empty) return false

  // Load completed programs from skill snapshot
  const snapshotRef = doc(skillSnapshotsCollection(familyId), childId)
  const snapshotDoc = await getDoc(snapshotRef)
  const completedPrograms: string[] = snapshotDoc.exists()
    ? ((snapshotDoc.data().completedPrograms as string[]) ?? [])
    : []

  // Load existing workbook configs
  const workbooksSnap = await getDocs(
    query(workbookConfigsCollection(familyId), where('childId', '==', childId)),
  )
  const workbooks = workbooksSnap.docs.map((d) => ({
    ...(d.data() as WorkbookConfig),
    id: d.id,
  }))

  const now = new Date().toISOString()

  // Default routine activities for the Barnes family
  const defaults: Omit<ActivityConfig, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Prayer and Scripture',
      type: 'formation',
      subjectBucket: 'Other',
      defaultMinutes: 10,
      frequency: 'daily',
      childId: 'both',
      sortOrder: 1,
      completed: false,
      scannable: false,
    },
    {
      name: 'Handwriting (while read-aloud)',
      type: 'routine',
      subjectBucket: 'LanguageArts',
      defaultMinutes: 20,
      frequency: '3x',
      childId: 'both',
      sortOrder: 31,
      completed: false,
      scannable: false,
    },
    {
      name: 'Booster cards',
      type: 'routine',
      subjectBucket: 'Reading',
      defaultMinutes: 15,
      frequency: '3x',
      childId,
      sortOrder: 32,
      completed: false,
      scannable: false,
    },
    {
      name: 'Sight word games',
      type: 'activity',
      subjectBucket: 'Reading',
      defaultMinutes: 15,
      frequency: '2x',
      childId,
      sortOrder: 33,
      completed: false,
      scannable: false,
    },
    {
      name: 'Memory card',
      type: 'activity',
      subjectBucket: 'Reading',
      defaultMinutes: 10,
      frequency: '2x',
      childId,
      sortOrder: 34,
      completed: false,
      scannable: false,
    },
    {
      name: 'Language arts workbook',
      type: 'workbook',
      subjectBucket: 'LanguageArts',
      defaultMinutes: 20,
      frequency: '3x',
      childId,
      sortOrder: 51,
      completed: false,
      scannable: true,
    },
  ]

  // Convert existing workbook configs to activity configs
  for (const wb of workbooks) {
    const wbNameLower = (wb.name ?? '').toLowerCase()
    const isCompleted =
      wb.completed === true ||
      completedPrograms.some((p) => {
        const pLower = p.toLowerCase()
        return wbNameLower.includes(pLower) || pLower.includes(wbNameLower)
      })

    const isApp =
      wbNameLower.includes('app') ||
      wbNameLower.includes('egg') ||
      wbNameLower.includes('typing')

    defaults.push({
      name: wb.name || 'Unknown workbook',
      type: isApp ? 'app' : 'workbook',
      subjectBucket: wb.subjectBucket || 'Other',
      defaultMinutes: wb.defaultMinutes ?? 30,
      frequency: 'daily',
      childId: wb.childId || childId,
      sortOrder: isApp ? 71 : 11,
      curriculum: wb.curriculum?.provider ?? wb.name,
      totalUnits: wb.totalUnits,
      currentPosition: wb.currentPosition,
      unitLabel: wb.unitLabel || 'lesson',
      completed: isCompleted,
      completedDate: isCompleted ? now : undefined,
      scannable: !isApp,
      notes: undefined,
    })
  }

  // Add evaluation configs
  defaults.push(
    {
      name: 'Knowledge Mine',
      type: 'evaluation',
      subjectBucket: 'Reading',
      defaultMinutes: 15,
      frequency: '2x',
      childId,
      sortOrder: 81,
      completed: false,
      scannable: false,
    },
    {
      name: 'Fluency Practice',
      type: 'evaluation',
      subjectBucket: 'Reading',
      defaultMinutes: 10,
      frequency: '2x',
      childId,
      sortOrder: 82,
      completed: false,
      scannable: false,
    },
  )

  // Write all configs in a batch
  const batch = writeBatch(db)
  for (const config of defaults) {
    const ref = doc(activityConfigsCollection(familyId))
    batch.set(ref, {
      ...config,
      id: ref.id,
      createdAt: now,
      updatedAt: now,
    })
  }
  await batch.commit()

  console.log(
    `[Migration] Created ${defaults.length} activity configs for child ${childId}`,
  )
  return true
}

/**
 * Default routine/formation activities for the Barnes family.
 * Used by both migration and ensure functions.
 */
const DEFAULT_ROUTINE_CONFIGS: Omit<
  ActivityConfig,
  'id' | 'childId' | 'createdAt' | 'updatedAt'
>[] = [
  {
    name: 'Prayer and Scripture',
    type: 'formation' as ActivityType,
    subjectBucket: 'Other',
    defaultMinutes: 10,
    frequency: 'daily',
    sortOrder: 1,
    completed: false,
    scannable: false,
  },
  {
    name: 'Good and the Beautiful Reading',
    type: 'workbook' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 30,
    frequency: 'daily',
    sortOrder: 11,
    completed: false,
    scannable: true,
    curriculum: 'GATB Reading',
  },
  {
    name: 'Good and the Beautiful Math',
    type: 'workbook' as ActivityType,
    subjectBucket: 'Math',
    defaultMinutes: 30,
    frequency: 'daily',
    sortOrder: 12,
    completed: false,
    scannable: true,
    curriculum: 'GATB Math',
  },
  {
    name: 'Handwriting (while read-aloud)',
    type: 'routine' as ActivityType,
    subjectBucket: 'LanguageArts',
    defaultMinutes: 20,
    frequency: '3x',
    sortOrder: 31,
    completed: false,
    scannable: false,
  },
  {
    name: 'Booster cards',
    type: 'routine' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 15,
    frequency: '3x',
    sortOrder: 32,
    completed: false,
    scannable: false,
  },
  {
    name: 'Sight word games',
    type: 'activity' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 15,
    frequency: '2x',
    sortOrder: 33,
    completed: false,
    scannable: false,
  },
  {
    name: 'Memory card',
    type: 'activity' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 10,
    frequency: '2x',
    sortOrder: 34,
    completed: false,
    scannable: false,
  },
  {
    name: 'Language arts workbook',
    type: 'workbook' as ActivityType,
    subjectBucket: 'LanguageArts',
    defaultMinutes: 20,
    frequency: '3x',
    sortOrder: 51,
    completed: false,
    scannable: true,
  },
]

/**
 * Ensure default routine/formation activity configs exist for a child.
 *
 * Unlike `migrateToActivityConfigs` (which only runs on an empty collection),
 * this function checks whether each default config is present by name and
 * creates any that are missing. This handles the case where a scan created
 * one workbook config but the routine defaults were never seeded.
 */
export async function ensureDefaultActivityConfigs(
  familyId: string,
  childId: string,
): Promise<number> {
  // Load all existing configs for this child
  const existingSnap = await getDocs(
    query(
      activityConfigsCollection(familyId),
      where('childId', 'in', [childId, 'both']),
    ),
  )

  if (existingSnap.empty) {
    // No configs at all — let the full migration handle it
    return 0
  }

  // Build a set of normalized existing names for matching
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const existingNames = new Set(
    existingSnap.docs.map((d) => normalize(d.data().name ?? '')),
  )

  // Find defaults that don't yet exist
  const missing = DEFAULT_ROUTINE_CONFIGS.filter(
    (cfg) => !existingNames.has(normalize(cfg.name)),
  )

  if (missing.length === 0) return 0

  const now = new Date().toISOString()
  const batch = writeBatch(db)

  for (const config of missing) {
    const ref = doc(activityConfigsCollection(familyId))
    // Prayer/Handwriting are shared (both); everything else is per-child
    const sharedNames = ['prayer and scripture', 'handwriting (while read-aloud)']
    const cid = sharedNames.includes(config.name.toLowerCase()) ? 'both' : childId

    batch.set(ref, {
      ...config,
      id: ref.id,
      childId: cid,
      createdAt: now,
      updatedAt: now,
    })
  }

  await batch.commit()
  console.log(
    `[ActivityConfigs] Created ${missing.length} missing default configs for child ${childId}`,
  )
  return missing.length
}
