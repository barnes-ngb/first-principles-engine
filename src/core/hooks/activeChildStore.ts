/**
 * Shared, cross-instance store for the active child id.
 *
 * Every `useChildren()` / `useActiveChild()` call previously held its own
 * `useState` copy of the selected child, synced to the others only by reading
 * localStorage on mount. That meant switching the child in one mounted consumer
 * (e.g. the Plan My Week selector) never re-rendered another (e.g. the AppShell
 * header pill) — a real desync where the header and the page disagreed.
 *
 * A single module-level store backed by `useSyncExternalStore` keeps all
 * consumers in lock-step: a write notifies every subscriber and persists to
 * localStorage so the choice survives navigation and refresh.
 */

const ACTIVE_CHILD_KEY = 'fpe_active_child_id'

function readPersisted(): string {
  try {
    return localStorage.getItem(ACTIVE_CHILD_KEY) ?? ''
  } catch {
    return ''
  }
}

let current = readPersisted()
const listeners = new Set<() => void>()

export function getActiveChildId(): string {
  return current
}

export function setActiveChildIdShared(id: string): void {
  if (id === current) return
  current = id
  try {
    localStorage.setItem(ACTIVE_CHILD_KEY, id)
  } catch {
    /* ignore persistence failures (private mode, quota) */
  }
  for (const listener of listeners) listener()
}

export function subscribeActiveChildId(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
