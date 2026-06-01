import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import QuestQuestionScreen from './ReadingQuest'
import type { MultipleChoiceQuestion, QuestState } from './questTypes'

// TTS uses the Web Speech API (not in jsdom). Stub it; capture `speak` so we can
// assert that selecting / replaying an option plays its word aloud.
const { speak } = vi.hoisted(() => ({ speak: vi.fn() }))
vi.mock('../../core/hooks/useTTS', () => ({
  useTTS: () => ({
    speak,
    speakQueue: vi.fn(),
    cancel: vi.fn(),
    isSpeaking: false,
    isSupported: true,
  }),
}))

// OpenResponseInput pulls in speech recognition; stub it so nothing renders a
// text field here (these MC questions don't opt into open response anyway).
vi.mock('../../core/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: false,
    isListening: false,
    transcript: '',
    interimTranscript: '',
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    error: null,
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

function makeMcQuestion(overrides: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion {
  return {
    id: 'mc_1',
    type: 'multiple-choice',
    level: 3,
    skill: 'phonics.cvc.short-o',
    // Deliberately NOT a "what word is this?" prompt + no stimulus, so the
    // open-response (voice/type) path stays off and the test isolates the cards.
    prompt: 'Pick the word that matches the sound.',
    correctAnswer: 'dog',
    options: ['dog', 'dot', 'log'],
    ...overrides,
  }
}

/** Get the answer card (role=button) wrapping a given option's text. */
function cardFor(option: string): HTMLElement {
  const text = screen.getByText(option)
  const card = text.closest('[role="button"]')
  if (!card) throw new Error(`No card found for option "${option}"`)
  return card as HTMLElement
}

function renderScreen(props: Partial<React.ComponentProps<typeof QuestQuestionScreen>> = {}) {
  const onAnswer = vi.fn()
  const onAnswerWithMethod = vi.fn()
  const onSkip = vi.fn()
  const utils = render(
    <QuestQuestionScreen
      question={makeMcQuestion()}
      questState={questState}
      consecutiveWrong={0}
      onAnswer={onAnswer}
      onAnswerWithMethod={onAnswerWithMethod}
      onSkip={onSkip}
      {...props}
    />,
  )
  return { onAnswer, onAnswerWithMethod, onSkip, ...utils }
}

beforeEach(() => {
  speak.mockClear()
})

describe('QuestQuestionScreen — select-then-confirm answer cards', () => {
  it('first tap on a card selects it and plays its word, but does NOT submit', () => {
    const { onAnswer } = renderScreen()
    speak.mockClear()

    fireEvent.click(cardFor('dog'))

    // No submit yet.
    expect(onAnswer).not.toHaveBeenCalled()
    // Word was played aloud.
    expect(speak).toHaveBeenCalledWith('dog')
    // Two-step affordance appears on the selected card.
    expect(screen.getByText('tap again to choose ✓')).toBeTruthy()
  })

  it('second tap on the already-selected card submits that option', () => {
    const { onAnswer } = renderScreen()

    fireEvent.click(cardFor('dog')) // select
    expect(onAnswer).not.toHaveBeenCalled()

    fireEvent.click(cardFor('dog')) // confirm
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith('dog')
  })

  it('tapping a different card moves the selection and plays that word (no submit)', () => {
    const { onAnswer } = renderScreen()

    fireEvent.click(cardFor('dog')) // select dog
    speak.mockClear()

    fireEvent.click(cardFor('dot')) // move selection to dot

    // Still no submit — selection is freely reversible.
    expect(onAnswer).not.toHaveBeenCalled()
    expect(speak).toHaveBeenCalledWith('dot')
    // Affordance now lives on the newly selected card only.
    const affordances = screen.getAllByText('tap again to choose ✓')
    expect(affordances).toHaveLength(1)
    expect(cardFor('dot').contains(affordances[0])).toBe(true)
  })

  it('committing requires two taps on the SAME card after switching', () => {
    const { onAnswer } = renderScreen()

    fireEvent.click(cardFor('dog')) // select dog
    fireEvent.click(cardFor('dot')) // switch to dot (not a confirm of dog)
    expect(onAnswer).not.toHaveBeenCalled()

    fireEvent.click(cardFor('dot')) // confirm dot
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith('dot')
  })

  it('the whole card is the tap target and the option text is contained within it', () => {
    renderScreen()
    const card = cardFor('dog')
    // The option text node lives inside the card button (contained, not overflowing
    // as a sibling), so a tap anywhere on the card hits it.
    expect(card.getAttribute('role')).toBe('button')
    expect(card.textContent).toContain('dog')
  })

  it('the per-card speaker replays the word without selecting or submitting', () => {
    const { onAnswer } = renderScreen()
    speak.mockClear()

    fireEvent.click(screen.getByLabelText('Hear option again: dog'))

    expect(speak).toHaveBeenCalledWith('dog')
    expect(onAnswer).not.toHaveBeenCalled()
    // Replay alone does not arm the confirm step.
    expect(screen.queryByText('tap again to choose ✓')).toBeNull()
  })
})

describe('QuestQuestionScreen — progress / diamond visibility', () => {
  it('shows diamonds mined and how many questions remain', () => {
    renderScreen()
    // totalCorrect=1 → 1 mined; MAX_QUESTIONS(10) - totalQuestions(2) → 8 to go.
    const tally = screen.getByText(/mined/)
    expect(tally.textContent).toContain('1 mined')
    expect(tally.textContent).toContain('8 to go')
  })

  it('keeps the diamond tally rendered on long (comprehension passage) questions', () => {
    // Passage comprehension prompts are long and previously pushed progress off-screen.
    const longPrompt = [
      'Read this story, then answer.',
      Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '),
      'What happened first?',
    ].join('\n\n')
    renderScreen({
      question: makeMcQuestion({
        id: 'mc_long',
        prompt: longPrompt,
        correctAnswer: 'He woke up',
        options: ['He woke up', 'He went to sleep', 'He ate lunch'],
      }),
      questMode: 'comprehension',
    })
    const tally = screen.getByText(/mined/)
    expect(tally.textContent).toContain('1 mined')
    expect(tally.textContent).toContain('8 to go')
  })

  it('resets the selection when the question changes', () => {
    const { rerender } = renderScreen()
    fireEvent.click(cardFor('dog'))
    expect(screen.getByText('tap again to choose ✓')).toBeTruthy()

    rerender(
      <QuestQuestionScreen
        question={makeMcQuestion({ id: 'mc_2', options: ['cat', 'cap', 'can'], correctAnswer: 'cat' })}
        questState={questState}
        consecutiveWrong={0}
        onAnswer={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    // New question starts with nothing selected.
    expect(screen.queryByText('tap again to choose ✓')).toBeNull()
  })
})
