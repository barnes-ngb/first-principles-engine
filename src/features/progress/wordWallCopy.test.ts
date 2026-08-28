import { describe, expect, it } from 'vitest'

import { patternProgressLine } from './wordWallCopy'
import type { PatternSummary } from './useWordWall'

const pattern = (over: Partial<PatternSummary> = {}): PatternSummary => ({
  pattern: 'cvc',
  totalWords: 10,
  knownWords: 0,
  emergingWords: 0,
  strugglingWords: 0,
  notYetWords: 10,
  masteryPercent: 0,
  ...over,
})

describe('patternProgressLine — UX-49', () => {
  it('never renders a bare 0% on the kid-facing wall', () => {
    const line = patternProgressLine(pattern())
    expect(line).toBe('Not started yet')
    expect(line).not.toContain('%')
  })

  it('drops the zero percent but keeps the work actually in flight', () => {
    const line = patternProgressLine(pattern({ strugglingWords: 3, emergingWords: 1 }))
    expect(line).toBe('3 still practicing · 1 emerging')
    expect(line).not.toContain('0%')
  })

  it('renders a real percentage unchanged', () => {
    expect(patternProgressLine(pattern({ masteryPercent: 60, knownWords: 6 }))).toBe('60%')
    expect(
      patternProgressLine(pattern({ masteryPercent: 60, knownWords: 6, strugglingWords: 2 })),
    ).toBe('60% · 2 still practicing')
  })
})
