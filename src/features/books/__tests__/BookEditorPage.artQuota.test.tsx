import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { generateImageMock, recordGenerationMock, quotaHolder, pickerProps, drawingDialogProps } =
  vi.hoisted(() => ({
    generateImageMock: vi.fn(),
    recordGenerationMock: vi.fn(async () => undefined),
    quotaHolder: { atLimit: false },
    pickerProps: { current: null as Record<string, unknown> | null },
    drawingDialogProps: { current: null as Record<string, unknown> | null },
  }))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ bookId: 'book-1' }),
}))

vi.mock('/src/core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('/src/core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Test Child' },
    children: [{ id: 'child-1', name: 'Test Child' }],
    isChildProfile: true,
  }),
}))

vi.mock('/src/core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'lincoln', themeMode: 'family', canEdit: true }),
}))

vi.mock('/src/core/ai/useAI', () => ({
  useAI: () => ({
    generateImage: generateImageMock,
    enhanceSketch: vi.fn(),
    loading: false,
    error: null,
  }),
}))

// The one place the editor asks "is there budget?" (FEAT-168).
vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({
    count: 0,
    limit: 25,
    remaining: quotaHolder.atLimit ? 0 : 25,
    atLimit: quotaHolder.atLimit,
    recordGeneration: recordGenerationMock,
  }),
  recordBookArtGeneration: (record?: () => Promise<void>) => {
    if (record) void record()
  },
}))

vi.mock('../useBackgroundReimagine', () => ({
  useBackgroundReimagine: () => ({ job: null }),
}))

vi.mock('firebase/firestore', () => ({
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(),
  addDoc: vi.fn(async () => ({ id: 'doc-1' })),
}))

vi.mock('/src/core/firebase/firestore', () => ({
  stickerLibraryCollection: vi.fn(),
  artifactsCollection: vi.fn(),
}))

vi.mock('../useBook', () => ({
  useBook: () => ({
    book: {
      id: 'book-1',
      childId: 'child-1',
      title: 'My Book',
      status: 'draft',
      theme: 'fantasy',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          text: 'Once upon a time',
          images: [],
          layout: 'text-only',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      subjectBuckets: [],
    },
    loading: false,
    saveState: 'idle',
    saveErrorMessage: null,
    updatePage: vi.fn(),
    addPage: vi.fn(),
    deletePage: vi.fn(),
    updateBookMeta: vi.fn(),
    addImageToPage: vi.fn(),
    removeImageFromPage: vi.fn(),
    uploadAudio: vi.fn(),
    addAiImageToPage: vi.fn(),
    addStickerToPage: vi.fn(),
    updateImagePosition: vi.fn(),
    reorderPages: vi.fn(),
    addSketchToPage: vi.fn(),
    applySketchEnhancement: vi.fn(),
    pickSketchVersion: vi.fn(),
  }),
}))

vi.mock('../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../components/AudioRecorder', () => ({ default: () => null }))
vi.mock('../../components/PhotoCapture', () => ({ default: () => null }))
vi.mock('../../components/SaveIndicator', () => ({ default: () => null }))
vi.mock('../PageEditor', () => ({
  default: ({ onChangeBackground }: { onChangeBackground?: () => void }) => (
    <div>
      <button onClick={onChangeBackground}>Change Background</button>
    </div>
  ),
}))
// The two child doors record the props the page hands them, so the wiring
// itself is asserted rather than each door's own (separately tested) behaviour.
vi.mock('../StickerPicker', () => ({
  default: (props: Record<string, unknown>) => {
    pickerProps.current = props
    return null
  },
}))
vi.mock('../DrawingChoiceDialog', () => ({
  default: (props: Record<string, unknown>) => {
    drawingDialogProps.current = props
    return null
  },
}))
vi.mock('../ReimagineResultDialog', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

import { ART_QUOTA_MESSAGE } from '../../business/useArtQuota'
import BookEditorPage from '../BookEditorPage'

beforeEach(() => {
  generateImageMock.mockReset()
  generateImageMock.mockResolvedValue({ url: 'https://img/scene.png', storagePath: 's/scene.png' })
  recordGenerationMock.mockReset()
  recordGenerationMock.mockResolvedValue(undefined)
  quotaHolder.atLimit = false
  pickerProps.current = null
  drawingDialogProps.current = null
})

/**
 * Open the "Make a Scene" dialog from the editor toolbar. ("Make a scene" also
 * appears inside the background-source picker; both land on the same dialog.)
 */
async function openSceneDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByText('Make a scene')[0])
}

describe('BookEditorPage — weekly art budget (FEAT-168)', () => {
  it('asks the budget question once and hands the answer to both child doors', async () => {
    quotaHolder.atLimit = true
    render(<BookEditorPage />)

    await waitFor(() => expect(pickerProps.current).not.toBeNull())
    expect(pickerProps.current?.capReached).toBe(true)
    expect(pickerProps.current?.recordGeneration).toBe(recordGenerationMock)
    expect(drawingDialogProps.current?.capReached).toBe(true)
  })

  it('below the cap both doors are told so', async () => {
    quotaHolder.atLimit = false
    render(<BookEditorPage />)

    await waitFor(() => expect(pickerProps.current).not.toBeNull())
    expect(pickerProps.current?.capReached).toBe(false)
    expect(drawingDialogProps.current?.capReached).toBe(false)
  })

  it('at the cap the scene generator has no Create button and shows the warm nudge', async () => {
    const user = userEvent.setup()
    quotaHolder.atLimit = true
    render(<BookEditorPage />)

    await openSceneDialog(user)

    expect(await screen.findByText(ART_QUOTA_MESSAGE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create!' })).toBeNull()
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('below the cap the scene generator spends and counts exactly once', async () => {
    const user = userEvent.setup()
    quotaHolder.atLimit = false
    render(<BookEditorPage />)

    await openSceneDialog(user)
    await user.type(screen.getByLabelText(/describe the scene/i), 'a castle')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
    expect(recordGenerationMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(ART_QUOTA_MESSAGE)).toBeNull()
  })

  it('a counter that never settles does not wedge the scene door (FEAT-167 contract)', async () => {
    const user = userEvent.setup()
    quotaHolder.atLimit = false
    recordGenerationMock.mockImplementation(() => new Promise<undefined>(() => {}))
    render(<BookEditorPage />)

    await openSceneDialog(user)
    await user.type(screen.getByLabelText(/describe the scene/i), 'a castle')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(screen.getByAltText('Generated scene')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Use this one' })).toBeTruthy()
  })
})
