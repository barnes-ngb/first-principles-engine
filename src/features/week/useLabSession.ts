import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import {
  labSessionDocId,
  labSessionsCollection,
} from '../../core/firebase/firestore'
import type { LabSession } from '../../core/types/domain'
import { EngineStage, LabSessionStatus } from '../../core/types/enums'

export interface UseLabSessionResult {
  /** The lab session for the current child + week, or null if none exists. */
  labSession: LabSession | null
  /** True while the initial snapshot is loading. */
  isLoading: boolean
  /** Start or continue a lab session (upsert). */
  startOrContinue: () => Promise<void>
  /** Update mutable fields on the lab session. */
  updateSession: (fields: Partial<Pick<LabSession, 'stage' | 'status' | 'mission' | 'constraints' | 'roles' | 'stageNotes'>>) => Promise<void>
}

/**
 * Real-time listener for a single lab session doc keyed by weekKey + childId.
 * Re-subscribes whenever childId or weekKey changes.
 */
export function useLabSession(childId: string, weekKey: string): UseLabSessionResult {
  const familyId = useFamilyId()
  const [snapshot, setSnapshot] = useState<{ session: LabSession | null; loaded: boolean }>({
    session: null,
    loaded: false,
  })

  const canSubscribe = Boolean(childId && weekKey && familyId)

  useEffect(() => {
    if (!canSubscribe) return

    const docId = labSessionDocId(weekKey, childId)
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
  }, [familyId, childId, weekKey, canSubscribe])

  const labSession = canSubscribe ? snapshot.session : null
  const isLoading = canSubscribe ? !snapshot.loaded : false

  const startOrContinue = useCallback(async () => {
    if (!childId || !weekKey || !familyId) return

    const docId = labSessionDocId(weekKey, childId)
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
        status: LabSessionStatus.InProgress,
        stage: EngineStage.Wonder,
        createdAt: now,
        updatedAt: now,
      }
      await setDoc(docRef, newSession)
    }
  }, [familyId, childId, weekKey, labSession])

  const updateSession = useCallback(
    async (fields: Partial<Pick<LabSession, 'stage' | 'status' | 'mission' | 'constraints' | 'roles' | 'stageNotes'>>) => {
      if (!childId || !weekKey || !familyId) return

      const docId = labSessionDocId(weekKey, childId)
      const docRef = doc(labSessionsCollection(familyId), docId)
      await updateDoc(docRef, {
        ...fields,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId, childId, weekKey],
  )

  return useMemo(
    () => ({ labSession, isLoading, startOrContinue, updateSession }),
    [labSession, isLoading, startOrContinue, updateSession],
  )
}
