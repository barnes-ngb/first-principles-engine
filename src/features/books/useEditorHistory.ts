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
  /** A transform owns only this image's geometry, never later story/art edits. */
  imageTransformId?: string
  imageChanges?: boolean
}

export type EditorHistoryRestore = { pageId: string; state: BookPage; imageTransformId?: string; imageChangesFrom?: BookPage }

const MAX_HISTORY = 20

export interface EditorHistory {
  canUndo: boolean
  canRedo: boolean
  /** Push a new history entry. Discards any redo branch. */
  push: (entry: Omit<EditorHistoryEntry, 'timestamp'>) => void
  /** Undo the last action. Returns the page state to restore, or null. */
  undo: () => EditorHistoryRestore | null
  /** Redo the next action. Returns the page state to apply, or null. */
  redo: () => EditorHistoryRestore | null
  /** Clear all history (e.g. on book change). */
  clear: () => void
}

/** Internal state held as a single object so undo/redo can read+write atomically. */
interface HistoryState {
  entries: EditorHistoryEntry[]
  index: number
  scope: string
}

export function useEditorHistory(scope = ''): EditorHistory {
  const [state, setState] = useState<HistoryState>({ entries: [], index: -1, scope })
  // Mutable snapshot for synchronous reads in undo/redo (avoids stale closure)
  const stateSnap = useRef(state)
  useEffect(() => { stateSnap.current = state }, [state])
  if (state.scope !== scope) {
    const empty = { entries: [], index: -1, scope }
    setState(empty)
  }

  const canUndo = state.index >= 0
  const canRedo = state.index < state.entries.length - 1

  const push = useCallback(
    (entry: Omit<EditorHistoryEntry, 'timestamp'>) => {
      const prev = stateSnap.current
      if (prev.scope !== scope) return
      const trimmed = prev.entries.slice(0, prev.index + 1)
      trimmed.push({ ...entry, timestamp: Date.now() })
      if (trimmed.length > MAX_HISTORY) trimmed.shift()
      const next = { entries: trimmed, index: trimmed.length - 1, scope }
      stateSnap.current = next
      setState(next)
    },
    [scope],
  )

  const undo = useCallback((): EditorHistoryRestore | null => {
    const s = stateSnap.current
    if (s.scope !== scope || s.index < 0) return null
    const entry = s.entries[s.index]
    const next = { ...s, index: s.index - 1 }
    stateSnap.current = next
    setState(next)
    return { pageId: entry.pageId, state: entry.before, ...(entry.imageTransformId ? { imageTransformId: entry.imageTransformId } : {}), ...(entry.imageChanges ? { imageChangesFrom: entry.after } : {}) }
  }, [scope])

  const redo = useCallback((): EditorHistoryRestore | null => {
    const s = stateSnap.current
    if (s.scope !== scope || s.index >= s.entries.length - 1) return null
    const entry = s.entries[s.index + 1]
    const next = { ...s, index: s.index + 1 }
    stateSnap.current = next
    setState(next)
    return { pageId: entry.pageId, state: entry.after, ...(entry.imageTransformId ? { imageTransformId: entry.imageTransformId } : {}), ...(entry.imageChanges ? { imageChangesFrom: entry.before } : {}) }
  }, [scope])

  const clear = useCallback(() => {
    const next = { entries: [], index: -1, scope }
    stateSnap.current = next
    setState(next)
  }, [scope])

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
