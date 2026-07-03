import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { skillSnapshotsCollection, childSkillMapsCollection } from '../../core/firebase/firestore'
import type { Child, SkillSnapshot } from '../../core/types'
import type { ChildSkillMap } from '../../core/curriculum'
import type { CalibrationSource } from './dadLabPrompts'

export interface UseCalibrationSourcesResult {
  /** One `CalibrationSource` per child, in child order. Empty until the first load resolves. */
  sources: CalibrationSource[]
  /** True once a load attempt has resolved (found, absent, or errored) for every child. */
  loaded: boolean
}

/**
 * Load the two per-child calibration join points — `skillSnapshots/{childId}` and
 * `childSkillMaps/{childId}` — for every child, so `buildCalibrationParagraph` has data
 * to work from (ETHOS-04). Read-only; both docs are owned by their writers. A missing or
 * failed doc degrades to `null` and the paragraph builder handles it (no-shame, sparse-native).
 *
 * Interim loader — re-point to the stored `learnerModels/{childId}` doc when FEAT-46 ships.
 */
export function useCalibrationSources(
  familyId: string | undefined,
  children: Child[],
): UseCalibrationSourcesResult {
  const [sources, setSources] = useState<CalibrationSource[]>([])
  const [loaded, setLoaded] = useState(false)
  const childIds = children.map((c) => c.id).join(',')

  useEffect(() => {
    if (!familyId || !children.length) {
      setSources([])
      setLoaded(!familyId ? false : true)
      return
    }
    let cancelled = false
    setLoaded(false)
    async function load() {
      const loadedSources = await Promise.all(
        children.map(async (child): Promise<CalibrationSource> => {
          let snapshot: SkillSnapshot | null = null
          let skillMap: ChildSkillMap | null = null
          try {
            const snap = await getDoc(doc(skillSnapshotsCollection(familyId!), child.id))
            snapshot = snap.exists() ? (snap.data() as SkillSnapshot) : null
          } catch {
            // Non-blocking — treat a failed load as "no snapshot".
          }
          try {
            const mapSnap = await getDoc(doc(childSkillMapsCollection(familyId!), child.id))
            skillMap = mapSnap.exists() ? (mapSnap.data() as ChildSkillMap) : null
          } catch {
            // Non-blocking — treat a failed load as "no skill map".
          }
          return { child, snapshot, skillMap }
        }),
      )
      if (!cancelled) {
        setSources(loadedSources)
        setLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // childIds keys the fetch; `children` is read inside but its identity churns per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, childIds])

  return { sources, loaded }
}
