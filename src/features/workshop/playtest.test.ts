import { describe, it, expect } from 'vitest'
import type { PlaytestFeedback } from '../../core/types'
import { PlaytestReaction } from '../../core/types/workshop'
import { computeSummary } from './playtestUtils'

const makeFeedback = (
  cardId: string,
  reaction: PlaytestFeedback['reaction'],
  comment?: string,
): PlaytestFeedback => ({
  cardId,
  reaction,
  comment,
  timestamp: new Date().toISOString(),
})

describe('computeSummary', () => {
  it('counts all reactions correctly', () => {
    const feedback: PlaytestFeedback[] = [
      makeFeedback('c1', PlaytestReaction.Good),
      makeFeedback('c2', PlaytestReaction.Good),
      makeFeedback('c3', PlaytestReaction.Confusing, 'What does this mean?'),
      makeFeedback('c4', PlaytestReaction.TooHard, 'Too many steps'),
      makeFeedback('c5', PlaytestReaction.TooEasy),
      makeFeedback('c6', PlaytestReaction.Change, 'Make it about dragons'),
      makeFeedback('c7', PlaytestReaction.Good),
    ]

    const summary = computeSummary(feedback)

    expect(summary.totalCards).toBe(7)
    expect(summary.good).toBe(3)
    expect(summary.confusing).toBe(1)
    expect(summary.tooHard).toBe(1)
    expect(summary.tooEasy).toBe(1)
    expect(summary.change).toBe(1)
  })

  it('handles all-good feedback', () => {
    const feedback: PlaytestFeedback[] = [
      makeFeedback('c1', PlaytestReaction.Good),
      makeFeedback('c2', PlaytestReaction.Good),
    ]

    const summary = computeSummary(feedback)

    expect(summary.totalCards).toBe(2)
    expect(summary.good).toBe(2)
    expect(summary.confusing).toBe(0)
    expect(summary.tooHard).toBe(0)
    expect(summary.tooEasy).toBe(0)
    expect(summary.change).toBe(0)
  })

  it('handles empty feedback', () => {
    const summary = computeSummary([])

    expect(summary.totalCards).toBe(0)
    expect(summary.good).toBe(0)
  })

  it('handles all-flagged feedback', () => {
    const feedback: PlaytestFeedback[] = [
      makeFeedback('c1', PlaytestReaction.Confusing),
      makeFeedback('c2', PlaytestReaction.TooHard),
      makeFeedback('c3', PlaytestReaction.TooEasy),
      makeFeedback('c4', PlaytestReaction.Change),
    ]

    const summary = computeSummary(feedback)

    expect(summary.totalCards).toBe(4)
    expect(summary.good).toBe(0)
    expect(summary.confusing).toBe(1)
    expect(summary.tooHard).toBe(1)
    expect(summary.tooEasy).toBe(1)
    expect(summary.change).toBe(1)
  })
})

describe('PlaytestReaction const', () => {
  it('has all expected values', () => {
    expect(PlaytestReaction.Good).toBe('good')
    expect(PlaytestReaction.Confusing).toBe('confusing')
    expect(PlaytestReaction.TooHard).toBe('too-hard')
    expect(PlaytestReaction.TooEasy).toBe('too-easy')
    expect(PlaytestReaction.Change).toBe('change')
  })
})

describe('PlaytestFeedback type', () => {
  it('supports optional comment and audioUrl', () => {
    const minimal: PlaytestFeedback = {
      cardId: 'card-1',
      reaction: PlaytestReaction.Good,
      timestamp: '2026-03-23T00:00:00Z',
    }
    expect(minimal.comment).toBeUndefined()
    expect(minimal.audioUrl).toBeUndefined()

    const full: PlaytestFeedback = {
      cardId: 'card-2',
      reaction: PlaytestReaction.Confusing,
      comment: 'I do not understand this',
      audioUrl: 'https://example.com/audio.webm',
      timestamp: '2026-03-23T00:00:00Z',
    }
    expect(full.comment).toBe('I do not understand this')
    expect(full.audioUrl).toBe('https://example.com/audio.webm')
  })
})
