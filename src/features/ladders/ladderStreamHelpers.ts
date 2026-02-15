import type {
  LadderCardDefinition,
  LadderProgress,
  LadderSessionEntry,
} from '../../core/types/domain'
import type { StreamKey } from '../../core/types/enums'

/** Filter ladder definitions that have a streamKey assigned. */
export function getStreamLadders(
  ladders: LadderCardDefinition[],
): LadderCardDefinition[] {
  return ladders.filter(
    (l): l is LadderCardDefinition & { streamKey: StreamKey } =>
      l.streamKey != null && l.streamKey !== 'other',
  )
}

/** Display label for each stream key. */
export const streamKeyLabel: Record<StreamKey, string> = {
  decode_read: 'Decode \u2192 Read',
  spell_write: 'Spell \u2192 Write',
  speak_explain: 'Speak \u2192 Explain',
  other: 'Other',
}

/** Emoji icon for each stream key. */
export const streamKeyIcon: Record<StreamKey, string> = {
  decode_read: '\uD83D\uDCD6',
  spell_write: '\u270F\uFE0F',
  speak_explain: '\uD83D\uDDE3\uFE0F',
  other: '\uD83D\uDCCC',
}

/** Filter history entries within a date range (inclusive). */
export function sessionsInRange(
  history: LadderSessionEntry[],
  weekStart: string,
  weekEnd: string,
): LadderSessionEntry[] {
  return history.filter((e) => e.dateKey >= weekStart && e.dateKey <= weekEnd)
}

export interface LadderStreamSummary {
  ladderKey: string
  streamKey: StreamKey
  title: string
  currentRungId: string
  currentRungName: string
  streakCount: number
  weekSessionCount: number
  weekPasses: number
  weekPartials: number
  weekMisses: number
}

/** Build a summary for the scoreboard from a ladder definition and its progress. */
export function buildLadderStreamSummary(
  ladder: LadderCardDefinition & { streamKey: StreamKey },
  progress: LadderProgress,
  weekStart: string,
  weekEnd: string,
): LadderStreamSummary {
  const weekSessions = sessionsInRange(progress.history, weekStart, weekEnd)
  const currentRung = ladder.rungs.find((r) => r.rungId === progress.currentRungId)

  return {
    ladderKey: ladder.ladderKey,
    streamKey: ladder.streamKey,
    title: ladder.title,
    currentRungId: progress.currentRungId,
    currentRungName: currentRung?.name ?? progress.currentRungId,
    streakCount: progress.streakCount,
    weekSessionCount: weekSessions.length,
    weekPasses: weekSessions.filter((s) => s.result === '\u2714').length,
    weekPartials: weekSessions.filter((s) => s.result === '\u25B3').length,
    weekMisses: weekSessions.filter((s) => s.result === '\u2716').length,
  }
}
