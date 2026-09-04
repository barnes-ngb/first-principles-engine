import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import BookGenerateChat from '../BookGenerateChat'

/**
 * FEAT-191 — the stretch picker is a PARENT control.
 *
 * Gated on capability, never on a name, and never shown to a kid: choosing to
 * write a book above your own reading level is a teaching decision, and the
 * honest line about what came out above the level is already parent-only.
 */

const setLevelStretchMock = vi.fn()

const hookState = {
  chatHistory: [] as unknown[],
  currentStory: null as null | { title: string; pages: unknown[] },
  illustrationStyle: 'storybook',
  isLoading: false,
  error: null as string | null,
  bookId: null as string | null,
  clarificationPhase: 'clarifying' as const,
  pendingIdea: '',
  pendingRefinement: null as string | null,
  canStartStory: false,
  pageCount: 10,
  levelStretch: 0,
  storyWords: [] as string[],
  storyWordSource: 'none' as const,
  storyWordsLoading: false,
  illustrationProgress: { phase: 'idle' as const, currentPage: 0, totalPages: 0 },
}

vi.mock('../useBookGenerateChat', () => ({
  useBookGenerateChat: () => ({
    ...hookState,
    setPageCount: vi.fn(),
    setLevelStretch: setLevelStretchMock,
    sendKidMessage: vi.fn(async () => undefined),
    setIllustrationStyle: vi.fn(),
    commitAndClose: vi.fn(async () => 'book-1'),
    abandonDraft: vi.fn(async () => undefined),
    confirmStartStory: vi.fn(async () => undefined),
    confirmAddRefinement: vi.fn(async () => undefined),
    confirmChangeRefinement: vi.fn(async () => undefined),
  }),
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

const activeChildState = { isChildProfile: false }
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-lincoln', name: 'Lincoln', birthdate: '2016-01-01' },
    children: [{ id: 'child-lincoln', name: 'Lincoln', birthdate: '2016-01-01' }],
    isChildProfile: activeChildState.isChildProfile,
  }),
}))

const profileState = { profile: 'parents' as string }
vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileState.profile }),
}))

vi.mock('../../../core/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    transcript: '',
    interimTranscript: '',
    isListening: false,
    isSupported: true,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock('../../../core/hooks/useTTS', () => ({
  useTTS: () => ({
    speak: vi.fn(),
    speakQueue: vi.fn(),
    cancel: vi.fn(),
    isSpeaking: false,
    isSupported: true,
  }),
}))

beforeEach(() => {
  setLevelStretchMock.mockReset()
  profileState.profile = 'parents'
  activeChildState.isChildProfile = false
  hookState.currentStory = null
  hookState.levelStretch = 0
  hookState.isLoading = false
})

describe('BookGenerateChat — the stretch picker (FEAT-191)', () => {
  it('shows a parent the three choices, named for the active child', () => {
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.getByLabelText("Lincoln's level")).toBeTruthy()
    expect(screen.getByLabelText('One step up')).toBeTruthy()
    expect(screen.getByLabelText('Two steps up')).toBeTruthy()
  })

  it('says the control never changes the level on the Skill Snapshot', () => {
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.getByText(/never changes the level on the Skill Snapshot/i)).toBeTruthy()
  })

  it('does NOT show it to a kid profile', () => {
    profileState.profile = 'lincoln'
    activeChildState.isChildProfile = true
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.queryByLabelText('One step up')).toBeNull()
    expect(screen.queryByLabelText("Lincoln's level")).toBeNull()
    // The length picker, which is not parent-gated, is still there — so this is
    // the stretch control being absent, not the whole setup strip.
    expect(screen.getByLabelText(/story length/i)).toBeTruthy()
  })

  it('hides it once a draft exists — the book is already written', () => {
    hookState.currentStory = { title: 'The Ship', pages: [] }
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.queryByLabelText('One step up')).toBeNull()
  })

  it('reports a tap to the hook', async () => {
    const user = userEvent.setup()
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    await user.click(screen.getByLabelText('One step up'))
    expect(setLevelStretchMock).toHaveBeenCalledWith(1)
  })
})
