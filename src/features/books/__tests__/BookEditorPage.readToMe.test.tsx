import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import BookEditorPage from '../BookEditorPage'

// ── Hoisted, mutable mock state ───────────────────────────────────

const state = vi.hoisted(() => ({
  profile: 'parents' as string,
  book: null as Record<string, unknown> | null,
}))

const navigateMock = vi.fn()

function baseBook(overrides?: Record<string, unknown>) {
  return {
    id: 'book-1',
    childId: 'child-1',
    title: 'My Book',
    status: 'draft',
    theme: 'adventure',
    coverImageUrl: 'https://img/cover.png',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'Hello world',
        images: [{ id: 'i1', url: 'https://img/cover.png', type: 'ai-generated' }],
        layout: 'image-top',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    subjectBuckets: [],
    ...overrides,
  }
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ bookId: 'book-1' }),
}))

vi.mock('/src/core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('/src/core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Lincoln' },
    children: [{ id: 'child-1', name: 'Lincoln' }],
  }),
}))

vi.mock('/src/core/profile/useProfile', () => ({
  useProfile: () => ({ profile: state.profile, themeMode: 'family', canEdit: true }),
}))

vi.mock('/src/core/ai/useAI', () => ({
  useAI: () => ({ generateImage: vi.fn(), enhanceSketch: vi.fn(), loading: false, error: null }),
}))

vi.mock('../useBackgroundReimagine', () => ({ useBackgroundReimagine: () => ({ job: null }) }))

vi.mock('../useBook', () => ({
  useBook: () => ({
    book: state.book,
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

const READ_IT = /Read it to me/

describe('BookEditorPage — "Read it to me 🎧" toolbar button', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    state.profile = 'parents'
    state.book = null
  })

  it('renders for a parent on an AI-generated book (post-hoc review)', () => {
    state.profile = 'parents'
    state.book = baseBook({ source: 'ai-generated', reviewState: { completedAt: '2026-05-01' } })
    render(<BookEditorPage />)
    expect(screen.getByRole('button', { name: READ_IT })).toBeInTheDocument()
  })

  it('renders for a kid on an un-approved AI-generated book', () => {
    state.profile = 'lincoln'
    state.book = baseBook({ source: 'ai-generated' })
    render(<BookEditorPage />)
    expect(screen.getByRole('button', { name: READ_IT })).toBeInTheDocument()
  })

  it('is hidden for a kid on a completed-review AI-generated book', () => {
    state.profile = 'lincoln'
    state.book = baseBook({ source: 'ai-generated', reviewState: { completedAt: '2026-05-01' } })
    render(<BookEditorPage />)
    expect(screen.queryByRole('button', { name: READ_IT })).not.toBeInTheDocument()
  })

  it('is hidden for any profile on a manual (non-AI) book', () => {
    state.profile = 'parents'
    state.book = baseBook({ source: 'manual' })
    render(<BookEditorPage />)
    expect(screen.queryByRole('button', { name: READ_IT })).not.toBeInTheDocument()
  })
})
