import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { getDocs, query, where } from 'firebase/firestore'
import { artifactsCollection } from '../../core/firebase/firestore'
import type { Artifact } from '../../core/types'

type EvidenceState = { scope: string; visit: number; artifacts: Artifact[]; failed: boolean }
type ReadErrorNotice = { text: string; severity: 'error' }

/** Parent Today's read/display handoff. No artifact or hours persistence. */
export function useTodayArtifacts(
  familyId: string,
  childId: string,
  today: string,
  onError: (notice: ReadErrorNotice) => void,
) {
  const scope = JSON.stringify([familyId, childId, today])
  const [state, setState] = useState<EvidenceState>({ scope, visit: 0, artifacts: [], failed: false })
  // Hide the old array during render, before the new query can settle. A visit
  // never comes back: A → B → A cannot accept a callback from the first A.
  if (state.scope !== scope) {
    setState({ scope, visit: state.visit + 1, artifacts: [], failed: false })
  }
  const visit = state.visit
  const liveVisit = useRef(visit)
  const request = useRef(0)
  useEffect(() => {
    liveVisit.current = visit
    return () => { liveVisit.current = -1 }
  }, [visit])

  const matchingRows = useCallback((rows: Artifact[]) => {
    const seen = new Set<string>()
    return rows.filter((row) => {
      // An absent day/child is not evidence of attribution. Family is carried
      // by this callback's originating visit, since artifacts have no familyId.
      if (row.childId !== childId || row.dayLogId !== today || !row.id || seen.has(row.id)) return false
      seen.add(row.id)
      return true
    })
  }, [childId, today])

  const loadTodayArtifacts = useCallback(() => {
    if (!familyId || !childId || !today || liveVisit.current !== visit) return
    const sequence = ++request.current
    const q = query(
      artifactsCollection(familyId),
      where('dayLogId', '==', today),
      where('childId', '==', childId),
    )
    getDocs(q).then((snapshot) => {
      if (liveVisit.current !== visit || request.current !== sequence) return
      // Keep the collection converter's id semantics, as the original reader
      // did: data() already supplies the id (including a stored legacy id).
      const artifacts = matchingRows(snapshot.docs.map((docSnapshot) => docSnapshot.data()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setState((prev) => prev.visit === visit ? { ...prev, artifacts, failed: false } : prev)
    }).catch((err) => {
      if (liveVisit.current !== visit || request.current !== sequence) return
      console.error('Failed to load artifacts', err)
      setState((prev) => prev.visit === visit ? { ...prev, artifacts: [], failed: true } : prev)
      onError({ text: 'Could not load artifacts.', severity: 'error' })
    })
  }, [familyId, childId, today, visit, matchingRows, onError])

  // Retain the capture card's existing callback API. Each invocation holds the
  // originating family/child/day visit, even if a save finishes after a switch.
  const setTodayArtifacts: Dispatch<SetStateAction<Artifact[]>> = useCallback((update) => {
    if (!familyId || !childId || !today || liveVisit.current !== visit) return
    setState((prev) => prev.visit === visit ? {
      ...prev,
      artifacts: matchingRows(typeof update === 'function' ? update(prev.artifacts) : update),
    } : prev)
    // UX-438/441: a local save is not a successful day read. Keep any failure
    // until a read succeeds. Starting this read also invalidates pre-save reads,
    // so an older snapshot cannot erase the optimistic row or overwrite it.
    loadTodayArtifacts()
  }, [familyId, childId, today, visit, matchingRows, loadTodayArtifacts])

  useEffect(() => { loadTodayArtifacts() }, [loadTodayArtifacts])

  return {
    todayArtifacts: state.scope === scope ? state.artifacts : [],
    todayArtifactsFailed: state.scope === scope && state.failed,
    setTodayArtifacts,
    loadTodayArtifacts,
  }
}
