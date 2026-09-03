import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import BookEditorPage from '../BookEditorPage'

const navigateMock = vi.fn()
const updateBookMetaMock = vi.fn()
const deletePageMock = vi.fn()

/** Flipped per-test so the same page can be mounted as a parent or as a kid. */
let profile: 'parents' | 'child-lincoln' = 'parents'
let isChildProfile = false

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ bookId: 'book-1' }),
}))

vi.mock('/src/core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('/src/core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-lincoln', name: 'Lincoln' },
    children: [
      { id: 'child-lincoln', name: 'Lincoln' },
      { id: 'child-london', name: 'London' },
    ],
    isChildProfile,
  }),
}))

vi.mock('/src/core/profile/useProfile', () => ({
  useProfile: () => ({ profile, themeMode: 'family', canEdit: true }),
}))

vi.mock('/src/core/ai/useAI', () => ({
  useAI: () => ({ generateImage: vi.fn(), enhanceSketch: vi.fn(), loading: false, error: null }),
}))

vi.mock('../useBackgroundReimagine', () => ({ useBackgroundReimagine: () => ({ job: null }) }))

function page(id: string, pageNumber: number, text: string, images: unknown[]) {
  return {
    id,
    pageNumber,
    text,
    images,
    layout: 'image-top',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

vi.mock('../useBook', () => ({
  useBook: () => ({
    book: {
      id: 'book-1',
      childId: 'child-lincoln',
      createdFor: 'child-lincoln',
      title: 'My Book',
      status: 'draft',
      theme: 'adventure',
      pages: [
        page('p1', 1, 'The dragon flew over the tall green hills at dawn.', [
          { id: 'i1', url: 'https://img/a.png', type: 'ai-generated' },
          { id: 'i2', url: 'https://img/b.png', type: 'photo' },
        ]),
        page('p2', 2, 'The end.', []),
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
    deletePage: deletePageMock,
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

beforeEach(() => {
  updateBookMetaMock.mockReset()
  deletePageMock.mockReset()
  navigateMock.mockReset()
  profile = 'parents'
  isChildProfile = false
})

// UX-124 — "For" wrote `createdFor` and nothing else, while the kid shelf, the
// kid Today cards and the reader's hours all query `childId`. The label
// promised ownership and delivered a palette change. Owner decision
// (2026-09-03): the control moves the book, and reading minutes follow it.

describe('UX-124 — "For" moves the book to that child\'s shelf', () => {
  it('writes childId alongside createdFor', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByLabelText('For'))
    await user.click(screen.getByRole('option', { name: 'London' }))

    expect(updateBookMetaMock).toHaveBeenCalledWith({
      createdFor: 'child-london',
      childId: 'child-london',
    })
  })

  it('moves it OFF the old shelf — the write is a move, not a copy', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByLabelText('For'))
    await user.click(screen.getByRole('option', { name: 'London' }))

    // The kid shelf query is `where('childId', '==', childId)` (useBook), so a
    // single `childId` is by construction on exactly one child's shelf.
    const payload = updateBookMetaMock.mock.calls[0][0]
    expect(payload.childId).toBe('child-london')
    expect(payload.childId).not.toBe('child-lincoln')
  })
})

// UX-127 — the row was gated on `children.length > 0` only, so a kid in the
// editor could stamp a parent as the author or move his own book to a sibling.

describe('UX-127 — the attribution row is a parent control', () => {
  it('shows For / By to a parent', () => {
    render(<BookEditorPage />)
    expect(screen.getByLabelText('For')).toBeTruthy()
    expect(screen.getByLabelText('By')).toBeTruthy()
  })

  it('hides it from a kid profile', () => {
    profile = 'child-lincoln'
    isChildProfile = true
    render(<BookEditorPage />)
    expect(screen.queryByLabelText('For')).toBeNull()
    expect(screen.queryByLabelText('By')).toBeNull()
  })
})

// UX-130 — Delete page called `deletePage` straight from the button. The
// editor's history is per-page, so a deleted page is not in Undo's stack, and
// the book auto-saves. The kid-surface twin of the August audit's UX-48.

describe('UX-130 — Delete page asks first', () => {
  it('does not delete on the first tap', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByRole('button', { name: /delete page/i }))
    expect(deletePageMock).not.toHaveBeenCalled()
  })

  it('names the page and what is on it', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByRole('button', { name: /delete page/i }))
    expect(screen.getByText('Delete page 1?')).toBeTruthy()
    expect(screen.getByText(/It has 2 pictures and 10 words\./)).toBeTruthy()
    expect(screen.getByText(/can't be undone/i)).toBeTruthy()
  })

  it('deletes only after the confirm', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByRole('button', { name: /delete page/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deletePageMock).toHaveBeenCalledWith('p1')
  })

  it('deletes nothing when the confirm is cancelled', async () => {
    const user = userEvent.setup()
    render(<BookEditorPage />)

    await user.click(screen.getByRole('button', { name: /delete page/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deletePageMock).not.toHaveBeenCalled()
  })
})
