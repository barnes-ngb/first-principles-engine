import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookPage } from '../../core/types'

export interface EditorHistoryEntry {
  timestamp: number
  pageId: string
  action: string
  /** Snapshot of the page state before this change. */
  before: BookPage
  /** Snapshot of the page state after this change. */
  after: BookPage
}

const MAX_HISTORY = 20

export interface EditorHistory {
  canUndo: boolean
  canRedo: boolean
  /** Push a new history entry. Discards any redo branch. */
  push: (entry: Omit<EditorHistoryEntry, 'timestamp'>) => void
  /** Undo the last action. Returns the page state to restore, or null. */
  undo: () => { pageId: string; state: BookPage } | null
  /** Redo the next action. Returns the page state to apply, or null. */
  redo: () => { pageId: string; state: BookPage } | null
  /** Clear all history (e.g. on book change). */
  clear: () => void
}

/** Internal state held as a single object so undo/redo can read+write atomically. */
interface HistoryState {
  entries: EditorHistoryEntry[]
  index: number
}

export function useEditorHistory(): EditorHistory {
  const [state, setState] = useState<HistoryState>({ entries: [], index: -1 })
  // Mutable snapshot for synchronous reads in undo/redo (avoids stale closure)
  const stateSnap = useRef(state)
  useEffect(() => { stateSnap.current = state }, [state])

  const canUndo = state.index >= 0
  const canRedo = state.index < state.entries.length - 1

  const push = useCallback(
    (entry: Omit<EditorHistoryEntry, 'timestamp'>) => {
      setState((prev) => {
        // Discard redo branch
        const trimmed = prev.entries.slice(0, prev.index + 1)
        const full: EditorHistoryEntry = { ...entry, timestamp: Date.now() }
        trimmed.push(full)
        // Cap at MAX_HISTORY
        if (trimmed.length > MAX_HISTORY) trimmed.shift()
        return { entries: trimmed, index: trimmed.length - 1 }
      })
    },
    [],
  )

  const undo = useCallback((): { pageId: string; state: BookPage } | null => {
    const s = stateSnap.current
    if (s.index < 0) return null
    const entry = s.entries[s.index]
    setState((prev) => ({ ...prev, index: prev.index - 1 }))
    return { pageId: entry.pageId, state: entry.before }
  }, [])

  const redo = useCallback((): { pageId: string; state: BookPage } | null => {
    const s = stateSnap.current
    if (s.index >= s.entries.length - 1) return null
    const entry = s.entries[s.index + 1]
    setState((prev) => ({ ...prev, index: prev.index + 1 }))
    return { pageId: entry.pageId, state: entry.after }
  }, [])

  const clear = useCallback(() => {
    setState({ entries: [], index: -1 })
  }, [])

  return { canUndo, canRedo, push, undo, redo, clear }
}

/**
 * Keyboard listener for Ctrl+Z / Ctrl+Shift+Z.
 * Must be called in the component that owns the undo/redo callbacks.
 */
export function useUndoRedoKeys(
  onUndo: () => void,
  onRedo: () => void,
) {
  const undoRef = useRef(onUndo)
  const redoRef = useRef(onRedo)
  useEffect(() => { undoRef.current = onUndo }, [onUndo])
  useEffect(() => { redoRef.current = onRedo }, [onRedo])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          e.preventDefault()
          redoRef.current()
        } else {
          e.preventDefault()
          undoRef.current()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
