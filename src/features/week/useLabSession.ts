import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import {
  labSessionDocId,
  labSessionsCollection,
  projectsCollection,
} from '../../core/firebase/firestore'
import type { LabSession } from '../../core/types/domain'
import { EngineStage, LabSessionStatus } from '../../core/types/enums'

export interface UseLabSessionResult {
  /** The lab session for the current child + week + project, or null if none exists. */
  labSession: LabSession | null
  /** True while the initial snapshot is loading. */
  isLoading: boolean
  /** Start or continue a lab session (upsert). */
  startOrContinue: () => Promise<void>
  /** Update mutable fields on the lab session. */
  updateSession: (fields: Partial<Pick<LabSession, 'stage' | 'status' | 'mission' | 'constraints' | 'roles' | 'stageNotes' | 'stageDone' | 'finishWhatChanged' | 'finishNextStep' | 'finishSummary'>>) => Promise<void>
}

/**
 * Real-time listener for a single lab session doc keyed by weekKey + childId + projectId.
 * Re-subscribes whenever childId, weekKey, or projectId changes.
 */
export function useLabSession(childId: string, weekKey: string, projectId?: string): UseLabSessionResult {
  const familyId = useFamilyId()
  const [snapshot, setSnapshot] = useState<{ session: LabSession | null; loaded: boolean }>({
    session: null,
    loaded: false,
  })

  const canSubscribe = Boolean(childId && weekKey && familyId && projectId)

  useEffect(() => {
    if (!canSubscribe) return

    const docId = labSessionDocId(weekKey, childId, projectId)
    const docRef = doc(labSessionsCollection(familyId), docId)

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setSnapshot({ session: { ...snap.data(), id: snap.id }, loaded: true })
        } else {
          setSnapshot({ session: null, loaded: true })
        }
      },
      (err) => {
        console.error('Failed to load lab session', err)
        setSnapshot({ session: null, loaded: true })
      },
    )

    return () => {
      unsubscribe()
      setSnapshot({ session: null, loaded: false })
    }
  }, [familyId, childId, weekKey, projectId, canSubscribe])

  const labSession = canSubscribe ? snapshot.session : null
  const isLoading = canSubscribe ? !snapshot.loaded : false

  const startOrContinue = useCallback(async () => {
    if (!childId || !weekKey || !familyId || !projectId) return

    const docId = labSessionDocId(weekKey, childId, projectId)
    const docRef = doc(labSessionsCollection(familyId), docId)
    const now = new Date().toISOString()

    if (labSession) {
      const updates: Record<string, unknown> = { updatedAt: now }
      if (labSession.status === LabSessionStatus.NotStarted) {
        updates.status = LabSessionStatus.InProgress
      }
      await updateDoc(docRef, updates)
    } else {
      const newSession: Omit<LabSession, 'id'> = {
        childId,
        weekKey,
        dateKey: now.slice(0, 10),
        projectId,
        status: LabSessionStatus.InProgress,
        stage: EngineStage.Wonder,
        createdAt: now,
        updatedAt: now,
      }
      await setDoc(docRef, newSession)
    }

    // Update lastSessionAt on the project
    if (projectId) {
      const projRef = doc(projectsCollection(familyId), projectId)
      await updateDoc(projRef, { lastSessionAt: now, updatedAt: now }).catch(() => {
        // Project may not exist yet (race condition) — ignore
      })
    }
  }, [familyId, childId, weekKey, projectId, labSession])

  const updateSession = useCallback(
    async (fields: Partial<Pick<LabSession, 'stage' | 'status' | 'mission' | 'constraints' | 'roles' | 'stageNotes' | 'stageDone' | 'finishWhatChanged' | 'finishNextStep' | 'finishSummary'>>) => {
      if (!childId || !weekKey || !familyId || !projectId) return

      const docId = labSessionDocId(weekKey, childId, projectId)
      const docRef = doc(labSessionsCollection(familyId), docId)
      await updateDoc(docRef, {
        ...fields,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId, childId, weekKey, projectId],
  )

  return useMemo(
    () => ({ labSession, isLoading, startOrContinue, updateSession }),
    [labSession, isLoading, startOrContinue, updateSession],
  )
}
