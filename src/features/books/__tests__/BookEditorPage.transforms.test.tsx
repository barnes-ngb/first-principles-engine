import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, BookPage } from '../../../core/types'

const m = vi.hoisted(() => ({ source: null as unknown as Book, persist: vi.fn(), getDoc: vi.fn(), bookId: 'synthetic-book' }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ bookId: m.bookId }) }))
vi.mock('/src/core/auth/useAuth', () => ({ useFamilyId: () => 'synthetic-family' }))
vi.mock('/src/core/hooks/useActiveChild', () => ({ useActiveChild: () => ({ activeChild: { id: 'synthetic-child', name: 'Test Child' }, children: [{ id: 'synthetic-child', name: 'Test Child' }], isChildProfile: true }) }))
vi.mock('/src/core/profile/useProfile', () => ({ useProfile: () => ({ profile: 'child', themeMode: 'family', canEdit: true }) }))
vi.mock('/src/core/ai/useAI', () => ({ useAI: () => ({ imageFailureRef: { current: null }, generateImage: vi.fn(), enhanceSketch: vi.fn(), loading: false }) }))
vi.mock('../useBookArtQuota', () => ({ useBookArtQuota: () => ({ atLimit: true, limit: 100, remaining: 0 }), recordBookArtGeneration: vi.fn() }))
vi.mock('../useBackgroundReimagine', () => ({ useBackgroundReimagine: () => ({ job: null }) }))
vi.mock('firebase/firestore', () => ({ addDoc: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(() => ({})), getDoc: m.getDoc, getDocs: vi.fn(), orderBy: vi.fn(), query: vi.fn(), setDoc: vi.fn(), where: vi.fn() }))
vi.mock('firebase/storage', () => ({ getDownloadURL: vi.fn(), ref: vi.fn(), uploadBytes: vi.fn() }))
vi.mock('/src/core/firebase/firestore', () => ({ artifactsCollection: vi.fn(), booksCollection: vi.fn(), hoursCollection: vi.fn(), stickerLibraryCollection: vi.fn(), stripUndefined: (value: unknown) => value }))
vi.mock('/src/core/firebase/storage', () => ({ storage: {} }))
vi.mock('/src/core/hooks/useDebounce', () => ({ useDebounce: () => m.persist }))
vi.mock('/src/core/xp/addXpEvent', () => ({ addXpEvent: vi.fn() }))
vi.mock('/src/core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn() }))
vi.mock('../../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../../components/AudioRecorder', () => ({ default: () => null }))
vi.mock('../../../components/PhotoCapture', () => ({ default: () => null }))
vi.mock('../StickerPicker', () => ({ default: () => null }))
vi.mock('../DrawingChoiceDialog', () => ({ default: () => null }))
vi.mock('../ReimagineResultDialog', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))
import BookEditorPage from '../BookEditorPage'

beforeAll(() => {
  class Pointer extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  }
  vi.stubGlobal('PointerEvent', Pointer)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  m.bookId = 'synthetic-book'
  const page: BookPage = { id: 'p', pageNumber: 1, text: 'Original story', layout: 'image-top', createdAt: '', updatedAt: '', images: [
    { id: 's', type: 'sticker', label: 'Synthetic art', url: 'synthetic.png', position: { x: 30, y: 30, width: 40, height: 40, zIndex: 3 } },
    { id: 'other', type: 'sticker', label: 'Other art', url: 'other.png', position: { x: 5, y: 5, width: 10, height: 10, zIndex: 4 } },
  ] }
  m.source = { id: m.bookId, childId: 'synthetic-child', title: 'Synthetic book', status: 'draft', pages: [page], createdAt: '', updatedAt: '' } as Book
  m.getDoc.mockImplementation(async () => ({ id: m.bookId, exists: () => true, data: () => structuredClone(m.source) }))
})
const p = (clientX: number, clientY: number) => ({ pointerId: 1, clientX, clientY })
const persisted = () => m.persist.mock.calls.at(-1)![0] as Book
function drag(body: HTMLElement) {
  body.parentElement!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON() {} })
  fireEvent.pointerDown(body, p(100, 100))
  fireEvent.pointerMove(body, p(115, 100))
  fireEvent.pointerMove(body, p(130, 100))
  fireEvent.pointerUp(body, p(130, 100))
}

describe('BookEditorPage with real PageEditor, gesture component, useBook and history', () => {
  it('one completed move has one Undo/Redo entry and preserves subsequent story text and other art', async () => {
    render(<StrictMode><BookEditorPage /></StrictMode>)
    const body = (await screen.findByAltText('Synthetic art')).parentElement!
    drag(body)
    expect(persisted().pages[0].images[0].position?.x).toBe(40)
    expect(getComputedStyle(body).left).toBe('40%')
    const text = screen.getByDisplayValue('Original story')
    fireEvent.change(text, { target: { value: 'New words after moving' } })
    await act(async () => { fireEvent.click(screen.getByText('Undo')) })
    expect(persisted().pages[0].images[0].position?.x).toBe(30)
    expect(getComputedStyle(body).left).toBe('30%')
    expect(persisted().pages[0].text).toBe('New words after moving')
    expect(persisted().pages[0].images[1]).toEqual(m.source.pages[0].images[1])
    expect(persisted().pages[0].images[0].position?.zIndex).toBe(3)
    expect(screen.getByText('Undo').closest('[role="button"]')).toHaveAttribute('aria-disabled', 'true')
    await act(async () => { fireEvent.click(screen.getByText('Redo')) })
    expect(persisted().pages[0].images[0].position?.x).toBe(40)
    expect(getComputedStyle(body).left).toBe('40%')
    expect(persisted().pages[0].text).toBe('New words after moving')
  })
  it('does not apply the previous book history to another book with the same page/image IDs', async () => {
    const view = render(<BookEditorPage />)
    drag((await screen.findByAltText('Synthetic art')).parentElement!)
    m.bookId = 'second-book'
    m.source = { ...m.source, id: m.bookId, title: 'Second book' }
    view.rerender(<BookEditorPage />)
    await waitFor(() => expect(screen.getByText('Second book')).toBeInTheDocument())
    m.persist.mockClear()
    fireEvent.click(screen.getByText('Undo'))
    expect(m.persist).not.toHaveBeenCalled()
  })
})
