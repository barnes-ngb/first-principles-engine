import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import AskMePanel from './AskMePanel'
import { fallbackQuestions } from './askMePanel.logic'
import type { ComprehensionQuestion } from './useComprehensionQuestions'

const QUESTIONS: ComprehensionQuestion[] = [
  { question: 'What happened when the dog ran away?', answer: 'SECRET-ANSWER-recall', type: 'recall' },
  { question: 'Why do you think the dog was scared?', answer: 'SECRET-ANSWER-inference', type: 'inference' },
  { question: 'What was your favorite part?', answer: 'SECRET-ANSWER-opinion', type: 'opinion' },
]

/** No score/evaluation signals may appear on the broadcast surface (charter: no grades). */
function expectNoScoreSignals() {
  const body = document.body.textContent ?? ''
  expect(body).not.toMatch(/\d+\s*\/\s*\d+/) // correct/total
  expect(body).not.toMatch(/\d+\s*%/) // percentage
  expect(body).not.toContain('❌')
  expect(body).not.toContain('✅')
  expect(body).not.toMatch(/answered/i) // answered-count
  expect(body).not.toMatch(/show answer/i)
  expect(body).not.toMatch(/correct/i)
}

describe('AskMePanel', () => {
  it('addresses the asker and renders the questions', () => {
    render(<AskMePanel childName="Lincoln" questions={QUESTIONS} />)

    expect(screen.getByText(/Your turn! Ask Lincoln/)).toBeInTheDocument()
    expect(screen.getByText('What happened when the dog ran away?')).toBeInTheDocument()
    expect(screen.getByText('Why do you think the dog was scared?')).toBeInTheDocument()
    expect(screen.getByText('What was your favorite part?')).toBeInTheDocument()
  })

  it('never renders the answer text or any score signal', () => {
    render(<AskMePanel childName="Lincoln" questions={QUESTIONS} />)

    expect(screen.queryByText(/SECRET-ANSWER/)).not.toBeInTheDocument()
    expectNoScoreSignals()
  })

  it('orders opinion → inference → recall', () => {
    render(<AskMePanel childName="Lincoln" questions={QUESTIONS} />)

    const rendered = screen
      .getAllByText(/dog|favorite/)
      .map((el) => el.textContent ?? '')
    expect(rendered[0]).toBe('What was your favorite part?') // opinion first
    expect(rendered[1]).toBe('Why do you think the dog was scared?') // inference
    expect(rendered[2]).toBe('What happened when the dog ran away?') // recall last
  })

  it('falls back to three static prompts when there are no questions', () => {
    render(<AskMePanel childName="London" questions={[]} loading={false} />)

    const fallbacks = fallbackQuestions('London')
    expect(fallbacks).toHaveLength(3)
    for (const f of fallbacks) {
      expect(screen.getByText(f)).toBeInTheDocument()
    }
    expectNoScoreSignals()
  })

  it('shows fallbacks (never blank) while still loading', () => {
    render(<AskMePanel childName="London" questions={[]} loading />)
    expect(screen.getByText('Ask London: what was your favorite page?')).toBeInTheDocument()
  })

  it('uses a neutral pronoun when the child name is empty', () => {
    render(<AskMePanel childName="" questions={[]} />)
    expect(screen.getByText(/Your turn! Ask them/)).toBeInTheDocument()
    expect(screen.getByText('Ask them: what happens next?')).toBeInTheDocument()
  })
})
