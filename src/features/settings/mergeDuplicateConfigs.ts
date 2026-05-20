import {
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

import { activityConfigsCollection } from '../../core/firebase/firestore'
import { normalizeForMatch } from '../../core/hooks/useScanToActivityConfig'
import type { ActivityConfig } from '../../core/types'

export interface DuplicateGroup {
  /** Older config that will be kept as the canonical card. */
  source: ActivityConfig
  /** Newer configs that will be merged into the source and deleted. */
  duplicates: ActivityConfig[]
}

export interface MergedUpdates {
  /** Higher of the existing currentPosition values. Undefined if no change. */
  currentPosition?: number
  /** Most recent updatedAt across the group. */
  updatedAt: string
  /** Union of all mastered skills from the source + duplicates. */
  masteredSkills?: string[]
  /** Last milestone from the newest config that has one. */
  lastMilestone?: string
  /** Subject bucket if the source is missing one but a duplicate has one. */
  subjectBucket?: ActivityConfig['subjectBucket']
  /** Curriculum meta merged from the newest doc. */
  curriculumMeta?: ActivityConfig['curriculumMeta']
}

export interface MergeOutcome {
  sourceId: string
  sourceName: string
  duplicateIds: string[]
  positionBefore: number
  positionAfter: number
}

/**
 * Group active workbook configs by normalized curriculum name and return
 * groups that contain >1 doc. The first (oldest createdAt) becomes the source.
 */
export function detectDuplicateGroups(configs: ActivityConfig[]): DuplicateGroup[] {
  const groups = new Map<string, ActivityConfig[]>()
  for (const c of configs) {
    if (c.type !== 'workbook') continue
    if (c.completed) continue
    const key = normalizeForMatch(c.name || c.curriculum || '')
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }

  const result: DuplicateGroup[] = []
  for (const arr of groups.values()) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    result.push({ source: sorted[0], duplicates: sorted.slice(1) })
  }
  return result
}

/**
 * Compute the merged updates to write to the source config based on the
 * duplicates' data. Position is the max across the group; mastered skills
 * are unioned; curriculumMeta comes from whichever doc has one.
 */
export function computeMergedUpdates(group: DuplicateGroup): MergedUpdates {
  const all = [group.source, ...group.duplicates]

  const maxPosition = all.reduce<number>(
    (max, c) => Math.max(max, c.currentPosition ?? 0),
    0,
  )
  const sourcePosition = group.source.currentPosition ?? 0
  const newestUpdatedAt = all
    .map((c) => c.updatedAt ?? c.createdAt ?? '')
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? new Date().toISOString()

  const masteredUnion = new Set<string>()
  for (const c of all) {
    for (const s of c.curriculumMeta?.masteredSkills ?? []) masteredUnion.add(s)
  }

  // Latest milestone — search duplicates first (newer), then source
  const ordered = [...group.duplicates, group.source]
  const latestMilestone = ordered
    .map((c) => c.curriculumMeta?.lastMilestone)
    .find((m): m is string => typeof m === 'string' && m.length > 0)

  const latestCurriculumMeta = ordered.find((c) => c.curriculumMeta)?.curriculumMeta

  const result: MergedUpdates = { updatedAt: newestUpdatedAt }
  if (maxPosition > sourcePosition) result.currentPosition = maxPosition
  if (masteredUnion.size > 0) result.masteredSkills = [...masteredUnion]
  if (latestMilestone) result.lastMilestone = latestMilestone

  if (!group.source.subjectBucket) {
    const fromDup = group.duplicates.find((d) => d.subjectBucket)?.subjectBucket
    if (fromDup) result.subjectBucket = fromDup
  }

  if (latestCurriculumMeta) {
    result.curriculumMeta = {
      ...latestCurriculumMeta,
      masteredSkills: masteredUnion.size > 0 ? [...masteredUnion] : latestCurriculumMeta.masteredSkills,
    }
  }

  return result
}

/**
 * Apply a single merge: write the merged updates to the source doc,
 * then delete each duplicate doc.
 */
export async function applyMerge(
  familyId: string,
  group: DuplicateGroup,
): Promise<MergeOutcome> {
  const colRef = activityConfigsCollection(familyId)
  const updates = computeMergedUpdates(group)

  const sourceRef = doc(colRef, group.source.id)
  const writePayload: Record<string, unknown> = { updatedAt: updates.updatedAt }
  if (updates.currentPosition !== undefined) writePayload.currentPosition = updates.currentPosition
  if (updates.subjectBucket) writePayload.subjectBucket = updates.subjectBucket
  if (updates.curriculumMeta) writePayload.curriculumMeta = updates.curriculumMeta
  await updateDoc(sourceRef, writePayload)

  for (const dup of group.duplicates) {
    await deleteDoc(doc(colRef, dup.id))
  }

  return {
    sourceId: group.source.id,
    sourceName: group.source.name,
    duplicateIds: group.duplicates.map((d) => d.id),
    positionBefore: group.source.currentPosition ?? 0,
    positionAfter: updates.currentPosition ?? group.source.currentPosition ?? 0,
  }
}

/**
 * Fetch all active workbook configs for a child and return detected duplicates.
 * Excludes completed configs.
 */
export async function fetchDuplicateGroups(
  familyId: string,
  childId: string,
): Promise<DuplicateGroup[]> {
  const snap = await getDocs(
    query(
      activityConfigsCollection(familyId),
      where('childId', 'in', [childId, 'both']),
      where('type', '==', 'workbook'),
    ),
  )
  const configs = snap.docs.map((d) => ({ ...(d.data() as ActivityConfig), id: d.id }))
  return detectDuplicateGroups(configs)
}
