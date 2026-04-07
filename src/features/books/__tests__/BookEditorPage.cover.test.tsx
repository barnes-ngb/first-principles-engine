import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import BookEditorPage from '../BookEditorPage'

const navigateMock = vi.fn()
const updateBookMetaMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ bookId: 'book-1' }),
}))

vi.mock('/src/core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('/src/core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Test Child' },
    children: [{ id: 'child-1', name: 'Test Child' }],
  }),
}))

vi.mock('/src/core/ai/useAI', () => ({
  useAI: () => ({ generateImage: vi.fn(), enhanceSketch: vi.fn(), loading: false, error: null }),
}))

vi.mock('../useBackgroundReimagine', () => ({
  useBackgroundReimagine: () => ({ job: null }),
}))

vi.mock('../useBook', () => ({
  useBook: () => ({
    book: {
      id: 'book-1',
      childId: 'child-1',
      title: 'My Book',
      status: 'complete',
      theme: 'adventure',
      coverImageUrl: 'https://img/cover.png',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          text: 'Hello world',
          images: [{ id: 'i1', url: 'https://img/cover.png', type: 'photo' }],
          layout: 'image-top',
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
    updateBookMeta: updateBookMetaMock,
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

vi.mock('../../components/Page', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../components/AudioRecorder', () => ({ default: () => null }))
vi.mock('../../components/PhotoCapture', () => ({ default: () => null }))
vi.mock('../../components/SaveIndicator', () => ({ default: () => null }))
vi.mock('../PageEditor', () => ({ default: () => null }))
vi.mock('../StickerPicker', () => ({ default: () => null }))
vi.mock('../DrawingChoiceDialog', () => ({ default: () => null }))
vi.mock('../ReimagineResultDialog', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

describe('BookEditorPage cover editing', () => {
  beforeEach(() => {
    updateBookMetaMock.mockReset()
    navigateMock.mockReset()
  })

  it('allows complete books to open cover dialog and save cover without changing status', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByRole('button', { name: 'Cover' }))
    expect(screen.getByText('Edit Cover')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save cover' }))

    expect(updateBookMetaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coverImageUrl: 'https://img/cover.png',
        theme: 'adventure',
      }),
    )
    const firstPayload = updateBookMetaMock.mock.calls[0][0]
    expect(firstPayload).not.toHaveProperty('status')
  })
})
