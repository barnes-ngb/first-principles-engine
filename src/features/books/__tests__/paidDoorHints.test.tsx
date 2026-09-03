import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// UX-147 — FEAT-178 said "every paid door carries a hint and a ?". The 2026-09
// audit walked them door by door and found four bare: the Story Guide's one-tap
// up-to-14-call generate, both Reimagine buttons, the editor's sticker picker,
// and the review chat's "Change this". Each is capped, so none can overspend —
// each could still surprise.

// ── The Story Guide ─────────────────────────────────────────────

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-london', name: 'London', birthdate: '2020-01-01' },
    children: [],
    isChildProfile: false,
  }),
}))
vi.mock('../useBookGenerator', () => ({
  useBookGenerator: () => ({
    generateBook: vi.fn(),
    progress: null,
    generating: false,
    resetProgress: vi.fn(),
    lastError: () => null,
  }),
  inferBookTheme: () => 'storybook',
}))
vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({ atLimit: false, limit: 100, remaining: 40, recordGeneration: vi.fn() }),
  recordBookArtGeneration: vi.fn(),
}))
vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({ getWeakWords: () => [], loading: false }),
}))
vi.mock('../StoryGuideQuestion', () => ({ default: () => null }))
vi.mock('../GenerationProgress', () => ({ default: () => null }))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import StoryGuidePage from '../StoryGuidePage'
import * as useStoryGuideModule from '../useStoryGuide'
import { VoiceState } from '../useStoryGuide'
import DrawingChoiceDialog from '../DrawingChoiceDialog'

function completedGuide() {
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
    assembleBrief: () => ({
      hero: 'Hero',
      setting: 'Setting',
      problem: 'Problem',
      solution: 'Solution',
      ending: 'Ending',
      sightWords: [],
    }),
  } as unknown as ReturnType<typeof useStoryGuideModule.useStoryGuide>)
}

beforeEach(() => {
  navigateMock.mockReset()
  vi.restoreAllMocks()
})

describe('UX-147 — the Story Guide names what one tap spends', () => {
  it('carries a hint with the LIVE page count, not a hard-coded 1', () => {
    completedGuide()
    render(<StoryGuidePage />)
    // The default product size is 10 pages, so 10 paid image calls.
    expect(screen.getByText(/10 paid image calls/)).toBeTruthy()
  })

  it('offers a "?" that opens the sheet', async () => {
    const user = userEvent.setup()
    completedGuide()
    render(<StoryGuidePage />)

    const help = screen.getByRole('button', { name: /how this works/i })
    await user.click(help)
    await waitFor(() => {
      expect(screen.getAllByText(/making pictures/i).length).toBeGreaterThan(0)
    })
  })
})

// ── The two Reimagine doors ─────────────────────────────────────

const capturedFile = new File(['x'], 'drawing.png', { type: 'image/png' })

describe('UX-147 — the Reimagine doors say what they spend', () => {
  it('hints under the raw-photo Reimagine, and offers a "?"', async () => {
    const user = userEvent.setup()
    render(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={vi.fn()}
        processing={false}
        artAudience="parent"
        onOpenArtHelp={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Reimagine'))

    expect(screen.getByText('Reimagine intensity')).toBeTruthy()
    expect(screen.getByText(/1 paid image call/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /how this works/i })).toBeTruthy()
  })

  it('hints under the post-cleanup Reimagine too', async () => {
    const user = userEvent.setup()
    render(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={vi.fn()}
        onPickPostCleanup={vi.fn()}
        resultPreviewUrl="blob:cleaned"
        resultIsCleaned
        processing={false}
        artAudience="parent"
        onOpenArtHelp={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Reimagine as a picture'))

    expect(screen.getByText(/1 paid image call/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /how this works/i })).toBeTruthy()
  })

  it('gives a kid the kid wording, on capability and never a name', async () => {
    const user = userEvent.setup()
    render(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={vi.fn()}
        processing={false}
        artAudience="kid"
        onOpenArtHelp={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Reimagine'))

    expect(screen.getByText('Makes 1 picture. Uses 1 art.')).toBeTruthy()
    expect(screen.queryByText(/paid image call/)).toBeNull()
  })
})
