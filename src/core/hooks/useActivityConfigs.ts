import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import {
  addActivityConfig,
  assertWorkbookOwner,
  completeActivityConfig,
  setActivityConfigPosition,
  syncActivityPositionToModel,
} from '../firebase/activityConfigWrites'
import { activityConfigsCollection, db } from '../firebase/firestore'
import { ensureDefaultActivityConfigs, migrateToActivityConfigs } from '../firebase/migrateActivityConfigs'
import type { NewActivityConfig } from '../firebase/activityConfigWrites'
import type { ActivityConfig } from '../types'

export interface UseActivityConfigsResult {
  configs: ActivityConfig[]
  loading: boolean
  error: string | null
  addConfig: (data: NewActivityConfig) => Promise<void>
  updateConfig: (id: string, updates: Partial<ActivityConfig>) => Promise<void>
  deleteConfig: (id: string) => Promise<void>
  markComplete: (id: string) => Promise<void>
  updatePosition: (id: string, position: number) => Promise<void>
  reorder: (configs: ActivityConfig[]) => Promise<void>
}

// The writes themselves — and the DATA-08 owner rule they enforce — live in
// `core/firebase/activityConfigWrites`, so a non-component caller (the Shelly
// portal's confirm cards, FEAT-143) performs the SAME write rather than a second
// one that looks alike. Re-exported here because this module was their original
// home and every existing importer names it.
export type { NewActivityConfig } from '../firebase/activityConfigWrites'
export {
  assertWorkbookOwner,
  isWorkbookOwnerInvalid,
  WORKBOOK_OWNER_REASON,
} from '../firebase/activityConfigWrites'

export function useActivityConfigs(childId: string): UseActivityConfigsResult {
  const familyId = useFamilyId()
  const [configs, setConfigs] = useState<ActivityConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [migrationDone, setMigrationDone] = useState(false)
  // Latest configs snapshot for writers that need to read existing docs
  // (e.g. type-aware guards) without re-creating their callbacks.
  const configsRef = useRef<ActivityConfig[]>([])

  // Run migration on first load if needed, then ensure defaults exist
  useEffect(() => {
    if (!familyId || !childId) return
    migrateToActivityConfigs(familyId, childId)
      .then(() => ensureDefaultActivityConfigs(familyId, childId))
      .then(() => setMigrationDone(true))
      .catch((err) => {
        console.error('[ActivityConfigs] Migration failed:', err)
        setMigrationDone(true) // Continue even if migration fails
      })
  }, [familyId, childId])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!familyId || !childId || !migrationDone) return

    const q = query(
      activityConfigsCollection(familyId),
      where('childId', 'in', [childId, 'both']),
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ ...(d.data() as ActivityConfig), id: d.id }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
        configsRef.current = items
        setConfigs(items)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[ActivityConfigs] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId, childId, migrationDone])

  /** Fire the FEAT-63 learner-model position sync for a manual config edit.
   *  Resolves the workbook name + owning child from the merged config, then
   *  delegates to the shared writer's sync (no-ops for a shared ('both') config —
   *  workbooks are per-child, DATA-08). */
  const maybeSyncPosition = useCallback(
    (existing: ActivityConfig | undefined, updates: Partial<ActivityConfig>, position: number) => {
      if (!familyId) return
      syncActivityPositionToModel(
        familyId,
        {
          childId: updates.childId ?? existing?.childId,
          name: updates.name ?? existing?.name,
          curriculum: updates.curriculum ?? existing?.curriculum,
        },
        position,
      )
    },
    [familyId],
  )

  const addConfig = useCallback(
    async (data: NewActivityConfig) => {
      if (!familyId) return
      await addActivityConfig(familyId, data)
    },
    [familyId],
  )

  const updateConfig = useCallback(
    async (id: string, updates: Partial<ActivityConfig>) => {
      if (!familyId) return
      // Guard reassignment: a workbook can't be moved to (or kept as) 'both'.
      // Fall back to the existing doc's type when the update only touches childId.
      const existing = configsRef.current.find((c) => c.id === id)
      assertWorkbookOwner(
        updates.type ?? existing?.type,
        updates.childId ?? existing?.childId,
      )
      const ref = doc(activityConfigsCollection(familyId), id)
      await updateDoc(ref, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      // FEAT-63 trigger 1b: a manual position edit folds into the learner model
      // when a bridge matches. Fire-and-forget, learnerModels-only.
      if (updates.currentPosition != null) {
        maybeSyncPosition(existing, updates, updates.currentPosition)
      }
    },
    [familyId, maybeSyncPosition],
  )

  const deleteConfig = useCallback(
    async (id: string) => {
      if (!familyId) return
      const ref = doc(activityConfigsCollection(familyId), id)
      await deleteDoc(ref)
    },
    [familyId],
  )

  const markComplete = useCallback(
    async (id: string) => {
      if (!familyId) return
      await completeActivityConfig(familyId, id)
    },
    [familyId],
  )

  const updatePosition = useCallback(
    async (id: string, position: number) => {
      if (!familyId) return
      // The shared writer performs the update AND fires the FEAT-63 trigger-1b
      // learner-model sync, so a position set here and one set from a chat
      // confirm card fold into the model identically.
      await setActivityConfigPosition(
        familyId,
        id,
        position,
        configsRef.current.find((c) => c.id === id),
      )
    },
    [familyId],
  )

  const reorder = useCallback(
    async (reordered: ActivityConfig[]) => {
      if (!familyId) return
      const batch = writeBatch(db)
      const now = new Date().toISOString()
      for (let i = 0; i < reordered.length; i++) {
        const ref = doc(activityConfigsCollection(familyId), reordered[i].id)
        batch.update(ref, { sortOrder: i + 1, updatedAt: now })
      }
      await batch.commit()
    },
    [familyId],
  )

  return {
    configs,
    loading,
    error,
    addConfig,
    updateConfig,
    deleteConfig,
    markComplete,
    updatePosition,
    reorder,
  }
}

/**
 * Find matching activity config by curriculum name (for scan → position updates).
 * Returns the config ID if found, null otherwise.
 */
export function findActivityConfigByCurriculum(
  configs: ActivityConfig[],
  curriculumName: string,
): ActivityConfig | null {
  const needle = curriculumName.toLowerCase()
  return (
    configs.find((c) => {
      if (!c.scannable) return false
      const configName = (c.name ?? '').toLowerCase()
      const configCurriculum = (c.curriculum ?? '').toLowerCase()
      return (
        configName.includes(needle) ||
        needle.includes(configName) ||
        configCurriculum.includes(needle) ||
        needle.includes(configCurriculum)
      )
    }) ?? null
  )
}
