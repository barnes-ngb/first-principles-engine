import type { PlaytestFeedback, PlaytestSummary } from '../../core/types'
import { PlaytestReaction } from '../../core/types/workshop'

export function computeSummary(feedback: PlaytestFeedback[]): PlaytestSummary {
  const summary: PlaytestSummary = {
    totalCards: feedback.length,
    good: 0,
    confusing: 0,
    tooHard: 0,
    tooEasy: 0,
    change: 0,
  }
  for (const f of feedback) {
    switch (f.reaction) {
      case PlaytestReaction.Good:
        summary.good++
        break
      case PlaytestReaction.Confusing:
        summary.confusing++
        break
      case PlaytestReaction.TooHard:
        summary.tooHard++
        break
      case PlaytestReaction.TooEasy:
        summary.tooEasy++
        break
      case PlaytestReaction.Change:
        summary.change++
        break
    }
  }
  return summary
}
