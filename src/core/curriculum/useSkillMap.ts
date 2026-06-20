import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { childSkillMapsCollection, skillSnapshotsCollection } from '../firebase/firestore'
import type { SkillSnapshot } from '../types/evaluation'
import { CURRICULUM_MAPS } from './curriculumMap'
import type { ChildSkillMap, DomainSummary, SkillNodeStatus } from './skillStatus'
import { SkillStatus } from './skillStatus'
import type { CurriculumDomain } from './curriculumMap'
import { initializeSkillMapFromHistory } from './updateSkillMapFromFindings'
import { applyReDerivedMastery } from './deriveWorkingLevelMastery'

interface UseSkillMapResult {
  /** The child's full skill map, or null while loading */
  skillMap: ChildSkillMap | null
  /** Loading state */
  isLoading: boolean
  /** Get status for a specific node */
  getNodeStatus: (nodeId: string) => SkillNodeStatus | undefined
  /** Update status for a single node */
  updateNodeStatus: (
    nodeId: string,
    status: SkillStatus,
    source?: SkillNodeStatus['source'],
    notes?: string,
  ) => Promise<void>
  /** Summary stats per domain */
  domainSummaries: DomainSummary[]
}

/**
 * Read the child's working levels + completed programs and fold the implied
 * mastery into `base`. Persists only the changed nodes (no write when nothing
 * changed). Returns the healed map (or `base` unchanged when there's nothing to
 * apply or the snapshot read fails). Never throws.
 */
async function reDeriveMastery(
  familyId: string,
  childId: string,
  base: ChildSkillMap,
): Promise<ChildSkillMap> {
  try {
    const snapshotRef = doc(skillSnapshotsCollection(familyId), childId)
    const snapshotSnap = await getDoc(snapshotRef)
    if (!snapshotSnap.exists()) return base

    const snapshot = snapshotSnap.data() as SkillSnapshot
    const { skills, changedNodeIds } = applyReDerivedMastery(
      base.skills,
      snapshot.workingLevels,
      snapshot.completedPrograms,
    )

    if (changedNodeIds.length === 0) return base

    const updated: ChildSkillMap = {
      ...base,
      childId,
      skills,
      updatedAt: new Date().toISOString(),
    }
    console.log(
      `[LearningMap] Re-derivation healed ${changedNodeIds.length} node(s) from working levels/programs`,
    )
    const ref = doc(childSkillMapsCollection(familyId), childId)
    await setDoc(ref, JSON.parse(JSON.stringify(updated)), { merge: true })
    return updated
  } catch (err) {
    console.warn('[LearningMap] Re-derivation pass failed (non-fatal)', err)
    return base
  }
}

export function useSkillMap(childId: string): UseSkillMapResult {
  const familyId = useFamilyId()
  const [skillMap, setSkillMap] = useState<ChildSkillMap | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!familyId || !childId) return

    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const ref = doc(childSkillMapsCollection(familyId), childId)
        const snap = await getDoc(ref)
        if (cancelled) return

        // 1) Establish the base map: stored doc, or a one-time init from history.
        let base: ChildSkillMap
        if (snap.exists()) {
          base = { ...(snap.data() as ChildSkillMap), id: snap.id }
        } else {
          try {
            const initialized = await initializeSkillMapFromHistory(familyId, childId)
            if (cancelled) return
            // Persist if we found any data
            if (Object.keys(initialized.skills).length > 0) {
              await setDoc(ref, JSON.parse(JSON.stringify(initialized)))
            }
            base = initialized
          } catch (err) {
            console.warn('[LearningMap] Initialization failed, starting empty', err)
            if (cancelled) return
            base = {
              childId,
              skills: {},
              updatedAt: new Date().toISOString(),
            }
          }
        }

        // 2) Self-healing re-derivation (runs on EVERY load): fold the child's
        // working levels + completed programs into the map as implied mastery.
        // Upgrade-only, manual-frozen, persist-delta-only. Additive to the
        // existing findings path — never downgrades or overrides a manual node.
        const healed = await reDeriveMastery(familyId, childId, base)
        if (cancelled) return
        setSkillMap(healed)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [familyId, childId])

  const getNodeStatus = useCallback(
    (nodeId: string): SkillNodeStatus | undefined => {
      return skillMap?.skills[nodeId]
    },
    [skillMap],
  )

  const updateNodeStatus = useCallback(
    async (
      nodeId: string,
      status: SkillStatus,
      source: SkillNodeStatus['source'] = 'manual',
      notes?: string,
    ) => {
      if (!familyId || !childId) return

      const now = new Date().toISOString()
      const entry: SkillNodeStatus = {
        nodeId,
        status,
        source,
        updatedAt: now,
        ...(notes ? { notes } : {}),
      }

      const updated: ChildSkillMap = {
        childId,
        skills: { ...skillMap?.skills, [nodeId]: entry },
        updatedAt: now,
      }

      setSkillMap(updated)

      const ref = doc(childSkillMapsCollection(familyId), childId)
      await setDoc(ref, updated, { merge: true })
    },
    [familyId, childId, skillMap],
  )

  const domainSummaries: DomainSummary[] = CURRICULUM_MAPS.map((dm) => {
    const total = dm.nodes.length
    let mastered = 0
    let inProgress = 0
    for (const node of dm.nodes) {
      const s = skillMap?.skills[node.id]?.status
      if (s === SkillStatus.Mastered) mastered++
      else if (s === SkillStatus.InProgress) inProgress++
    }
    return {
      domain: dm.domain as CurriculumDomain,
      total,
      mastered,
      inProgress,
      notStarted: total - mastered - inProgress,
    }
  })

  return {
    skillMap,
    isLoading,
    getNodeStatus,
    updateNodeStatus,
    domainSummaries,
  }
}
