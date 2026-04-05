import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useFamilyId } from '../auth/useAuth'
import { childSkillMapsCollection } from '../firebase/firestore'
import { CURRICULUM_MAPS } from './curriculumMap'
import type { ChildSkillMap, DomainSummary, SkillNodeStatus } from './skillStatus'
import { SkillStatus } from './skillStatus'
import type { CurriculumDomain } from './curriculumMap'

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
        if (snap.exists()) {
          setSkillMap({ ...snap.data(), id: snap.id })
        } else {
          setSkillMap({
            childId,
            skills: {},
            updatedAt: new Date().toISOString(),
          })
        }
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
