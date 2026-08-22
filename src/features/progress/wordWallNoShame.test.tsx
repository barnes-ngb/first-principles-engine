import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PatternSummary from './PatternSummary'
import WordBlock from './WordBlock'

// UX-49 — the Word Wall is the one Progress surface a kid opens himself, and it
// carried the only deficit-graded performance word in the app: "Struggling 🔴",
// deep red, under a HelpStrip that promises no grades. The stored
// `WordMasteryLevel` is unchanged — `'struggling'` is still the key, still what
// `useWordWall` counts. Only what the child reads changed.
//
// These are safety strings: if a future edit puts the grade back, this suite is
// where it should stop.

describe('Word Wall wording is encouragement, not a grade (UX-49)', () => {
  it('renders the pickaxe, not the red dot, on a word still being practiced', () => {
    render(
      <WordBlock word="said" masteryLevel="struggling" correctCount={1} totalAttempts={4} />,
    )
    expect(screen.getByText('⛏️')).toBeInTheDocument()
    expect(screen.queryByText('🔴')).not.toBeInTheDocument()
  })

  it("keeps the other levels' icons untouched", () => {
    const { rerender } = render(
      <WordBlock word="the" masteryLevel="known" correctCount={9} totalAttempts={9} />,
    )
    expect(screen.getByText('✅')).toBeInTheDocument()
    rerender(
      <WordBlock word="was" masteryLevel="emerging" correctCount={4} totalAttempts={7} />,
    )
    expect(screen.getByText('🟡')).toBeInTheDocument()
  })

  it('counts the pattern in "still practicing", never "struggling"', () => {
    render(
      <PatternSummary
        patterns={[
          {
            pattern: 'short-a',
            totalWords: 10,
            knownWords: 4,
            emergingWords: 3,
            strugglingWords: 3,
            notYetWords: 0,
            masteryPercent: 40,
          },
        ]}
      />,
    )
    expect(screen.getByText(/3 still practicing/)).toBeInTheDocument()
    expect(screen.queryByText(/struggling/i)).not.toBeInTheDocument()
  })
})
