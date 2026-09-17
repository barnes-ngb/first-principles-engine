import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, BookPage } from '../../../core/types'

const m = vi.hoisted(() => ({ source: null as unknown as Book, persist: vi.fn(), getDoc: vi.fn(), bookId: 'synthetic-book', atLimit: true, generate: vi.fn(), api: null as ReturnType<typeof import('../useBook').useBook> | null }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ bookId: m.bookId }) }))
vi.mock('/src/core/auth/useAuth', () => ({ useFamilyId: () => 'synthetic-family' }))
vi.mock('/src/core/hooks/useActiveChild', () => ({ useActiveChild: () => ({ activeChild: { id: 'synthetic-child', name: 'Test Child' }, children: [{ id: 'synthetic-child', name: 'Test Child' }], isChildProfile: true }) }))
vi.mock('/src/core/profile/useProfile', () => ({ useProfile: () => ({ profile: 'child', themeMode: 'family', canEdit: true }) }))
vi.mock('/src/core/ai/useAI', () => ({ useAI: () => ({ imageFailureRef: { current: null }, generateImage: m.generate, enhanceSketch: vi.fn(), loading: false }) }))
vi.mock('../useBookArtQuota', () => ({ useBookArtQuota: () => ({ atLimit: m.atLimit, limit: 100, remaining: m.atLimit ? 0 : 100, recordGeneration: vi.fn() }), recordBookArtGeneration: vi.fn() }))
vi.mock('../useBook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useBook')>()
  return { ...actual, useBook: (...args: Parameters<typeof actual.useBook>) => { const result = actual.useBook(...args); m.api = result; return result } }
})
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
  m.atLimit = true
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
  it('reorders one sticker without changing a positionless photo, and can undo/redo that order', async () => {
    m.source.pages[0].images.unshift({ id: 'bg', type: 'photo', label: 'Background', url: 'background.png' })
    render(<BookEditorPage />)
    await screen.findByAltText('Synthetic art')
    fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    const row = screen.getByText('Synthetic art').parentElement!
    fireEvent.click(within(row).getByTestId('KeyboardArrowUpIcon').closest('button')!)
    expect(persisted().pages[0].images[0]).toEqual(m.source.pages[0].images[0])
    const z = () => persisted().pages[0].images.filter((image) => image.type === 'sticker').map((image) => image.position?.zIndex)
    expect(z()[0]).toBeGreaterThan(z()[1]!)
    fireEvent.change(screen.getByDisplayValue('Original story'), { target: { value: 'Story stays after ordering' } })
    fireEvent.click(screen.getByText('Undo'))
    expect(z()).toEqual([3, 4])
    expect(persisted().pages[0].text).toBe('Story stays after ordering')
    fireEvent.click(screen.getByText('Redo'))
    expect(z()[0]).toBeGreaterThan(z()[1]!)
  })
  it('replaces only the selected background, preserving placed photos, other backgrounds and newer text through Undo', async () => {
    m.source.pages[0].images.unshift(
      { id: 'bg', type: 'photo', label: 'Chosen background', url: 'background.png', fit: 'fit' },
      { id: 'other-bg', type: 'ai-generated', label: 'Other background', url: 'other-background.png' },
      { id: 'placed', type: 'photo', layerType: 'element', label: 'Placed photo', url: 'placed.png', position: { x: 10, y: 15, width: 35, height: 40 } },
    )
    render(<BookEditorPage />)
    await screen.findByAltText('Synthetic art')
    fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    fireEvent.click(screen.getByText('Chosen background'))
    fireEvent.click(screen.getByRole('button', { name: 'Change picture' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change picture' }))
    fireEvent.click(screen.getByText('From gallery'))
    const dialog = await screen.findByRole('dialog', { name: 'Pick a picture' })
    expect(within(dialog).getByAltText('Placed photo')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByAltText('Other background'))
    await waitFor(() => expect(persisted().pages[0].images.find((image) => image.id === 'bg')?.url).toBe('other-background.png'))
    expect(persisted().pages[0].images.slice(1)).toEqual(m.source.pages[0].images.slice(1))
    expect(persisted().pages[0].images[0].fit).toBe('fit')
    fireEvent.change(screen.getByDisplayValue('Original story'), { target: { value: 'Keep new story' } })
    fireEvent.click(screen.getByText('Undo'))
    expect(persisted().pages[0].images[0].url).toBe('background.png')
    expect(persisted().pages[0].text).toBe('Keep new story')
    fireEvent.click(screen.getByText('Redo'))
    expect(persisted().pages[0].images[0].url).toBe('other-background.png')
  })

  it.each([false, true])('keeps a generated replacement preview on refusal (target removed: %s)', async (removed) => {
    m.atLimit = false
    m.generate.mockResolvedValue({ url: 'generated.png', storagePath: 'generated-path' })
    m.source.pages[0].images.unshift({ id: 'bg', type: 'photo', url: 'background.png', label: 'Background' })
    render(<BookEditorPage />)
    await screen.findByAltText('Synthetic art')
    fireEvent.click(screen.getByRole('button', { name: 'Change picture' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change picture' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Change picture' })).getByText('Make a picture'))
    const dialog = await screen.findByRole('dialog', { name: 'Make a picture' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make it' }))
    await within(dialog).findByAltText('Your new picture')
    if (removed) act(() => { m.api!.changePage('p', (page) => ({ ...page, images: page.images.filter((image) => image.id !== 'bg') })) })
    m.persist.mockClear()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use it' }))
    if (removed) {
      expect(within(dialog).getByAltText('Your new picture')).toBeInTheDocument()
      expect(within(dialog).getByText(/picture changed while you were choosing/i)).toBeInTheDocument()
      expect(m.persist).not.toHaveBeenCalled()
      expect(m.api!.usedAiGeneration).toBe(false)
    } else {
      expect(persisted().pages[0].images[0]).toMatchObject({ id: 'bg', url: 'generated.png', layerType: 'background' })
      expect(persisted().pages[0].images.slice(1)).toEqual(m.source.pages[0].images.slice(1))
      fireEvent.click(screen.getByText('Undo'))
      expect(persisted().pages[0].images[0].url).toBe('background.png')
      expect(screen.getByText('Undo').closest('[role="button"]')).toHaveAttribute('aria-disabled', 'true')
    }
    expect(m.generate).toHaveBeenCalledTimes(1)
  })

  it('keeps newer same-ID art and its source metadata coherent when undoing an earlier replacement', async () => {
    m.source.pages[0].images.unshift(
      { id: 'bg', type: 'photo', url: 'background.png', label: 'Target art' },
      { id: 'source', type: 'ai-generated', url: 'source.png', label: 'Source' },
    )
    render(<BookEditorPage />)
    await screen.findByAltText('Synthetic art')
    fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    fireEvent.click(screen.getByText('Target art'))
    fireEvent.click(screen.getByRole('button', { name: 'Change picture' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change picture' }))
    fireEvent.click(screen.getByText('From gallery'))
    const dialog = await screen.findByRole('dialog', { name: 'Pick a picture' })
    fireEvent.click(within(dialog).getByAltText('Source'))
    const newer = { ...m.api!.book!.pages[0].images[0], url: 'newer-art.png' }
    act(() => { m.api!.changePage('p', (page) => ({ ...page, images: page.images.map((image) => image.id === 'bg' ? newer : image) })) })
    fireEvent.click(screen.getByText('Undo'))
    expect(m.api!.book!.pages[0].images[0]).toMatchObject(newer)
    expect(m.api!.book!.pages[0].images[0].type).toBe('ai-generated')
    expect(m.api!.book!.pages[0].images[0].prompt).toBe('From gallery')
    fireEvent.click(screen.getByText('Redo'))
    expect(m.api!.book!.pages[0].images[0]).toMatchObject(newer)
  })
})
