import type {
  ConceptualBlock,
  ConceptualBlockStatus,
} from '../types/evaluation'

/**
 * Slugify a skill/block name into a stable ID.
 * "Short vowel i vs e discrimination" → "short-vowel-i-vs-e-discrimination"
 */
export function generateBlockId(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown-block'
}

/**
 * Return the effective lifecycle status for a block.
 * New `status` field wins; otherwise fall back to legacy `recommendation`.
 */
export function effectiveStatus(block: ConceptualBlock): ConceptualBlockStatus {
  return block.status ?? block.recommendation
}

/**
 * Append an evidence snippet to an existing evidence string, de-duplicating.
 */
function appendEvidence(existing: string | undefined, addition: string | undefined): string | undefined {
  if (!addition) return existing
  if (!existing) return addition
  if (existing.includes(addition)) return existing
  return `${existing} | ${addition}`
}

/**
 * Merge two specific-word lists, preserving order and dropping duplicates.
 */
function mergeUnique(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a?.length && !b?.length) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of [...(a ?? []), ...(b ?? [])]) {
    const key = s.trim()
    if (!key) continue
    if (seen.has(key.toLowerCase())) continue
    seen.add(key.toLowerCase())
    out.push(key)
  }
  return out.length > 0 ? out : undefined
}

/**
 * Merge a new block (or partial block) into an existing blocks array.
 *
 * - If an entry with the same `id` already exists, update it in place:
 *   append evidence, merge specificWords, bump sessionCount, refresh
 *   lastReinforcedAt/lastSource. A new ADDRESS_NOW signal on a RESOLVING
 *   block regresses it back to ADDRESS_NOW.
 * - If no matching entry exists, append the new block.
 * - Never removes blocks (resolution is a status change, not deletion).
 *
 * Returns a new array. Does not mutate inputs.
 */
export function mergeBlock(
  existing: ConceptualBlock[],
  incoming: Partial<ConceptualBlock> & { id: string; name?: string },
): ConceptualBlock[] {
  const now = incoming.lastReinforcedAt ?? incoming.detectedAt ?? new Date().toISOString()
  const idx = existing.findIndex((b) => b.id === incoming.id)

  if (idx === -1) {
    // New block — fill in lifecycle defaults.
    const created: ConceptualBlock = {
      name: incoming.name ?? incoming.id,
      affectedSkills: incoming.affectedSkills ?? (incoming.name ? [incoming.name] : []),
      recommendation:
        incoming.recommendation ??
        (incoming.status === 'DEFER' ? 'DEFER' : 'ADDRESS_NOW'),
      rationale: incoming.rationale ?? '',
      strategies: incoming.strategies,
      deferNote: incoming.deferNote,
      detectedAt: incoming.detectedAt ?? now,
      evaluationSessionId: incoming.evaluationSessionId ?? '',
      id: incoming.id,
      status: incoming.status ?? incoming.recommendation ?? 'ADDRESS_NOW',
      evidence: incoming.evidence,
      firstDetectedAt: incoming.firstDetectedAt ?? incoming.detectedAt ?? now,
      lastReinforcedAt: now,
      sessionCount: incoming.sessionCount ?? 1,
      source: incoming.source,
      lastSource: incoming.lastSource ?? incoming.source,
      specificWords: incoming.specificWords,
      specificQuestions: incoming.specificQuestions,
    }
    return [...existing, created]
  }

  // Existing block — reinforce.
  const prev = existing[idx]
  const prevStatus = effectiveStatus(prev)
  const incomingStatus = incoming.status ?? incoming.recommendation

  let nextStatus: ConceptualBlockStatus = prevStatus
  if (incomingStatus === 'ADDRESS_NOW' && (prevStatus === 'RESOLVING' || prevStatus === 'RESOLVED')) {
    // Regression — new wrong signal reopens the block.
    nextStatus = 'ADDRESS_NOW'
  } else if (incomingStatus && prevStatus !== 'RESOLVED') {
    // For non-resolved blocks, incoming status can update.
    nextStatus = incomingStatus
  }

  const merged: ConceptualBlock = {
    ...prev,
    // Preserve stable fields
    name: prev.name,
    affectedSkills: mergeUnique(prev.affectedSkills, incoming.affectedSkills) ?? prev.affectedSkills,
    recommendation: nextStatus === 'DEFER' ? 'DEFER' : 'ADDRESS_NOW',
    rationale: incoming.rationale || prev.rationale,
    strategies: incoming.strategies?.length ? incoming.strategies : prev.strategies,
    deferNote: incoming.deferNote ?? prev.deferNote,
    detectedAt: prev.detectedAt,
    evaluationSessionId: incoming.evaluationSessionId || prev.evaluationSessionId,
    id: prev.id,
    status: nextStatus,
    evidence: appendEvidence(prev.evidence, incoming.evidence),
    firstDetectedAt: prev.firstDetectedAt ?? prev.detectedAt,
    lastReinforcedAt: now,
    sessionCount: (prev.sessionCount ?? 1) + 1,
    resolvedAt: nextStatus === 'RESOLVED' ? (prev.resolvedAt ?? now) : undefined,
    source: prev.source ?? incoming.source,
    lastSource: incoming.source ?? incoming.lastSource ?? prev.lastSource ?? prev.source,
    specificWords: mergeUnique(prev.specificWords, incoming.specificWords),
    specificQuestions: mergeUnique(prev.specificQuestions, incoming.specificQuestions),
  }

  const next = existing.slice()
  next[idx] = merged
  return next
}

export interface SessionBlockEvidence {
  /** Stable block ID (from generateBlockId). */
  blockId: string
  /** Number of questions answered correctly for this block's skill in the session. */
  correctCount: number
  /** Total questions posed on this block's skill in the session. */
  totalCount: number
}

/** Minimum cumulative correct count to transition ADDRESS_NOW → RESOLVING. */
export const RESOLVING_THRESHOLD = 3
/** Minimum cumulative correct count to transition RESOLVING → RESOLVED. */
export const RESOLVED_THRESHOLD = 5
/** Minimum sessions observed before RESOLVED can fire. */
export const RESOLVED_MIN_SESSIONS = 2

/**
 * Advance the lifecycle of each block given fresh session evidence.
 *
 * Rules:
 *  - ADDRESS_NOW → RESOLVING when cumulative correctAttempts ≥ RESOLVING_THRESHOLD.
 *  - RESOLVING → RESOLVED when cumulative correctAttempts ≥ RESOLVED_THRESHOLD,
 *    sessionCount ≥ RESOLVED_MIN_SESSIONS, AND no wrong answers in this session.
 *  - RESOLVING → ADDRESS_NOW if any wrong answers hit the skill this session.
 *  - RESOLVED blocks are immutable (stays RESOLVED, keeps resolvedAt).
 *  - DEFER is not auto-transitioned by this helper.
 *
 * Never removes blocks. Accumulates `correctAttempts` / `totalAttempts`
 * on each block as evidence lands.
 *
 * Input blocks are not mutated; returns a new array.
 */
export function updateBlockerLifecycle(
  blocks: ConceptualBlock[],
  sessionEvidence: SessionBlockEvidence[],
  now: string = new Date().toISOString(),
): ConceptualBlock[] {
  if (!blocks.length) return blocks
  const evByBlockId = new Map<string, SessionBlockEvidence>()
  for (const ev of sessionEvidence) {
    if (!ev.blockId) continue
    evByBlockId.set(ev.blockId, ev)
  }

  return blocks.map((block) => {
    if (!block.id) return block
    const ev = evByBlockId.get(block.id)
    if (!ev) return block

    const prevStatus = effectiveStatus(block)
    if (prevStatus === 'RESOLVED') return block
    if (prevStatus === 'DEFER') {
      // DEFER is left alone — it can transition only through explicit re-evaluation.
      const nextCorrect = (block.correctAttempts ?? 0) + ev.correctCount
      const nextTotal = (block.totalAttempts ?? 0) + ev.totalCount
      if (nextCorrect === (block.correctAttempts ?? 0) && nextTotal === (block.totalAttempts ?? 0)) {
        return block
      }
      return { ...block, correctAttempts: nextCorrect, totalAttempts: nextTotal }
    }

    const cumCorrect = (block.correctAttempts ?? 0) + ev.correctCount
    const cumTotal = (block.totalAttempts ?? 0) + ev.totalCount
    const hadWrong = ev.totalCount > ev.correctCount
    const sessionCount = block.sessionCount ?? 1

    let nextStatus: ConceptualBlockStatus = prevStatus
    let resolvedAt = block.resolvedAt

    if (prevStatus === 'RESOLVING' && hadWrong) {
      // Regression — reopen.
      nextStatus = 'ADDRESS_NOW'
    } else if (prevStatus === 'RESOLVING'
      && cumCorrect >= RESOLVED_THRESHOLD
      && sessionCount >= RESOLVED_MIN_SESSIONS
      && !hadWrong) {
      nextStatus = 'RESOLVED'
      resolvedAt = resolvedAt ?? now
    } else if (prevStatus === 'ADDRESS_NOW' && cumCorrect >= RESOLVING_THRESHOLD && !hadWrong) {
      nextStatus = 'RESOLVING'
    }

    return {
      ...block,
      status: nextStatus,
      // DEFER is handled earlier; nextStatus here is only ADDRESS_NOW/RESOLVING/RESOLVED.
      recommendation: 'ADDRESS_NOW',
      correctAttempts: cumCorrect,
      totalAttempts: cumTotal,
      resolvedAt,
      lastReinforcedAt: now,
    }
  })
}

/**
 * Group a list of quest session questions into per-block evidence for lifecycle.
 * Maps each question's `skill` → blockId (via generateBlockId) and aggregates counts.
 */
export function sessionEvidenceFromQuestions(
  questions: Array<{ skill?: string; correct?: boolean; skipped?: boolean; flaggedAsError?: boolean }>,
): SessionBlockEvidence[] {
  const counts = new Map<string, { correct: number; total: number }>()
  for (const q of questions) {
    if (q.flaggedAsError) continue
    if (q.skipped) continue
    if (!q.skill) continue
    const id = generateBlockId(q.skill)
    const entry = counts.get(id) ?? { correct: 0, total: 0 }
    entry.total += 1
    if (q.correct) entry.correct += 1
    counts.set(id, entry)
  }
  const out: SessionBlockEvidence[] = []
  for (const [blockId, { correct, total }] of counts.entries()) {
    out.push({ blockId, correctCount: correct, totalCount: total })
  }
  return out
}
