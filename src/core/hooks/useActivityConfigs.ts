import { useCallback, useEffect, useState } from 'react'
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
import { activityConfigsCollection, db } from '../firebase/firestore'
import { ensureDefaultActivityConfigs, migrateToActivityConfigs } from '../firebase/migrateActivityConfigs'
import type { ActivityConfig } from '../types'
import type { ActivityFrequency, ActivityType, SubjectBucket } from '../types/enums'

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

export interface NewActivityConfig {
  name: string
  type: ActivityType
  subjectBucket: SubjectBucket
  defaultMinutes: number
  frequency: ActivityFrequency
  childId: string | 'both'
  sortOrder: number
  scannable: boolean
  curriculum?: string
  totalUnits?: number
  currentPosition?: number
  unitLabel?: string
  notes?: string
}

export function useActivityConfigs(childId: string): UseActivityConfigsResult {
  const familyId = useFamilyId()
  const [configs, setConfigs] = useState<ActivityConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [migrationDone, setMigrationDone] = useState(false)

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

  const addConfig = useCallback(
    async (data: NewActivityConfig) => {
      if (!familyId) return
      const now = new Date().toISOString()
      const ref = doc(activityConfigsCollection(familyId))
      const batch = writeBatch(db)
      batch.set(ref, {
        ...data,
        id: ref.id,
        completed: false,
        createdAt: now,
        updatedAt: now,
      })
      await batch.commit()
    },
    [familyId],
  )

  const updateConfig = useCallback(
    async (id: string, updates: Partial<ActivityConfig>) => {
      if (!familyId) return
      const ref = doc(activityConfigsCollection(familyId), id)
      await updateDoc(ref, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId],
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
      const now = new Date().toISOString()
      const ref = doc(activityConfigsCollection(familyId), id)
      await updateDoc(ref, {
        completed: true,
        completedDate: now,
        updatedAt: now,
      })
    },
    [familyId],
  )

  const updatePosition = useCallback(
    async (id: string, position: number) => {
      if (!familyId) return
      const ref = doc(activityConfigsCollection(familyId), id)
      await updateDoc(ref, {
        currentPosition: position,
        updatedAt: new Date().toISOString(),
      })
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
