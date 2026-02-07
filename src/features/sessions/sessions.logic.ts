import type { Session } from '../../core/types/domain'
import { SessionResult } from '../../core/types/enums'
import type { StreamId } from '../../core/types/enums'

/**
 * Check if a stream qualifies for level-up: 3 consecutive "hit" sessions
 * at the same rung with same or less support.
 */
export const checkLevelUp = (
  sessions: Session[],
  streamLadderId: string,
  targetRungOrder: number,
): boolean => {
  const relevant = sessions
    .filter(
      (s) =>
        s.ladderId === streamLadderId &&
        s.targetRungOrder === targetRungOrder &&
        s.result === SessionResult.Hit,
    )
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  if (relevant.length < 3) return false

  // Check the 3 most recent are consecutive hits (no miss/near in between)
  const allForRung = sessions
    .filter(
      (s) =>
        s.ladderId === streamLadderId && s.targetRungOrder === targetRungOrder,
    )
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const lastThree = allForRung.slice(0, 3)
  return lastThree.every((s) => s.result === SessionResult.Hit)
}

/**
 * Find all streams where the child is a level-up candidate.
 */
export const findLevelUpCandidates = (
  sessions: Session[],
  childId: string,
  streamLadderIds: Array<{ streamId: StreamId; ladderId: string; currentRung: number }>,
): Array<{ streamId: StreamId; ladderId: string; currentRung: number }> => {
  const childSessions = sessions.filter((s) => s.childId === childId)
  return streamLadderIds.filter(({ ladderId, currentRung }) =>
    checkLevelUp(childSessions, ladderId, currentRung),
  )
}

/**
 * Count the current "showed up" streak — consecutive days with at least one session.
 */
export const calculateStreak = (sessions: Session[], childId: string): number => {
  const childSessions = sessions.filter((s) => s.childId === childId)
  const dates = [
    ...new Set(childSessions.map((s) => s.date)),
  ].sort((a, b) => b.localeCompare(a))

  if (dates.length === 0) return 0

  const today = new Date().toISOString().slice(0, 10)
  // Streak must include today or yesterday
  if (dates[0] !== today) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    if (dates[0] !== yesterdayStr) return 0
  }

  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const curr = new Date(dates[i])
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
    if (Math.round(diffDays) === 1) {
      streak++
    } else {
      break
    }
  }

  return streak
}

/**
 * Count results for a given stream/rung in a date range.
 */
export const countResults = (
  sessions: Session[],
  childId: string,
  ladderId: string,
  targetRungOrder: number,
  startDate: string,
  endDate: string,
): { hits: number; nears: number; misses: number } => {
  const relevant = sessions.filter(
    (s) =>
      s.childId === childId &&
      s.ladderId === ladderId &&
      s.targetRungOrder === targetRungOrder &&
      s.date >= startDate &&
      s.date <= endDate,
  )
  return {
    hits: relevant.filter((s) => s.result === SessionResult.Hit).length,
    nears: relevant.filter((s) => s.result === SessionResult.Near).length,
    misses: relevant.filter((s) => s.result === SessionResult.Miss).length,
  }
}

export const resultEmoji = (result: SessionResult): string => {
  if (result === SessionResult.Hit) return '\u2714\uFE0F'
  if (result === SessionResult.Near) return '\u25B3'
  return '\u2716'
}

export const resultLabel = (result: SessionResult): string => {
  if (result === SessionResult.Hit) return 'Hit'
  if (result === SessionResult.Near) return 'Near'
  return 'Miss'
}
