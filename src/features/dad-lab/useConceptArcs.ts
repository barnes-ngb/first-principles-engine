import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { conceptArcsCollection } from '../../core/firebase/firestore'
import { useChildren } from '../../core/hooks/useChildren'
import type { ArcStep, ConceptArc } from '../../core/types'
import { ArcOrigin } from '../../core/types/enums'

import { markStepDone, setActiveStep, type StepDoneMeta } from './arcSteps'

/** Fields an owner supplies when creating a manual arc. */
export interface CreateArcInput {
  title: string
  domainLabel?: string
  steps: ArcStep[]
  /** Defaults to every child when omitted (DATA-04 — both children). */
  childIds?: string[]
  narrativeHook?: string
}

/** Fields that can be edited on an existing arc. */
export type UpdateArcInput = Partial<
  Pick<ConceptArc, 'title' | 'domainLabel' | 'steps' | 'childIds' | 'narrativeHook'>
>

/**
 * Reader + writers for the family's Concept Arcs. The list is family-scoped and
 * filters out archived arcs. All writes go through addDoc / updateDoc — never a
 * bare setDoc.
 */
export function useConceptArcs() {
  const familyId = useFamilyId()
  const { children } = useChildren()
  const [arcs, setArcs] = useState<ConceptArc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(conceptArcsCollection(familyId), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
      setArcs(all.filter((a) => !a.archivedAt))
      setLoading(false)
    })
    return unsubscribe
  }, [familyId])

  const createArc = useCallback(
    async (input: CreateArcInput): Promise<string> => {
      const now = new Date().toISOString()
      const childIds =
        input.childIds && input.childIds.length > 0
          ? input.childIds
          : children.map((c) => c.id)
      const arc: ConceptArc = {
        title: input.title.trim() || 'Untitled Arc',
        domainLabel: input.domainLabel?.trim() || undefined,
        childIds,
        steps: input.steps,
        createdFrom: ArcOrigin.OwnerAuthored,
        narrativeHook: input.narrativeHook?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      }
      const ref = await addDoc(conceptArcsCollection(familyId), arc)
      return ref.id
    },
    [familyId, children],
  )

  const updateArc = useCallback(
    async (arcId: string, patch: UpdateArcInput): Promise<void> => {
      const ref = doc(conceptArcsCollection(familyId), arcId)
      await updateDoc(ref, { ...patch, updatedAt: new Date().toISOString() })
    },
    [familyId],
  )

  const archiveArc = useCallback(
    async (arcId: string): Promise<void> => {
      const now = new Date().toISOString()
      const ref = doc(conceptArcsCollection(familyId), arcId)
      await updateDoc(ref, { archivedAt: now, updatedAt: now })
    },
    [familyId],
  )

  /** Mark a step done (auto-advancing the active pointer) and persist. */
  const completeStep = useCallback(
    async (arc: ConceptArc, index: number, meta?: StepDoneMeta): Promise<void> => {
      if (!arc.id) return
      await updateArc(arc.id, { steps: markStepDone(arc.steps, index, meta) })
    },
    [updateArc],
  )

  /** Make a step the single active step and persist. */
  const activateStep = useCallback(
    async (arc: ConceptArc, index: number): Promise<void> => {
      if (!arc.id) return
      await updateArc(arc.id, { steps: setActiveStep(arc.steps, index) })
    },
    [updateArc],
  )

  return {
    arcs,
    loading,
    createArc,
    updateArc,
    archiveArc,
    completeStep,
    activateStep,
  } as const
}
