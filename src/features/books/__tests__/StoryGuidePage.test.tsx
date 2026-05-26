import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

import StoryGuidePage from '../StoryGuidePage'
import * as useStoryGuideModule from '../useStoryGuide'
import { VoiceState } from '../useStoryGuide'

// ── Mocks ─────────────────────────────────────────────────────────

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-london', name: 'London', birthdate: '2020-01-01' },
    children: [],
  }),
}))

vi.mock('../useBookGenerator', () => ({
  useBookGenerator: () => ({
    generateBook: vi.fn(),
    progress: null,
    generating: false,
    resetProgress: vi.fn(),
  }),
  inferBookTheme: () => 'storybook',
}))

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({
    getWeakWords: () => [],
    loading: false,
  }),
}))

vi.mock('../StoryGuideQuestion', () => ({
  default: () => null,
}))

vi.mock('../GenerationProgress', () => ({
  default: () => null,
}))

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
  navigateMock.mockReset()
})

describe('StoryGuidePage — ai-shaping step removed (Story Gen V2 §6.3)', () => {
  it('skips directly from completed questions to brief-preview (no shaping step)', () => {
    // Spy on useStoryGuide and force it to report all 5 questions complete.
    vi.spyOn(useStoryGuideModule, 'useStoryGuide').mockReturnValue({
      questions: [],
      currentIndex: 5,
      answers: ['Hero', 'Setting', 'Problem', 'Solution', 'Ending'],
      inputMode: 'type',
      setInputMode: vi.fn(),
      typedValue: '',
      setTypedValue: vi.fn(),
      voiceState: VoiceState.Idle,
      transcription: '',
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      confirmTranscription: vi.fn(),
      retryRecording: vi.fn(),
      advanceWithTyped: vi.fn(),
      skip: vi.fn(),
      goBack: vi.fn(),
      isDone: true,
      aiShapingQuestion: null,
      setAiShapingQuestion: vi.fn(),
      aiShapingAnswer: undefined,
      setAiShapingAnswer: vi.fn(),
      showAiShaping: false,
      setShowAiShaping: vi.fn(),
      speakText: vi.fn(),
      assembleBrief: vi.fn(() => ({
        childId: 'child-london',
        childAge: 6,
        theme: 'storybook',
        hero: 'Hero',
        setting: 'Setting',
        problem: 'Problem',
        solution: 'Solution',
        ending: 'Ending',
      })),
    } as unknown as ReturnType<typeof useStoryGuideModule.useStoryGuide>)

    act(() => {
      render(<StoryGuidePage />)
    })

    // Brief preview screen renders ("Your Story" + Generate button).
    expect(screen.getByText(/your story/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /generate my book/i })).toBeTruthy()

    // None of the AI-shaping CTAs should render anywhere on the page.
    expect(screen.queryByText(/even more epic/i)).toBeNull()
    expect(screen.queryByText(/even more magical/i)).toBeNull()
    expect(screen.queryByText(/skip → review my story/i)).toBeNull()
    expect(screen.queryByText(/one more idea/i)).toBeNull()
    expect(screen.queryByText(/one more magical idea/i)).toBeNull()
  })
})
