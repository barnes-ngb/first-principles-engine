import type {
  LadderCardDefinition,
  LadderProgress,
  LadderSessionEntry,
} from '../../core/types/domain'
import {
  SessionSymbol,
  SupportLevel,
  SUPPORT_LEVEL_ORDER,
} from '../../core/types/enums'

/** Compare support levels. Returns <0 if a < b, 0 if equal, >0 if a > b. */
export function compareSupportLevel(a: SupportLevel, b: SupportLevel): number {
  return SUPPORT_LEVEL_ORDER.indexOf(a) - SUPPORT_LEVEL_ORDER.indexOf(b)
}

/** Next rung ID after the given one, or undefined if already at the last rung. */
export function nextRungId(
  currentRungId: string,
  ladder: LadderCardDefinition,
): string | undefined {
  const idx = ladder.rungs.findIndex((r) => r.rungId === currentRungId)
  if (idx < 0 || idx >= ladder.rungs.length - 1) return undefined
  return ladder.rungs[idx + 1].rungId
}

/** Create a fresh progress record for a child + ladder (starts at R0). */
export function createInitialProgress(
  childId: string,
  ladder: LadderCardDefinition,
): LadderProgress {
  return {
    childId,
    ladderKey: ladder.ladderKey,
    currentRungId: ladder.rungs[0].rungId,
    streakCount: 0,
    lastSupportLevel: SupportLevel.None,
    history: [],
  }
}

export interface ApplySessionInput {
  dateKey: string
  result: SessionSymbol
  supportLevel: SupportLevel
  note?: string
}

export interface ApplySessionResult {
  progress: LadderProgress
  promoted: boolean
  newRungId?: string
}

/**
 * Pure function: apply a session result to ladder progress.
 *
 * Rules:
 * - ✔ with same or less support → streak++
 * - ✔ with MORE support → streak = 1 (still a pass, but resets streak)
 * - △ or ✖ → streak = 0
 * - When streak reaches 3 → promote to next rung, reset streak
 */
export function applySession(
  prev: LadderProgress,
  input: ApplySessionInput,
  ladder: LadderCardDefinition,
): ApplySessionResult {
  const entry: LadderSessionEntry = {
    dateKey: input.dateKey,
    rungId: prev.currentRungId,
    supportLevel: input.supportLevel,
    result: input.result,
    note: input.note,
  }

  let newStreak: number
  let newSupportLevel: SupportLevel = input.supportLevel

  if (input.result === SessionSymbol.Pass) {
    const cmp = compareSupportLevel(input.supportLevel, prev.lastSupportLevel)
    if (prev.streakCount === 0) {
      // First session or after a reset — any pass starts at 1
      newStreak = 1
    } else if (cmp <= 0) {
      // Same or less support → increment streak
      newStreak = prev.streakCount + 1
    } else {
      // More support than last time → reset to 1
      newStreak = 1
    }
  } else {
    // △ or ✖ → reset streak
    newStreak = 0
    // Keep lastSupportLevel from prev for comparison on next pass
    newSupportLevel = prev.lastSupportLevel
  }

  let promoted = false
  let currentRungId = prev.currentRungId
  let streakCount = newStreak

  if (newStreak >= 3) {
    const next = nextRungId(prev.currentRungId, ladder)
    if (next) {
      promoted = true
      currentRungId = next
      streakCount = 0
      // Record promotion in history
      entry.note = entry.note
        ? `${entry.note} [PROMOTED to ${next}]`
        : `[PROMOTED to ${next}]`
    }
    // If already at last rung, streak stays at 3 (maxed out)
  }

  return {
    progress: {
      ...prev,
      currentRungId,
      streakCount,
      lastSupportLevel: newSupportLevel,
      history: [...prev.history, entry],
    },
    promoted,
    newRungId: promoted ? currentRungId : undefined,
  }
}
