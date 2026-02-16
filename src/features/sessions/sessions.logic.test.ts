import { describe, expect, it } from 'vitest'

import { SessionResult, StreamId } from '../../core/types/enums'
import type { Session } from '../../core/types/domain'
import {
  checkLevelUp,
  calculateStreak,
  countResults,
  resultEmoji,
  resultLabel,
} from './sessions.logic'

const makeSession = (
  overrides: Partial<Session> & { result: Session['result'] },
): Session => ({
  childId: 'child1',
  date: '2026-02-16',
  streamId: StreamId.Reading,
  ladderId: 'ladder1',
  targetRungOrder: 1,
  createdAt: new Date().toISOString(),
  ...overrides,
})

// ─── checkLevelUp ────────────────────────────────────────────────────────────

describe('checkLevelUp', () => {
  it('returns true when last 3 sessions at same rung are hits', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-14T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-15T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-16T10:00:00Z' }),
    ]
    expect(checkLevelUp(sessions, 'ladder1', 1)).toBe(true)
  })

  it('returns false with fewer than 3 hits', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-15T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-16T10:00:00Z' }),
    ]
    expect(checkLevelUp(sessions, 'ladder1', 1)).toBe(false)
  })

  it('returns false when a miss is among the last 3', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-14T10:00:00Z' }),
      makeSession({ result: SessionResult.Miss, createdAt: '2026-02-15T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-16T10:00:00Z' }),
    ]
    expect(checkLevelUp(sessions, 'ladder1', 1)).toBe(false)
  })

  it('returns false when a near is among the last 3', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-14T10:00:00Z' }),
      makeSession({ result: SessionResult.Near, createdAt: '2026-02-15T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, createdAt: '2026-02-16T10:00:00Z' }),
    ]
    expect(checkLevelUp(sessions, 'ladder1', 1)).toBe(false)
  })

  it('ignores sessions for different ladders', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, ladderId: 'ladder1', createdAt: '2026-02-14T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, ladderId: 'other', createdAt: '2026-02-15T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, ladderId: 'ladder1', createdAt: '2026-02-16T10:00:00Z' }),
    ]
    expect(checkLevelUp(sessions, 'ladder1', 1)).toBe(false)
  })

  it('ignores sessions at different rung orders', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, targetRungOrder: 1, createdAt: '2026-02-14T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, targetRungOrder: 2, createdAt: '2026-02-15T10:00:00Z' }),
      makeSession({ result: SessionResult.Hit, targetRungOrder: 1, createdAt: '2026-02-16T10:00:00Z' }),
    ]
    expect(checkLevelUp(sessions, 'ladder1', 1)).toBe(false)
  })
})

// ─── calculateStreak ─────────────────────────────────────────────────────────

describe('calculateStreak', () => {
  it('returns 0 when no sessions exist', () => {
    expect(calculateStreak([], 'child1')).toBe(0)
  })

  it('returns 0 when most recent session is older than yesterday', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, date: '2026-01-01' }),
    ]
    expect(calculateStreak(sessions, 'child1')).toBe(0)
  })

  it('counts consecutive days', () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    const dayBefore = new Date()
    dayBefore.setDate(dayBefore.getDate() - 2)
    const dayBeforeStr = dayBefore.toISOString().slice(0, 10)

    const sessions = [
      makeSession({ result: SessionResult.Hit, date: today }),
      makeSession({ result: SessionResult.Hit, date: yesterdayStr }),
      makeSession({ result: SessionResult.Hit, date: dayBeforeStr }),
    ]
    expect(calculateStreak(sessions, 'child1')).toBe(3)
  })

  it('ignores sessions from other children', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ result: SessionResult.Hit, date: today, childId: 'other' }),
    ]
    expect(calculateStreak(sessions, 'child1')).toBe(0)
  })
})

// ─── countResults ────────────────────────────────────────────────────────────

describe('countResults', () => {
  it('counts hits, nears, and misses in date range', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, date: '2026-02-10' }),
      makeSession({ result: SessionResult.Hit, date: '2026-02-11' }),
      makeSession({ result: SessionResult.Near, date: '2026-02-12' }),
      makeSession({ result: SessionResult.Miss, date: '2026-02-13' }),
      makeSession({ result: SessionResult.Hit, date: '2026-02-20' }), // outside range
    ]
    const result = countResults(sessions, 'child1', 'ladder1', 1, '2026-02-10', '2026-02-15')
    expect(result).toEqual({ hits: 2, nears: 1, misses: 1 })
  })

  it('returns zeros when no sessions match', () => {
    const result = countResults([], 'child1', 'ladder1', 1, '2026-02-01', '2026-02-28')
    expect(result).toEqual({ hits: 0, nears: 0, misses: 0 })
  })

  it('filters by childId', () => {
    const sessions = [
      makeSession({ result: SessionResult.Hit, date: '2026-02-10', childId: 'child1' }),
      makeSession({ result: SessionResult.Hit, date: '2026-02-10', childId: 'child2' }),
    ]
    const result = countResults(sessions, 'child1', 'ladder1', 1, '2026-02-01', '2026-02-28')
    expect(result).toEqual({ hits: 1, nears: 0, misses: 0 })
  })
})

// ─── resultEmoji / resultLabel ───────────────────────────────────────────────

describe('resultEmoji', () => {
  it('returns check mark for Hit', () => {
    expect(resultEmoji(SessionResult.Hit)).toBe('\u2714\uFE0F')
  })

  it('returns triangle for Near', () => {
    expect(resultEmoji(SessionResult.Near)).toBe('\u25B3')
  })

  it('returns cross for Miss', () => {
    expect(resultEmoji(SessionResult.Miss)).toBe('\u2716')
  })
})

describe('resultLabel', () => {
  it('returns correct labels', () => {
    expect(resultLabel(SessionResult.Hit)).toBe('Hit')
    expect(resultLabel(SessionResult.Near)).toBe('Near')
    expect(resultLabel(SessionResult.Miss)).toBe('Miss')
  })
})
