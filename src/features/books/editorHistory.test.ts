import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorHistory } from './useEditorHistory'
import type { BookPage } from '../../core/types'

function makePage(overrides: Partial<BookPage> = {}): BookPage {
  return {
    id: 'page_1',
    pageNumber: 1,
    text: '',
    images: [],
    layout: 'image-top',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useEditorHistory', () => {
  it('starts with canUndo=false and canRedo=false', () => {
    const { result } = renderHook(() => useEditorHistory())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('canUndo becomes true after push', () => {
    const { result } = renderHook(() => useEditorHistory())
    const before = makePage({ text: 'old' })
    const after = makePage({ text: 'new' })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'text_change', before, after })
    })

    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('undo returns the before state', () => {
    const { result } = renderHook(() => useEditorHistory())
    const before = makePage({ text: 'old' })
    const after = makePage({ text: 'new' })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'text_change', before, after })
    })

    let undoResult: ReturnType<typeof result.current.undo>
    act(() => {
      undoResult = result.current.undo()
    })

    expect(undoResult!).not.toBeNull()
    expect(undoResult!.pageId).toBe('page_1')
    expect(undoResult!.state.text).toBe('old')
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('redo returns the after state', () => {
    const { result } = renderHook(() => useEditorHistory())
    const before = makePage({ text: 'old' })
    const after = makePage({ text: 'new' })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'text_change', before, after })
    })
    act(() => {
      result.current.undo()
    })

    let redoResult: ReturnType<typeof result.current.redo>
    act(() => {
      redoResult = result.current.redo()
    })

    expect(redoResult!).not.toBeNull()
    expect(redoResult!.state.text).toBe('new')
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('undo returns null when nothing to undo', () => {
    const { result } = renderHook(() => useEditorHistory())

    let undoResult: ReturnType<typeof result.current.undo>
    act(() => {
      undoResult = result.current.undo()
    })

    expect(undoResult!).toBeNull()
  })

  it('redo returns null when nothing to redo', () => {
    const { result } = renderHook(() => useEditorHistory())

    let redoResult: ReturnType<typeof result.current.redo>
    act(() => {
      redoResult = result.current.redo()
    })

    expect(redoResult!).toBeNull()
  })

  it('push after undo discards redo branch', () => {
    const { result } = renderHook(() => useEditorHistory())
    const s1 = makePage({ text: 'v1' })
    const s2 = makePage({ text: 'v2' })
    const s3 = makePage({ text: 'v3' })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'a', before: s1, after: s2 })
    })
    act(() => {
      result.current.push({ pageId: 'page_1', action: 'b', before: s2, after: s3 })
    })
    // Undo once (back to s2)
    act(() => {
      result.current.undo()
    })
    expect(result.current.canRedo).toBe(true)

    // Push a new action — redo branch should be gone
    const s4 = makePage({ text: 'v4' })
    act(() => {
      result.current.push({ pageId: 'page_1', action: 'c', before: s2, after: s4 })
    })
    expect(result.current.canRedo).toBe(false)

    // Undo should give us s2, not s3
    let undoResult: ReturnType<typeof result.current.undo>
    act(() => {
      undoResult = result.current.undo()
    })
    expect(undoResult!.state.text).toBe('v2')
  })

  it('caps history at 20 entries', () => {
    const { result } = renderHook(() => useEditorHistory())

    for (let i = 0; i < 25; i++) {
      const before = makePage({ text: `v${i}` })
      const after = makePage({ text: `v${i + 1}` })
      act(() => {
        result.current.push({ pageId: 'page_1', action: `action_${i}`, before, after })
      })
    }

    // Should still be able to undo, but limited to 20 entries
    let undoCount = 0
    while (result.current.canUndo) {
      act(() => { result.current.undo() })
      undoCount++
    }
    expect(undoCount).toBeLessThanOrEqual(20)
  })

  it('clear resets all history', () => {
    const { result } = renderHook(() => useEditorHistory())
    const before = makePage({ text: 'old' })
    const after = makePage({ text: 'new' })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'a', before, after })
    })
    expect(result.current.canUndo).toBe(true)

    act(() => {
      result.current.clear()
    })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('undo after sticker add returns page without sticker', () => {
    const { result } = renderHook(() => useEditorHistory())
    const before = makePage({ images: [] })
    const after = makePage({
      images: [{ id: 'img_1', url: 'https://example.com/sticker.png', type: 'sticker' }],
    })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'add_image', before, after })
    })

    let undoResult: ReturnType<typeof result.current.undo>
    act(() => {
      undoResult = result.current.undo()
    })

    expect(undoResult!.state.images).toEqual([])
  })

  it('undo after sticker move reverts position', () => {
    const { result } = renderHook(() => useEditorHistory())
    const img = { id: 'img_1', url: 'u', type: 'sticker' as const }
    const before = makePage({
      images: [{ ...img, position: { x: 10, y: 10, width: 30, height: 30 } }],
    })
    const after = makePage({
      images: [{ ...img, position: { x: 50, y: 50, width: 30, height: 30 } }],
    })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'move_image', before, after })
    })

    let undoResult: ReturnType<typeof result.current.undo>
    act(() => {
      undoResult = result.current.undo()
    })

    expect(undoResult!.state.images[0].position?.x).toBe(10)
  })

  it('redo after undo re-applies the change', () => {
    const { result } = renderHook(() => useEditorHistory())
    const before = makePage({ images: [] })
    const after = makePage({
      images: [{ id: 'img_1', url: 'u', type: 'ai-generated' }],
    })

    act(() => {
      result.current.push({ pageId: 'page_1', action: 'replace_background', before, after })
    })
    act(() => {
      result.current.undo()
    })

    let redoResult: ReturnType<typeof result.current.redo>
    act(() => {
      redoResult = result.current.redo()
    })

    expect(redoResult!.state.images).toHaveLength(1)
    expect(redoResult!.state.images[0].type).toBe('ai-generated')
  })
})
