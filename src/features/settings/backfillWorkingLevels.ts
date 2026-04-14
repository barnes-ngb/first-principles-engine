/**
 * One-time backfill for workingLevels on skillSnapshots.
 *
 * For each child, tries to derive per-mode working levels from:
 *   1. Recent evaluation findings (phonics/comprehension only)
 *   2. Recent quest session history (all modes)
 *
 * Only writes modes that are currently absent. Never overwrites existing data.
 */

import {
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'

import type {
  EvaluationSession,
  SkillSnapshot,
  WorkingLevel,
  WorkingLevels,
} from '../../core/types/evaluation'
import type { QuestMode, SessionQuestion } from '../quest/questTypes'
import {
  childrenCollection,
  evaluationSessionsCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import {
  canOverwriteWorkingLevel,
  computeWorkingLevelFromSession,
  deriveWorkingLevelFromEvaluation,
} from '../quest/workingLevels'

// ── Types ────────────────────────────────────────────────────────

export interface BackfillModeWritten {
  mode: 'phonics' | 'comprehension' | 'math'
  level: number
  source: string
  evidence: string
}

export interface BackfillModeSkipped {
  mode: 'phonics' | 'comprehension' | 'math'
  reason: string
}

export interface BackfillResult {
  childId: string
  childName: string
  modesWritten: BackfillModeWritten[]
  modesSkipped: BackfillModeSkipped[]
}

/** EvaluationSession with optional interactive/quest fields merged in */
export interface EvalSessionWithExtras extends EvaluationSession {
  sessionType?: string
  questMode?: QuestMode
  questions?: SessionQuestion[]
  finalLevel?: number
}

// ── Constants ────────────────────────────────────────────────────

const BACKFILL_MODES: Array<'phonics' | 'comprehension' | 'math'> = [
  'phonics',
  'comprehension',
  'math',
]

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const MAX_SESSIONS_PER_QUERY = 10

/** Maps quest mode to evaluation domain for Firestore queries */
const MODE_TO_EVAL_DOMAIN: Record<string, string> = {
  phonics: 'reading',
  comprehension: 'reading',
  math: 'math',
}

// ── Pure logic (exported for testing) ────────────────────────────

/**
 * Pure decision function: for a single mode, determines whether to write
 * a working level and what value, using pre-loaded session data.
 *
 * Does NOT touch Firestore — safe for unit tests.
 */
export function computeBackfillForMode(
  mode: 'phonics' | 'comprehension' | 'math',
  currentWorkingLevel: WorkingLevel | undefined,
  /** All sessions for the relevant domain, sorted desc by evaluatedAt */
  domainSessions: EvalSessionWithExtras[],
  thirtyDaysAgo: string,
): { action: 'write'; workingLevel: WorkingLevel } | { action: 'skip'; reason: string } {
  // Already set → skip
  if (currentWorkingLevel) {
    return { action: 'skip', reason: 'already set' }
  }

  // Respect manual protection (redundant when undefined, but keeps contract consistent)
  if (!canOverwriteWorkingLevel(currentWorkingLevel)) {
    return { action: 'skip', reason: 'manual override protected' }
  }

  // Step 1: Try evaluation data (non-interactive, complete sessions)
  // deriveWorkingLevelFromEvaluation only supports phonics and comprehension
  if (mode !== 'math') {
    for (const session of domainSessions) {
      if (session.evaluatedAt < thirtyDaysAgo) break
      if (session.status !== 'complete') continue
      if (session.sessionType === 'interactive' || session.sessionType === 'fluency') continue
      if (!session.findings || session.findings.length === 0) continue

      const derived = deriveWorkingLevelFromEvaluation(session.findings, mode)
      if (derived) return { action: 'write', workingLevel: derived }
    }
  }

  // Step 2: Fall back to quest history (interactive sessions with matching questMode)
  for (const session of domainSessions) {
    if (session.evaluatedAt < thirtyDaysAgo) break
    if (session.sessionType !== 'interactive') continue
    if (session.questMode !== mode) continue
    if (!session.questions || session.questions.length === 0 || session.finalLevel == null) continue

    const derived = computeWorkingLevelFromSession(
      session.questions,
      session.finalLevel,
      mode,
    )
    if (derived) return { action: 'write', workingLevel: derived }
  }

  return { action: 'skip', reason: 'no evidence available' }
}

// ── Firestore orchestration ──────────────────────────────────────

export async function backfillWorkingLevels(
  familyId: string,
): Promise<BackfillResult[]> {
  const childrenSnap = await getDocs(childrenCollection(familyId))
  const children = childrenSnap.docs.map((d) => ({
    id: d.id,
    name: (d.data() as { name?: string }).name ?? d.id,
  }))

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
  const results: BackfillResult[] = []

  for (const child of children) {
    const result: BackfillResult = {
      childId: child.id,
      childName: child.name,
      modesWritten: [],
      modesSkipped: [],
    }

    // Load skill snapshot
    const snapshotRef = doc(skillSnapshotsCollection(familyId), child.id)
    const snapshotSnap = await getDoc(snapshotRef)
    const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
      ? snapshotSnap.data()
      : {}
    const currentWorkingLevels = existing.workingLevels ?? {}

    // Cache domain queries (reading domain serves both phonics + comprehension)
    const domainCache = new Map<string, EvalSessionWithExtras[]>()

    const loadDomainSessions = async (
      domain: string,
    ): Promise<EvalSessionWithExtras[]> => {
      if (domainCache.has(domain)) return domainCache.get(domain)!

      const q = query(
        evaluationSessionsCollection(familyId),
        where('childId', '==', child.id),
        where('domain', '==', domain),
        orderBy('evaluatedAt', 'desc'),
        limit(MAX_SESSIONS_PER_QUERY),
      )
      const snap = await getDocs(q)
      const sessions = snap.docs.map(
        (d) => d.data() as EvalSessionWithExtras,
      )
      domainCache.set(domain, sessions)
      return sessions
    }

    let workingLevelsChanged = false
    const updatedWorkingLevels: WorkingLevels = { ...currentWorkingLevels }

    for (const mode of BACKFILL_MODES) {
      const domain = MODE_TO_EVAL_DOMAIN[mode]
      const domainSessions = await loadDomainSessions(domain)

      const decision = computeBackfillForMode(
        mode,
        currentWorkingLevels[mode],
        domainSessions,
        thirtyDaysAgo,
      )

      if (decision.action === 'write') {
        updatedWorkingLevels[mode] = decision.workingLevel
        workingLevelsChanged = true
        result.modesWritten.push({
          mode,
          level: decision.workingLevel.level,
          source: decision.workingLevel.source,
          evidence: decision.workingLevel.evidence ?? '',
        })
      } else {
        result.modesSkipped.push({ mode, reason: decision.reason })
      }
    }

    // Write updated snapshot only if something changed
    if (workingLevelsChanged) {
      const updated = {
        ...existing,
        childId: child.id,
        workingLevels: updatedWorkingLevels,
        updatedAt: new Date().toISOString(),
      }
      // Remove id field (doc ID, not a data field)
      delete (updated as Record<string, unknown>).id
      await setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)))
    }

    results.push(result)
  }

  return results
}
