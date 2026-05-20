/**
 * Functions to update the Learning Map (childSkillMaps) from evaluation findings.
 *
 * Called from:
 * - useSkillMap initialization (backfill from existing evaluationSessions)
 * - Quest endSession (after saving session)
 * - EvaluateChatPage handleSaveAndApply (after saving findings)
 * - Program completion (mark all linked nodes as mastered)
 */

import { doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

import { childSkillMapsCollection, evaluationSessionsCollection, skillSnapshotsCollection } from '../firebase/firestore'
import type { EvaluationFinding, EvaluationSession, SkillSnapshot } from '../types/evaluation'
import type { ChildSkillMap, SkillNodeStatus } from './skillStatus'
import { SkillStatus } from './skillStatus'
import { findingStatusToSkillStatus, getNodesForProgram, mapFindingToNode } from './mapFindingToNode'

/**
 * Apply an array of findings to a skill map, returning the updated skills record.
 * Higher-status wins (mastered > in-progress > not-started).
 */
function applyFindings(
  existingSkills: Record<string, SkillNodeStatus>,
  findings: EvaluationFinding[],
  source: SkillNodeStatus['source'] = 'evaluation',
): Record<string, SkillNodeStatus> {
  const skills = { ...existingSkills }
  const now = new Date().toISOString()
  let mappedCount = 0
  const unmapped: string[] = []

  for (const finding of findings) {
    const nodeId = mapFindingToNode(finding.skill)
    if (!nodeId) {
      unmapped.push(finding.skill)
      continue
    }

    const newStatus = findingStatusToSkillStatus(finding.status)
    if (!newStatus) continue

    mappedCount++

    const existing = skills[nodeId]
    // Only upgrade status, never downgrade
    if (existing) {
      if (existing.status === SkillStatus.Mastered) continue
      if (existing.status === SkillStatus.InProgress && newStatus === 'in-progress') continue
    }

    skills[nodeId] = {
      nodeId,
      status: newStatus,
      source,
      updatedAt: finding.testedAt || now,
      notes: finding.evidence,
    }
  }

  if (unmapped.length > 0) {
    console.warn('[LearningMap] Unmapped findings:', unmapped)
  }
  if (mappedCount > 0) {
    console.log(`[LearningMap] Mapped ${mappedCount} findings to curriculum nodes`)
  }

  return skills
}

/**
 * Update the Learning Map from a set of findings (e.g. after a quest or evaluation).
 * Creates the document if it doesn't exist.
 */
export async function updateSkillMapFromFindings(
  familyId: string,
  childId: string,
  findings: EvaluationFinding[],
): Promise<void> {
  if (!familyId || !childId || findings.length === 0) return

  const ref = doc(childSkillMapsCollection(familyId), childId)
  const snap = await getDoc(ref)
  const existing: Partial<ChildSkillMap> = snap.exists() ? snap.data() : {}

  const updatedSkills = applyFindings(existing.skills || {}, findings)

  const updated: ChildSkillMap = {
    childId,
    skills: updatedSkills,
    updatedAt: new Date().toISOString(),
  }

  await setDoc(ref, JSON.parse(JSON.stringify(updated)), { merge: true })
}

/**
 * Initialize the Learning Map by reading all existing evaluation sessions
 * and the skill snapshot's completedPrograms. Called once when the skill map
 * document doesn't exist yet.
 */
export async function initializeSkillMapFromHistory(
  familyId: string,
  childId: string,
): Promise<ChildSkillMap> {
  console.log('[LearningMap] Initializing curriculum state for', childId)

  let skills: Record<string, SkillNodeStatus> = {}

  // 1) Read all evaluation sessions for this child
  try {
    const sessionsQuery = query(
      evaluationSessionsCollection(familyId),
      where('childId', '==', childId),
    )
    const sessionsSnap = await getDocs(sessionsQuery)
    const sessions = sessionsSnap.docs.map((d) => d.data() as EvaluationSession)

    console.log('[LearningMap] Found', sessions.length, 'evaluation sessions')

    // Collect all findings, sorted by date so latest wins
    const allFindings = sessions
      .flatMap((s) => s.findings || [])
      .sort((a, b) => (a.testedAt || '').localeCompare(b.testedAt || ''))

    skills = applyFindings(skills, allFindings)
  } catch (err) {
    console.warn('[LearningMap] Failed to load evaluation sessions for initialization', err)
  }

  // 2) Read skill snapshot for completedPrograms
  try {
    const snapshotRef = doc(skillSnapshotsCollection(familyId), childId)
    const snapshotSnap = await getDoc(snapshotRef)
    if (snapshotSnap.exists()) {
      const snapshot = snapshotSnap.data() as SkillSnapshot
      const programs = snapshot.completedPrograms || []
      if (programs.length > 0) {
        console.log('[LearningMap] Found completed programs:', programs)
        const now = new Date().toISOString()
        for (const programId of programs) {
          const nodeIds = getNodesForProgram(programId)
          for (const nodeId of nodeIds) {
            skills[nodeId] = {
              nodeId,
              status: SkillStatus.Mastered,
              source: 'program',
              updatedAt: now,
              notes: `Completed program: ${programId}`,
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[LearningMap] Failed to load skill snapshot for initialization', err)
  }

  const mappedCount = Object.keys(skills).length
  const masteredCount = Object.values(skills).filter((s) => s.status === SkillStatus.Mastered).length
  const inProgressCount = Object.values(skills).filter((s) => s.status === SkillStatus.InProgress).length
  console.log(`[LearningMap] Initialized: ${mappedCount} nodes mapped (${masteredCount} mastered, ${inProgressCount} in-progress)`)

  return {
    childId,
    skills,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Mark a program as complete on the Learning Map.
 * Sets all curriculum nodes linked to the program to mastered.
 */
export async function markProgramCompleteOnSkillMap(
  familyId: string,
  childId: string,
  programId: string,
): Promise<void> {
  if (!familyId || !childId || !programId) return

  const nodeIds = getNodesForProgram(programId)
  if (nodeIds.length === 0) {
    console.warn(`[LearningMap] No curriculum nodes linked to program: ${programId}`)
    return
  }

  const ref = doc(childSkillMapsCollection(familyId), childId)
  const snap = await getDoc(ref)
  const existing: Partial<ChildSkillMap> = snap.exists() ? snap.data() : {}
  const skills = { ...(existing.skills || {}) }

  const now = new Date().toISOString()
  for (const nodeId of nodeIds) {
    skills[nodeId] = {
      nodeId,
      status: SkillStatus.Mastered,
      source: 'program',
      updatedAt: now,
      notes: `Completed program: ${programId}`,
    }
  }

  console.log(`[LearningMap] Marked ${nodeIds.length} nodes as mastered for program: ${programId}`)

  const updated: ChildSkillMap = {
    childId,
    skills,
    updatedAt: now,
  }

  await setDoc(ref, JSON.parse(JSON.stringify(updated)), { merge: true })
}
