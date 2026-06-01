import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BuildSentenceQuestionScreen from './BuildSentenceQuestion'
import { SENTENCE_CAPITAL_TILE, SENTENCE_PERIOD_TILE } from './buildTheSentence'
import type { BuildSentenceQuestion, QuestState } from './questTypes'

// TTS uses the Web Speech API, which jsdom doesn't implement — stub it so the
// component renders. We don't assert on speech here; the UI contract is taps.
vi.mock('../../core/hooks/useTTS', () => ({
  useTTS: () => ({
    speak: vi.fn(),
    speakQueue: vi.fn(),
    cancel: vi.fn(),
    isSpeaking: false,
    isSupported: true,
  }),
}))

const questState: QuestState = {
  currentLevel: 2,
  consecutiveCorrect: 0,
  consecutiveWrong: 0,
  levelDownsInARow: 0,
  totalQuestions: 4,
  totalCorrect: 2,
  questionsThisLevel: 1,
  wrongAtFloor: 0,
  startedAt: new Date().toISOString(),
  elapsedSeconds: 60,
}

function makeQuestion(overrides: Partial<BuildSentenceQuestion> = {}): BuildSentenceQuestion {
  return {
    id: 'bs_1',
    type: 'build-sentence',
    level: 2,
    skill: 'writing.composition.sentence',
    prompt: 'Listen, then build the sentence — tap the words in order!',
    targetSentence: 'The cat ran.',
    correctAnswer: 'The cat ran.',
    // Scrambled words + capital + period.
    tiles: ['ran', SENTENCE_CAPITAL_TILE, 'the', SENTENCE_PERIOD_TILE, 'cat'],
    audioCue: 'The cat ran.',
    source: 'generated',
    ...overrides,
  }
}

function renderScreen(props: Partial<React.ComponentProps<typeof BuildSentenceQuestionScreen>> = {}) {
  const onAnswerWithMethod = vi.fn()
  const onAnswer = vi.fn()
  const onSkip = vi.fn()
  render(
    <BuildSentenceQuestionScreen
      question={makeQuestion()}
      questState={questState}
      consecutiveWrong={0}
      onAnswer={onAnswer}
      onAnswerWithMethod={onAnswerWithMethod}
      onSkip={onSkip}
      {...props}
    />,
  )
  return { onAnswer, onAnswerWithMethod, onSkip }
}

describe('BuildSentenceQuestionScreen', () => {
  // ── The load-bearing constraint: tap only, NEVER a typed field ──
  it('renders NO text-input element for the answer (no-typing constraint)', () => {
    renderScreen()
    expect(document.querySelector('input')).toBeNull()
    expect(document.querySelector('textarea')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('does not display the target sentence as text (child builds from the spoken cue)', () => {
    renderScreen()
    expect(screen.queryByText('The cat ran.')).toBeNull()
  })

  it('presents a capital tile and a period tile (bundled mechanics)', () => {
    renderScreen()
    expect(screen.getByLabelText('Capital tile')).toBeTruthy()
    expect(screen.getByLabelText('Period tile')).toBeTruthy()
  })

  it('builds the sentence by tapping tiles in order, incl. capital + period', () => {
    const { onAnswerWithMethod } = renderScreen()
    fireEvent.click(screen.getByLabelText('Capital tile'))
    fireEvent.click(screen.getByLabelText('Word tile the'))
    fireEvent.click(screen.getByLabelText('Word tile cat'))
    fireEvent.click(screen.getByLabelText('Word tile ran'))
    fireEvent.click(screen.getByLabelText('Period tile'))
    fireEvent.click(screen.getByRole('button', { name: 'Build the sentence' }))

    expect(onAnswerWithMethod).toHaveBeenCalledTimes(1)
    expect(onAnswerWithMethod).toHaveBeenCalledWith('The cat ran.', 'tile')
  })

  it('lets the child remove a placed tile, then build correctly', () => {
    const { onAnswerWithMethod } = renderScreen()
    // Wrong first tap.
    fireEvent.click(screen.getByLabelText('Word tile ran'))
    // Pull it back out (tap the placed tile).
    fireEvent.click(screen.getByLabelText('Remove Word tile ran'))
    // Build the right order.
    fireEvent.click(screen.getByLabelText('Capital tile'))
    fireEvent.click(screen.getByLabelText('Word tile the'))
    fireEvent.click(screen.getByLabelText('Word tile cat'))
    fireEvent.click(screen.getByLabelText('Word tile ran'))
    fireEvent.click(screen.getByLabelText('Period tile'))
    fireEvent.click(screen.getByRole('button', { name: 'Build the sentence' }))

    expect(onAnswerWithMethod).toHaveBeenCalledWith('The cat ran.', 'tile')
  })

  it('reports a mis-built sentence as-is (scoring decides correctness, no shame)', () => {
    const { onAnswerWithMethod } = renderScreen()
    // Forget the capital → "the cat ran." — submitted faithfully.
    fireEvent.click(screen.getByLabelText('Word tile the'))
    fireEvent.click(screen.getByLabelText('Word tile cat'))
    fireEvent.click(screen.getByLabelText('Word tile ran'))
    fireEvent.click(screen.getByLabelText('Period tile'))
    fireEvent.click(screen.getByRole('button', { name: 'Build the sentence' }))
    expect(onAnswerWithMethod).toHaveBeenCalledWith('the cat ran.', 'tile')
  })

  it('does not submit when nothing has been built', () => {
    const { onAnswer, onAnswerWithMethod } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Build the sentence' }))
    expect(onAnswerWithMethod).not.toHaveBeenCalled()
    expect(onAnswer).not.toHaveBeenCalled()
  })
})
