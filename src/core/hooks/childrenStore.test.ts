import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetSharedChildren,
  addSharedChild,
  getSharedChildren,
  setSharedChildren,
  subscribeSharedChildren,
} from './childrenStore'
import type { Child } from '../types'

/**
 * `UX-362`, Codex round 2 (P2) — **the list is shared for the same reason the
 * selected id is.**
 *
 * `activeChildStore` shared *which* child is active; the list stayed in a
 * per-instance `useState` inside `useChildren`. So `addChild` reached only the
 * instance whose selector was tapped, and every other mounted consumer held a
 * list without the new child, resolved `activeChild` to `undefined`, and
 * rendered its empty branch until a reload. Round 2 caught it through
 * `ContextBar`: before `UX-362` it drew the `activeChild` **prop** its caller
 * had loaded, and after it renders `ChildSwitcherChip`, which reads the hook
 * itself — so adding a child from Today's own selector made the chip above it
 * disappear.
 *
 * POSITIVE CONTROL: make `addSharedChild` a no-op and the third case fails.
 */

const LINCOLN = { id: 'c1', name: 'Lincoln' } as Child
const LONDON = { id: 'c2', name: 'London' } as Child
const ADA = { id: 'c3', name: 'Ada' } as Child

beforeEach(() => {
  __resetSharedChildren()
})

describe('the children list is shared across every consumer (UX-362)', () => {
  it('starts empty and reports what a load published', () => {
    expect(getSharedChildren()).toEqual([])
    setSharedChildren([LINCOLN, LONDON])
    expect(getSharedChildren()).toEqual([LINCOLN, LONDON])
  })

  it('notifies every subscriber when a load lands', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeSharedChildren(a)
    subscribeSharedChildren(b)

    setSharedChildren([LINCOLN])

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('THE DEFECT: a child added in one place reaches every other consumer', () => {
    setSharedChildren([LINCOLN, LONDON])
    const other = vi.fn()
    subscribeSharedChildren(other)

    addSharedChild(ADA)

    expect(getSharedChildren().map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('adding the same child twice cannot duplicate him', () => {
    setSharedChildren([LINCOLN])
    addSharedChild(LONDON)
    addSharedChild({ ...LONDON })

    expect(getSharedChildren().map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('re-publishing the same list keeps the SAME array and notifies nobody', () => {
    // `useSyncExternalStore` compares snapshots by reference, and several
    // mounted instances resolve the same one-shot read within a frame of each
    // other — so a no-op re-publish that returned a new array would re-render
    // every consumer on every mount. This is the common case, not the edge one.
    setSharedChildren([LINCOLN, LONDON])
    const before = getSharedChildren()
    const listener = vi.fn()
    subscribeSharedChildren(listener)

    setSharedChildren([{ ...LINCOLN }, { ...LONDON }])

    expect(getSharedChildren()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('publishes a genuinely different list — a rename, a removal, a reorder', () => {
    setSharedChildren([LINCOLN, LONDON])
    setSharedChildren([{ ...LINCOLN, name: 'Linc' } as Child, LONDON])
    expect(getSharedChildren()[0].name).toBe('Linc')

    setSharedChildren([LINCOLN])
    expect(getSharedChildren()).toHaveLength(1)

    setSharedChildren([LONDON, LINCOLN])
    expect(getSharedChildren().map((c) => c.id)).toEqual(['c2', 'c1'])
  })

  it('a consumer that unsubscribes stops hearing', () => {
    const listener = vi.fn()
    const stop = subscribeSharedChildren(listener)
    stop()

    setSharedChildren([LINCOLN])

    expect(listener).not.toHaveBeenCalled()
  })
})
