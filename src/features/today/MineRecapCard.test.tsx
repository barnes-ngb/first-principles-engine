import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MineRecapCard from './MineRecapCard'
import { isScoreyFallbackSummary } from './mineRecap.logic'
import type { EvaluationSession } from '../../core/types/evaluation'

function makeSession(overrides: Partial<EvaluationSession> = {}): EvaluationSession {
  return {
    childId: 'c1',
    domain: 'reading',
    status: 'complete',
    messages: [],
    findings: [
      { skill: 'Short vowel /a/', status: 'mastered', evidence: 'e', testedAt: '' },
      { skill: 'Blends bl/cl', status: 'emerging', evidence: 'e', testedAt: '' },
      { skill: 'Digraph /sh/', status: 'not-yet', evidence: 'e', testedAt: '' },
      { skill: 'Untested skill', status: 'not-tested', evidence: 'e', testedAt: '' },
    ],
    recommendations: [
      { priority: 2, skill: 'Blends', action: 'Practice blends with Lego words', duration: '10m', frequency: 'daily' },
      { priority: 1, skill: 'Digraphs', action: 'Read a decodable with /sh/ words', duration: '10m', frequency: 'daily' },
    ],
    summary: 'A calm, encouraging look at what he explored.',
    evaluatedAt: '2026-07-03T10:00:00.000Z',
    ...overrides,
  }
}

/** Assert none of the charter-forbidden score signals appear in the rendered card. */
function expectNoScoreSignals() {
  const body = document.body.textContent ?? ''
  expect(body).not.toMatch(/\d+\s*\/\s*\d+/) // correct/total
  expect(body).not.toMatch(/\d+\s*%/) // percentage
  expect(body).not.toMatch(/reached level/i)
  expect(body).not.toMatch(/level\s*\d+/i) // level-as-score
}

describe('MineRecapCard', () => {
  it('renders strengths, working-on, and suggestions (no score signals)', () => {
    render(<MineRecapCard session={makeSession()} childName="Lincoln" />)

    expect(screen.getByText('Lincoln explored the Reading Mine')).toBeInTheDocument()
    expect(screen.getByText('Showing strength')).toBeInTheDocument()
    expect(screen.getByText('Short vowel /a/')).toBeInTheDocument()
    expect(screen.getByText('Working on')).toBeInTheDocument()
    expect(screen.getByText('Blends bl/cl')).toBeInTheDocument()
    expect(screen.getByText('Digraph /sh/')).toBeInTheDocument()
    // not-tested findings are omitted
    expect(screen.queryByText('Untested skill')).toBeNull()
    // Suggestions render, priority-sorted (priority 1 first)
    expect(screen.getByText('Read a decodable with /sh/ words')).toBeInTheDocument()
    expect(screen.getByText('Practice blends with Lego words')).toBeInTheDocument()

    expectNoScoreSignals()
  })

  it('uses a plain no-shame line instead of the score-y fallback summary', () => {
    render(
      <MineRecapCard
        session={makeSession({
          summary: 'Interactive reading quest: 4/6 correct, reached level 3',
        })}
        childName="Lincoln"
      />,
    )
    expect(
      screen.getByText('Lincoln spent time exploring reading in the Knowledge Mine.'),
    ).toBeInTheDocument()
    expectNoScoreSignals()
  })

  it('renders the AI summary when it is not the score-y fallback', () => {
    render(<MineRecapCard session={makeSession()} childName="London" />)
    expect(
      screen.getByText('A calm, encouraging look at what he explored.'),
    ).toBeInTheDocument()
  })

  it('is per-child clean — works for London with his own name', () => {
    render(<MineRecapCard session={makeSession({ domain: 'math' })} childName="London" />)
    expect(screen.getByText('London explored the Math Mine')).toBeInTheDocument()
  })

  it('hides after dismiss', () => {
    render(<MineRecapCard session={makeSession()} childName="Lincoln" />)
    fireEvent.click(screen.getByLabelText('Dismiss recap'))
    expect(screen.queryByText('Lincoln explored the Reading Mine')).toBeNull()
  })
})

describe('isScoreyFallbackSummary', () => {
  it('flags the client fallback and score-y strings', () => {
    expect(isScoreyFallbackSummary(undefined)).toBe(true)
    expect(isScoreyFallbackSummary('')).toBe(true)
    expect(isScoreyFallbackSummary('Interactive math quest: 3/5 correct, reached level 2')).toBe(true)
    expect(isScoreyFallbackSummary('He got 80% of the questions.')).toBe(true)
    expect(isScoreyFallbackSummary('Reached level 4 today.')).toBe(true)
  })

  it('accepts a genuine no-shame AI summary', () => {
    expect(isScoreyFallbackSummary('He leaned into tricky blends with real persistence.')).toBe(false)
  })
})

describe('MineRecapCard is parent-view only', () => {
  it('is mounted by TodayPage (parent) and never by the kid view', () => {
    const dir = `${process.cwd()}/src/features/today`
    const todaySrc = readFileSync(`${dir}/TodayPage.tsx`, 'utf8')
    const kidSrc = readFileSync(`${dir}/KidTodayView.tsx`, 'utf8')
    // Parent shell renders the recap; the kid view early-returns before it and
    // never imports it.
    expect(todaySrc).toMatch(/MineRecapCard/)
    expect(kidSrc).not.toMatch(/MineRecapCard/)
  })
})
