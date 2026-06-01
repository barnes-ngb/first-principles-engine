import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BuildWordQuestionScreen from './BuildWordQuestion'
import type { BuildWordQuestion, QuestState } from './questTypes'

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
  currentLevel: 3,
  consecutiveCorrect: 0,
  consecutiveWrong: 0,
  levelDownsInARow: 0,
  totalQuestions: 2,
  totalCorrect: 1,
  questionsThisLevel: 1,
  wrongAtFloor: 0,
  startedAt: new Date().toISOString(),
  elapsedSeconds: 30,
}

function makeQuestion(overrides: Partial<BuildWordQuestion> = {}): BuildWordQuestion {
  return {
    id: 'bw_1',
    type: 'build-word',
    level: 3,
    skill: 'phonics.digraphs.sh',
    prompt: 'Build the word you hear!',
    targetWord: 'ship',
    correctAnswer: 'ship',
    tiles: ['sh', 'i', 'p', 'ch', 'a'],
    ...overrides,
  }
}

function renderScreen(props: Partial<React.ComponentProps<typeof BuildWordQuestionScreen>> = {}) {
  const onAnswerWithMethod = vi.fn()
  const onAnswer = vi.fn()
  const onSkip = vi.fn()
  render(
    <BuildWordQuestionScreen
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

describe('BuildWordQuestionScreen', () => {
  // ── The load-bearing constraint: tap/voice only, NEVER a typed field ──
  it('renders NO text-input element for the answer (no-typing constraint)', () => {
    renderScreen()
    expect(document.querySelector('input')).toBeNull()
    expect(document.querySelector('textarea')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('does not display the target word as text (child must build from the sound)', () => {
    renderScreen()
    // "ship" should not appear as a readable stimulus. Tiles ("sh","i","p")
    // are present individually, but the whole word is never rendered.
    expect(screen.queryByText('ship')).toBeNull()
  })

  it('builds the word by tapping tiles in order and checks it on submit', () => {
    const { onAnswerWithMethod } = renderScreen()
    fireEvent.click(screen.getByLabelText('Sound block sh'))
    fireEvent.click(screen.getByLabelText('Sound block i'))
    fireEvent.click(screen.getByLabelText('Sound block p'))
    fireEvent.click(screen.getByRole('button', { name: 'Build the word' }))

    expect(onAnswerWithMethod).toHaveBeenCalledTimes(1)
    expect(onAnswerWithMethod).toHaveBeenCalledWith('ship', 'tile')
  })

  it('lets the child remove a placed tile, then build correctly', () => {
    const { onAnswerWithMethod } = renderScreen()
    // Wrong first tap.
    fireEvent.click(screen.getByLabelText('Sound block ch'))
    // Pull it back out (tap the placed tile).
    fireEvent.click(screen.getByLabelText('Remove ch'))
    // Build the right word.
    fireEvent.click(screen.getByLabelText('Sound block sh'))
    fireEvent.click(screen.getByLabelText('Sound block i'))
    fireEvent.click(screen.getByLabelText('Sound block p'))
    fireEvent.click(screen.getByRole('button', { name: 'Build the word' }))

    expect(onAnswerWithMethod).toHaveBeenCalledWith('ship', 'tile')
  })

  it('reports a mis-built word as-is (scoring/adaptive decide correctness, no shame)', () => {
    const { onAnswerWithMethod } = renderScreen()
    fireEvent.click(screen.getByLabelText('Sound block ch'))
    fireEvent.click(screen.getByLabelText('Sound block i'))
    fireEvent.click(screen.getByLabelText('Sound block p'))
    fireEvent.click(screen.getByRole('button', { name: 'Build the word' }))

    // The screen submits exactly what was built; checkAnswer (tested separately)
    // decides correctness and feeds the existing adaptive logic.
    expect(onAnswerWithMethod).toHaveBeenCalledWith('chip', 'tile')
  })

  it('does not submit when nothing has been built', () => {
    const { onAnswer, onAnswerWithMethod } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Build the word' }))
    expect(onAnswerWithMethod).not.toHaveBeenCalled()
    expect(onAnswer).not.toHaveBeenCalled()
  })
})
