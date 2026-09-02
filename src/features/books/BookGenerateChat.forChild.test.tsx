import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { hookOpts, hookState, activeChildState, profileState } = vi.hoisted(() => ({
  /** Every options object the component handed the hook, in order. */
  hookOpts: [] as Array<Record<string, unknown>>,
  hookState: {
    storyWords: [] as string[],
    storyWordSource: 'none' as 'requested' | 'practice' | 'none',
    storyWordsLoading: false,
    chatHistory: [] as Array<{ role: string; content: string; ts: number; kind?: string }>,
    currentStory: null as null | { title: string; pages: never[] },
  },
  activeChildState: {
    activeChildId: 'child-lincoln',
    children: [
      { id: 'child-lincoln', name: 'Lincoln', birthdate: '2015-09-30' },
      { id: 'child-london', name: 'London', birthdate: '2020-02-20' },
    ],
  },
  profileState: { profile: 'parents' as string },
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: activeChildState.activeChildId,
    activeChild: activeChildState.children.find((c) => c.id === activeChildState.activeChildId),
    children: activeChildState.children,
    setActiveChildId: vi.fn(),
    isChildProfile: profileState.profile !== 'parents',
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: profileState.profile }),
}))

vi.mock('../../core/hooks/useTTS', () => ({
  useTTS: () => ({
    speak: vi.fn(),
    speakQueue: vi.fn(),
    cancel: vi.fn(),
    isSpeaking: false,
    isSupported: false,
  }),
}))

vi.mock('../../components/VoiceInput', () => ({
  default: () => null,
}))

vi.mock('../business/useArtQuota', () => ({
  ART_QUOTA_MESSAGE: 'quota message',
}))

// The hook is the subject of its own test file; here it is a recorder so the
// COMPONENT's binding decision — which child it hands the hook — is observable.
vi.mock('./useBookGenerateChat', () => ({
  useBookGenerateChat: (opts: Record<string, unknown>) => {
    hookOpts.push(opts)
    return {
      chatHistory: hookState.chatHistory,
      currentStory: hookState.currentStory,
      illustrationStyle: 'storybook',
      isLoading: false,
      error: null,
      bookId: null,
      clarificationPhase: 'clarifying',
      pendingIdea: hookState.chatHistory[0]?.content ?? '',
      pendingRefinement: null,
      canStartStory: hookState.chatHistory.length > 0 && !hookState.storyWordsLoading,
      pageCount: 10,
      setPageCount: vi.fn(),
      storyWords: hookState.storyWords,
      storyWordSource: hookState.storyWordSource,
      storyWordsLoading: hookState.storyWordsLoading,
      illustrationProgress: {
        phase: 'idle',
        currentPage: 0,
        totalPages: 0,
        failedPages: [],
        capReached: false,
        unillustratedPages: [],
      },
      sendKidMessage: vi.fn(),
      setIllustrationStyle: vi.fn(),
      commitAndClose: vi.fn(),
      abandonDraft: vi.fn(),
      confirmStartStory: vi.fn(),
      confirmAddRefinement: vi.fn(),
      confirmChangeRefinement: vi.fn(),
    }
  },
}))

// ── Subject under test ──────────────────────────────────────────

import BookGenerateChat from './BookGenerateChat'

function lastHookOpts() {
  return hookOpts[hookOpts.length - 1]
}

/** An echo turn on screen, so the before-the-tap words line renders. */
function withEchoTurn(idea: string) {
  hookState.chatHistory = [
    { role: 'kid', content: idea, ts: 1 },
    { role: 'ai', content: `Here's what I heard: "${idea}". Want me to start the story?`, ts: 2, kind: 'echo' },
  ]
}

beforeEach(() => {
  hookOpts.length = 0
  hookState.storyWords = []
  hookState.storyWordSource = 'none'
  hookState.storyWordsLoading = false
  hookState.chatHistory = []
  hookState.currentStory = null
  activeChildState.activeChildId = 'child-lincoln'
  profileState.profile = 'parents'
})

describe('BookGenerateChat — who the story is for (FEAT-172)', () => {
  it('a parent sees the picker, defaulting to the active child, and the hook is bound to that child', () => {
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.getByTestId('story-for-child')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Story for Lincoln' })).toHaveAttribute('aria-pressed', 'true')
    expect(lastHookOpts()).toMatchObject({
      childId: 'child-lincoln',
      childName: 'Lincoln',
      attribution: { createdBy: 'parent', createdFor: 'child-lincoln' },
    })
  })

  it("picking London rebinds EVERYTHING to London — the words read, the child the server writes for, the shelf the draft lands on — while Lincoln stays active in the header", () => {
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Story for London' }))
    expect(screen.getByRole('button', { name: 'Story for London' })).toHaveAttribute('aria-pressed', 'true')
    expect(lastHookOpts()).toMatchObject({
      childId: 'child-london',
      childName: 'London',
      childAge: 6,
      attribution: { createdBy: 'parent', createdFor: 'child-london' },
    })
    // The header's active child did not move.
    expect(activeChildState.activeChildId).toBe('child-lincoln')
  })

  it('a resumed draft binds to the child the BOOK is for, not the header child, and the picker is locked', () => {
    render(
      <BookGenerateChat
        onCommit={vi.fn()}
        onAbandon={vi.fn()}
        resumeBookId="book-1"
        resumeForChildId="child-london"
      />,
    )
    expect(lastHookOpts()).toMatchObject({
      childId: 'child-london',
      childName: 'London',
      resumeBookId: 'book-1',
      attribution: { createdFor: 'child-london' },
    })
    expect(screen.getByRole('button', { name: 'Story for London' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Story for London' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Story for Lincoln' })).toBeDisabled()
  })

  it('the picker locks once a story exists — it was written for one child', () => {
    hookState.currentStory = { title: 'Hero', pages: [] }
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Story for London' })).toBeDisabled()
  })

  it('a kid profile never sees the picker and is always itself', () => {
    profileState.profile = 'london'
    activeChildState.activeChildId = 'child-london'
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.queryByTestId('story-for-child')).not.toBeInTheDocument()
    expect(lastHookOpts()).toMatchObject({
      childId: 'child-london',
      attribution: { createdBy: 'child-london', createdFor: 'child-london' },
    })
  })
})

describe('BookGenerateChat — the words line names its source (FEAT-172)', () => {
  it('says "the words you asked for" when the parent typed a list', () => {
    withEchoTurn('sight words: our, friend. London becomes a hero')
    hookState.storyWords = ['our', 'friend']
    hookState.storyWordSource = 'requested'
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.getByTestId('story-practice-words')).toHaveTextContent(
      "I'll try to work in the words you asked for: our, friend.",
    )
    expect(screen.queryByText(/practice words/)).not.toBeInTheDocument()
  })

  it("says whose practice words they are, for that source — and names the FOR child, not the header child", () => {
    withEchoTurn('London becomes a hero')
    hookState.storyWords = ['again']
    hookState.storyWordSource = 'practice'
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Story for London' }))
    expect(screen.getByTestId('story-practice-words')).toHaveTextContent(
      "I'll try to weave in some of London's practice words: again.",
    )
  })

  it('makes no claim when there is no list', () => {
    withEchoTurn('London becomes a hero')
    render(<BookGenerateChat onCommit={vi.fn()} onAbandon={vi.fn()} />)
    expect(screen.queryByTestId('story-practice-words')).not.toBeInTheDocument()
  })
})
