/**
 * Shared, cross-instance store for the family's loaded children — the sibling
 * of `activeChildStore`, and for the same reason (`UX-362`, Codex round 2).
 *
 * `activeChildStore` already shares *which* child is active, so every consumer
 * moves together on a switch. The **list** stayed in a per-instance
 * `useState<Child[]>` inside `useChildren`, and that asymmetry is a real defect
 * rather than an oversight: `addChild` appends to the list of the one instance
 * whose selector was tapped and sets the shared id — so every *other* mounted
 * consumer holds a list that does not contain the new child, resolves
 * `activeChild` to `undefined`, and renders its empty branch until a reload.
 *
 * That was already true of `AppShell`'s chips. `UX-362` made it visible on
 * Today, because `ContextBar` used to render the `activeChild` **prop** its
 * caller had loaded and now renders `ChildSwitcherChip`, which reads the hook
 * itself — so adding a child from Today's own selector made the chip above it
 * disappear. Reading the hook is the right call (it is what makes the chip and
 * every in-page selector move together); the per-instance list was the thing
 * that had to give.
 *
 * So the id and the list are now shared the same way, and a consumer cannot
 * hold half the answer. A second effect of sharing: several mounted
 * `useChildren` instances no longer each render a different list while their
 * own one-shot reads settle.
 *
 * This is a cache of what Firestore returned, not a source of truth — nothing
 * here writes a document, and `useChildren`'s load is still what fills it.
 */

import type { Child } from '../types'

interface ChildrenSnapshot {
  children: Child[]
  familyId: string | null
}

let current: ChildrenSnapshot = { children: [], familyId: null }
const listeners = new Set<() => void>()

export function getSharedChildren(): Child[] {
  return current.children
}

export function getSharedChildrenSnapshot(): ChildrenSnapshot {
  return current
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Publish the list a load resolved to.
 *
 * Identity matters: `useSyncExternalStore` compares snapshots by reference, so
 * a no-op re-publish must return the **same array** or every consumer
 * re-renders on every mount's load. Several instances load the same family
 * within a frame of each other, so this is the common case, not the edge one.
 */
export function setSharedChildren(next: Child[], familyId: string | null = null): void {
  if (current.familyId === familyId && sameList(current.children, next)) return
  current = { children: next, familyId }
  notify()
}

/**
 * Add one child to the shared list — the `addChild` path, which is a parent
 * having just created the document.
 *
 * Idempotent by id, so two consumers reporting the same new child cannot
 * duplicate it.
 */
export function addSharedChild(child: Child, familyId = current.familyId): void {
  if (current.children.some((c) => c.id === child.id)) return
  // Only a load can certify a list after it has mixed family scopes.
  current = {
    children: [...current.children, child],
    familyId: current.familyId === familyId ? familyId : null,
  }
  notify()
}

/** Visible for tests: forget the cache so each case starts from nothing. */
export function __resetSharedChildren(): void {
  current = { children: [], familyId: null }
  notify()
}

export function subscribeSharedChildren(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Same children, in the same order, by id — the cheap identity check. */
function sameList(a: readonly Child[], b: readonly Child[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((child, i) => child.id === b[i].id && child.name === b[i].name)
}
