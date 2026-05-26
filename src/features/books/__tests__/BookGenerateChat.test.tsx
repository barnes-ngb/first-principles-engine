import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import BookGenerateChat from '../BookGenerateChat'

// ── Mocks ─────────────────────────────────────────────────────────

const sendKidMessageMock = vi.fn<(text: string) => Promise<void>>()
const setIllustrationStyleMock = vi.fn<(style: string) => void>()
const commitAndCloseMock = vi.fn<() => Promise<string | null>>()
const abandonDraftMock = vi.fn<() => Promise<void>>()
const confirmStartStoryMock = vi.fn<() => Promise<void>>()
const confirmAddRefinementMock = vi.fn<() => Promise<void>>()
const confirmChangeRefinementMock = vi.fn<() => Promise<void>>()

type ChatKind = 'echo' | 'add-or-change' | 'story-draft' | 'revision'

interface HookState {
  chatHistory: Array<{ role: 'kid' | 'ai'; content: string; ts: number; kind?: ChatKind }>
  currentStory: null | {
    title: string
    pages: Array<{ pageNumber: number; text: string; sceneDescription: string }>
  }
  illustrationStyle: string
  isLoading: boolean
  error: string | null
  bookId: string | null
  clarificationPhase: 'clarifying' | 'ready'
  pendingIdea: string
  pendingRefinement: string | null
  canStartStory: boolean
  illustrationProgress: {
    phase: 'idle' | 'illustrating' | 'done'
    currentPage: number
    totalPages: number
    lastImageUrl?: string
  }
}

let hookState: HookState = {
  chatHistory: [],
  currentStory: null,
  illustrationStyle: 'storybook',
  isLoading: false,
  error: null,
  bookId: null,
  clarificationPhase: 'clarifying',
  pendingIdea: '',
  pendingRefinement: null,
  canStartStory: false,
  illustrationProgress: {
    phase: 'idle',
    currentPage: 0,
    totalPages: 0,
  },
}

vi.mock('../useBookGenerateChat', () => ({
  useBookGenerateChat: () => ({
    ...hookState,
    sendKidMessage: sendKidMessageMock,
    setIllustrationStyle: setIllustrationStyleMock,
    commitAndClose: commitAndCloseMock,
    abandonDraft: abandonDraftMock,
    confirmStartStory: confirmStartStoryMock,
    confirmAddRefinement: confirmAddRefinementMock,
    confirmChangeRefinement: confirmChangeRefinementMock,
  }),
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

vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'parents' }),
}))

// Speech recognition + TTS — both feature-detect; mock to deterministic shape.
const recoStartMock = vi.fn()
const recoStopMock = vi.fn()
const recoResetMock = vi.fn()
let recoState = {
  transcript: '',
  interimTranscript: '',
  isListening: false,
  isSupported: true,
  error: null as string | null,
}
vi.mock('../../../core/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    ...recoState,
    start: recoStartMock,
    stop: recoStopMock,
    reset: recoResetMock,
  }),
}))

const ttsSpeakMock = vi.fn()
const ttsSpeakQueueMock = vi.fn()
const ttsCancelMock = vi.fn()
vi.mock('../../../core/hooks/useTTS', () => ({
  useTTS: () => ({
    speak: ttsSpeakMock,
    speakQueue: ttsSpeakQueueMock,
    cancel: ttsCancelMock,
    isSpeaking: false,
    isSupported: true,
  }),
}))

function Wrap({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

beforeEach(() => {
  sendKidMessageMock.mockReset().mockResolvedValue(undefined)
  setIllustrationStyleMock.mockReset()
  commitAndCloseMock.mockReset().mockResolvedValue('book-1')
  abandonDraftMock.mockReset().mockResolvedValue(undefined)
  confirmStartStoryMock.mockReset().mockResolvedValue(undefined)
  confirmAddRefinementMock.mockReset().mockResolvedValue(undefined)
  confirmChangeRefinementMock.mockReset().mockResolvedValue(undefined)
  ttsSpeakMock.mockReset()
  ttsSpeakQueueMock.mockReset()
  ttsCancelMock.mockReset()
  recoStartMock.mockReset()
  recoStopMock.mockReset()
  recoResetMock.mockReset()
  recoState = {
    transcript: '',
    interimTranscript: '',
    isListening: false,
    isSupported: true,
    error: null,
  }
  hookState = {
    chatHistory: [],
    currentStory: null,
    illustrationStyle: 'storybook',
    isLoading: false,
    error: null,
    bookId: null,
    clarificationPhase: 'clarifying',
    pendingIdea: '',
    pendingRefinement: null,
    canStartStory: false,
    illustrationProgress: {
      phase: 'idle',
      currentPage: 0,
      totalPages: 0,
    },
  }
})

describe('BookGenerateChat', () => {
  it('renders the composer and the illustration-style strip on initial mount', () => {
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByLabelText(/type or tap mic/i)).toBeTruthy()
    expect(screen.getByLabelText(/illustration style: minecraft/i)).toBeTruthy()
    expect(screen.getByLabelText(/illustration style: storybook/i)).toBeTruthy()
  })

  it('calls sendKidMessage when a message is sent', async () => {
    const user = userEvent.setup()
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    const input = screen.getByLabelText(/type or tap mic/i) as HTMLInputElement
    await user.type(input, 'a dragon who learns to fly')
    await user.click(screen.getByLabelText(/send message/i))
    expect(sendKidMessageMock).toHaveBeenCalledWith('a dragon who learns to fly')
  })

  it('disables the commit button when currentStory is null', () => {
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    const commitBtn = screen.getByRole('button', { name: /i like the whole story/i })
    expect(commitBtn.hasAttribute('disabled')).toBe(true)
  })

  it('enables the commit button when currentStory exists', () => {
    hookState = {
      ...hookState,
      currentStory: {
        title: 'A Story',
        pages: [
          { pageNumber: 1, text: 'Once upon a time.', sceneDescription: 'a forest' },
        ],
      },
      chatHistory: [
        { role: 'kid', content: 'a dragon story', ts: 1 },
        { role: 'ai', content: 'Here you go!', ts: 2 },
      ],
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    const commitBtn = screen.getByRole('button', { name: /i like the whole story/i })
    expect(commitBtn.hasAttribute('disabled')).toBe(false)
  })

  it('calls setIllustrationStyle when a style button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    await user.click(screen.getByLabelText(/illustration style: minecraft/i))
    expect(setIllustrationStyleMock).toHaveBeenCalledWith('minecraft')
  })

  it('shows the abandon/cancel link before any AI story-draft exists', () => {
    // Empty history → cancel visible
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByRole('button', { name: /cancel — start over/i })).toBeTruthy()
  })

  it('keeps the cancel link visible during clarification turns (no story yet)', () => {
    hookState = {
      ...hookState,
      chatHistory: [
        { role: 'kid', content: 'a puppy', ts: 1 },
        { role: 'ai', content: 'Here is what I heard…', ts: 2, kind: 'echo' },
      ],
      pendingIdea: 'a puppy',
      canStartStory: true,
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByRole('button', { name: /cancel — start over/i })).toBeTruthy()
  })

  it('hides the cancel link once a story draft exists', () => {
    hookState = {
      ...hookState,
      chatHistory: [{ role: 'kid', content: 'hi', ts: 1 }],
      currentStory: {
        title: 'A Story',
        pages: [{ pageNumber: 1, text: 'p', sceneDescription: '' }],
      },
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.queryByRole('button', { name: /cancel — start over/i })).toBeNull()
  })

  it('shows the loading indicator while a turn is in flight', () => {
    hookState = { ...hookState, isLoading: true }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    // Composer disabled
    const input = screen.getByLabelText(/type or tap mic/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('surfaces hook errors as a system message in the thread', () => {
    hookState = { ...hookState, error: "I had trouble with that. Try again?" }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByText(/i had trouble with that/i)).toBeTruthy()
  })

  it('surfaces a "Did I hear you right?" confirmation banner after a voice transcript lands', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    // Start listening
    await user.click(screen.getByLabelText(/start recording/i))
    expect(recoStartMock).toHaveBeenCalled()

    // Simulate STT finalizing — transcript arrives with isListening=false.
    recoState = {
      ...recoState,
      transcript: 'a dragon adventure',
      isListening: false,
    }
    rerender(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )

    await waitFor(() => {
      expect(screen.getByText(/did i hear you right/i)).toBeTruthy()
    })
    // Transcript flows into the editable composer.
    const input = screen.getByLabelText(/edit, then tap send/i) as HTMLInputElement
    expect(input.value).toBe('a dragon adventure')
  })

  it('does not show "Yes, start my story!" until first message is sent', () => {
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(
      screen.queryByRole('button', { name: /yes, start my story/i }),
    ).toBeNull()
  })

  it('renders an echo turn with a "Yes, start my story!" button after first kid message', () => {
    hookState = {
      ...hookState,
      chatHistory: [
        { role: 'kid', content: 'a puppy who finds a rainbow', ts: 1 },
        {
          role: 'ai',
          content:
            'Here\'s what I heard: "a puppy who finds a rainbow". Want me to start the story?',
          ts: 2,
          kind: 'echo',
        },
      ],
      pendingIdea: 'a puppy who finds a rainbow',
      canStartStory: true,
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByText(/here's what i heard/i)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /yes, start my story/i }),
    ).toBeTruthy()
  })

  it('calls confirmStartStory when "Yes, start my story!" is tapped', async () => {
    const user = userEvent.setup()
    hookState = {
      ...hookState,
      chatHistory: [
        { role: 'kid', content: 'a puppy', ts: 1 },
        { role: 'ai', content: 'Here\'s what I heard…', ts: 2, kind: 'echo' },
      ],
      pendingIdea: 'a puppy',
      canStartStory: true,
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    await user.click(
      screen.getByRole('button', { name: /yes, start my story/i }),
    )
    expect(confirmStartStoryMock).toHaveBeenCalled()
  })

  it('renders Add / Change buttons under an add-or-change turn and disables the composer', async () => {
    const user = userEvent.setup()
    hookState = {
      ...hookState,
      chatHistory: [
        { role: 'kid', content: 'a puppy', ts: 1 },
        { role: 'ai', content: 'Here\'s what I heard…', ts: 2, kind: 'echo' },
        { role: 'kid', content: 'and a dragon', ts: 3 },
        {
          role: 'ai',
          content: 'Should I ADD that to your story, or CHANGE the idea to that?',
          ts: 4,
          kind: 'add-or-change',
        },
      ],
      pendingIdea: 'a puppy',
      pendingRefinement: 'and a dragon',
      canStartStory: false,
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    const addBtn = screen.getByRole('button', { name: /\+ add it/i })
    const changeBtn = screen.getByRole('button', { name: /change it/i })
    expect(addBtn).toBeTruthy()
    expect(changeBtn).toBeTruthy()

    const input = screen.getByLabelText(/type or tap mic/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText(/tap add or change above to continue/i)).toBeTruthy()

    await user.click(addBtn)
    expect(confirmAddRefinementMock).toHaveBeenCalled()

    await user.click(changeBtn)
    expect(confirmChangeRefinementMock).toHaveBeenCalled()
  })

  it('auto-plays the echo turn via TTS when it first appears', () => {
    hookState = {
      ...hookState,
      chatHistory: [
        { role: 'kid', content: 'a puppy', ts: 1 },
        {
          role: 'ai',
          content: 'Here\'s what I heard: "a puppy". Want me to start the story?',
          ts: 2,
          kind: 'echo',
        },
      ],
      pendingIdea: 'a puppy',
      canStartStory: true,
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(ttsSpeakMock).toHaveBeenCalledWith(
      expect.stringMatching(/here's what i heard/i),
    )
  })

  it('shows an "Illustrating page X of Y…" strip and disables the composer/commit during illustration', () => {
    hookState = {
      ...hookState,
      currentStory: {
        title: 'A Story',
        pages: [
          { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
          { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
        ],
      },
      chatHistory: [
        { role: 'kid', content: 'a dragon', ts: 1 },
        { role: 'ai', content: 'Here you go!', ts: 2 },
      ],
      illustrationProgress: {
        phase: 'illustrating',
        currentPage: 1,
        totalPages: 2,
        lastImageUrl: 'https://example.com/preview.png',
      },
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByText(/illustrating page 1 of 2/i)).toBeTruthy()
    const preview = screen.getByAltText(/latest illustration preview/i) as HTMLImageElement
    expect(preview.src).toContain('preview.png')

    // Composer disabled.
    const input = screen.getByLabelText(/type or tap mic/i) as HTMLInputElement
    expect(input.disabled).toBe(true)

    // Commit button disabled while illustrating.
    const commitBtn = screen.getByRole('button', { name: /i like the whole story/i })
    expect(commitBtn.hasAttribute('disabled')).toBe(true)
  })

  it('renders story pages with per-page read-aloud buttons once a draft exists', () => {
    hookState = {
      ...hookState,
      currentStory: {
        title: 'Ember the Dragon',
        pages: [
          { pageNumber: 1, text: 'Page one text.', sceneDescription: 'a hill' },
          { pageNumber: 2, text: 'Page two text.', sceneDescription: 'a meadow' },
        ],
      },
      chatHistory: [
        { role: 'kid', content: 'a dragon', ts: 1 },
        { role: 'ai', content: "Here's your story!", ts: 2 },
      ],
    }
    render(
      <Wrap>
        <BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />
      </Wrap>,
    )
    expect(screen.getByLabelText(/read page 1 aloud/i)).toBeTruthy()
    expect(screen.getByLabelText(/read page 2 aloud/i)).toBeTruthy()
  })
})
