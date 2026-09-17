import { StrictMode, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../core/types'

const m = vi.hoisted(() => ({ getDoc: vi.fn(), persist: vi.fn(), xp: vi.fn(), diamond: vi.fn(), artifact: vi.fn() }))
vi.mock('firebase/firestore', () => ({ addDoc: m.artifact, deleteDoc: vi.fn(), doc: vi.fn(), getDoc: m.getDoc, getDocs: vi.fn(), orderBy: vi.fn(), query: vi.fn(), setDoc: vi.fn(), where: vi.fn() }))
vi.mock('firebase/storage', () => ({ getDownloadURL: vi.fn(), ref: vi.fn(), uploadBytes: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({ artifactsCollection: vi.fn(), booksCollection: vi.fn(), hoursCollection: vi.fn(), stripUndefined: (value: unknown) => value }))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../../core/hooks/useDebounce', () => ({ useDebounce: () => m.persist }))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: m.xp }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: m.diamond }))
import { useBook } from '../useBook'
import { replacePageBackground } from '../backgroundReplacement'

const source = (): Book => ({ id: 'book', title: 'Synthetic', status: 'draft', childId: 'child', createdAt: '', updatedAt: '', pages: [{ id: 'page', pageNumber: 1, text: 'Before', layout: 'image-top', createdAt: '', updatedAt: '', images: [
  { id: 'bg', url: 'old.png', type: 'photo' },
  { id: 'one', url: 'one.png', type: 'sticker', position: { x: 20, y: 20, width: 30, height: 30, zIndex: 1 } },
  { id: 'two', url: 'two.png', type: 'sticker', position: { x: 25, y: 25, width: 30, height: 30, zIndex: 2 } },
] }] } as Book)
const snapshot = () => ({ id: 'book', exists: () => true, data: source })
const target = { familyId: 'family', bookId: 'book', pageId: 'page', imageId: 'bg', url: 'old.png', type: 'photo' as const }
beforeEach(() => { vi.clearAllMocks(); m.getDoc.mockImplementation(async () => snapshot()) })

describe('useBook atomic document mutations', () => {
  it('composes rapid text, transform and reorder exactly once under StrictMode', async () => {
    const { result } = renderHook(() => useBook('family', 'book'), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> })
    await waitFor(() => expect(result.current.book).not.toBeNull())
    act(() => {
      result.current.updatePage('page', { text: 'Queued words' })
      result.current.updateImagePosition('page', 'one', { x: 40, y: 20, width: 30, height: 30 })
      result.current.reorderImage('page', 'one', 'up')
    })
    expect(m.persist).toHaveBeenCalledTimes(3)
    const page = result.current.book!.pages[0]
    expect(page.text).toBe('Queued words')
    expect(page.images[1].position?.x).toBe(40)
    expect(page.images[1].position!.zIndex).toBeGreaterThan(page.images[2].position!.zIndex!)
    expect(page.images[0]).toEqual(source().pages[0].images[0])
  })
  it('returns actual latest endpoints and refuses same-tick removed or changed targets without usage/persistence', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    act(() => {
      result.current.updatePage('page', { text: 'Queued words' })
      const candidate = result.current.prepareAiPageImage('new.png', 'new-path', 'A scene')
      expect(result.current.usedAiGeneration).toBe(false)
      const receipt = result.current.changePage('page', (page) => replacePageBackground(page, target, candidate), { usedAiGeneration: true })
      expect(receipt?.before.text).toBe('Queued words')
      expect(receipt?.after.images[0].url).toBe('new.png')
    })
    expect(result.current.usedAiGeneration).toBe(true)
    m.persist.mockClear()
    act(() => {
      const receipt = result.current.changePage('page', (page) => replacePageBackground(page, target, { id: 'other', type: 'photo', url: 'late.png' }))
      expect(receipt).toBeUndefined()
    })
    expect(m.persist).not.toHaveBeenCalled()
  })
  it('refuses stale callbacks while loading, across family changes, and after a round trip to reused IDs', async () => {
    const { result, rerender } = renderHook(({ family, id }) => useBook(family, id), { initialProps: { family: 'family', id: 'book' } })
    await waitFor(() => expect(result.current.book).not.toBeNull())
    const old = result.current
    let resolve!: (value: ReturnType<typeof snapshot>) => void
    m.getDoc.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    rerender({ family: 'second-family', id: 'book' })
    expect(result.current.book).toBeNull()
    act(() => old.updatePage('page', { text: 'stale' }))
    expect(m.persist).not.toHaveBeenCalled()
    await act(async () => resolve(snapshot()))
    act(() => old.addAiImageToPage('page', 'stale.png', '', 'stale'))
    expect(m.persist).not.toHaveBeenCalled()
    expect(result.current.usedAiGeneration).toBe(false)
    rerender({ family: 'family', id: 'book' })
    await waitFor(() => expect(result.current.book).not.toBeNull())
    act(() => old.updatePage('page', { text: 'stale round trip' }))
    expect(m.persist).not.toHaveBeenCalled()
  })
  it('does not persist a no-op/refusal or mark prepared/abandoned AI art as used', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    act(() => {
      result.current.prepareAiPageImage('candidate.png', '', '')
      result.current.changePage('page', () => undefined, { usedAiGeneration: true })
      result.current.updatePage('page', { text: 'Before' })
      result.current.updatePage('missing', { text: 'No target' })
    })
    expect(m.persist).not.toHaveBeenCalled()
    expect(result.current.usedAiGeneration).toBe(false)
  })
  it('awards completion only on the accepted draft-to-complete transition under StrictMode', async () => {
    const { result } = renderHook(() => useBook('family', 'book'), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> })
    await waitFor(() => expect(result.current.book).not.toBeNull())
    act(() => {
      result.current.updateBookMeta({ status: 'complete' })
      result.current.updateBookMeta({ status: 'complete', title: 'New title' })
    })
    expect(m.xp).toHaveBeenCalledTimes(1)
    expect(m.diamond).toHaveBeenCalledTimes(1)
    expect(m.artifact).toHaveBeenCalledTimes(1)
    expect(result.current.book?.title).toBe('New title')
  })
})
