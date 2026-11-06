import { describe, expect, it, vi } from 'vitest'

import { VillageLocationState } from './computeStonebridgeProgress'
import {
  VillagePlacesView,
  createOpenerRegistry,
  placeCondition,
  placeControlName,
} from './villageOpeners'

/**
 * The one vocabulary and the one registry behind the village's place controls.
 *
 * Both exist because there are now TWO possible controls for one place — the
 * building on the map and the row in the Places list — and only one of them is
 * on screen at a time. That is where the two defects this file pins live: a
 * place described in two different sets of words, and a focus hand-off that
 * lands on a node which is no longer in the document.
 *
 * Pure: no DOM, no React, no Firestore. The nodes are stand-ins with the two
 * properties the registry is allowed to care about, which is also the point —
 * the rule is about `isConnected`, not about MUI.
 */

interface FakeNode {
  isConnected: boolean
  focus: () => void
}

const node = (): FakeNode => ({ isConnected: true, focus: vi.fn() })

describe('one place, one sentence', () => {
  it('says the condition the board has always said', () => {
    expect(placeCondition(VillageLocationState.Repaired)).toBe('Fixed.')
    expect(placeCondition(VillageLocationState.Active)).toBe('Being fixed now.')
    expect(placeCondition(VillageLocationState.Upcoming)).toBe('Not started yet.')
  })

  it('and a control names the place and then its condition', () => {
    expect(placeControlName('The Library Hut', VillageLocationState.Active)).toBe(
      'Visit The Library Hut. Being fixed now.',
    )
    expect(placeControlName('The Old Bridge', VillageLocationState.Repaired)).toBe(
      'Visit The Old Bridge. Fixed.',
    )
  })

  it('and the two views are the only two there are', () => {
    // A third way in would need its own control, its own tab stops and its own
    // answer to which set is live — so it fails here first.
    expect(Object.values(VillagePlacesView)).toEqual(['map', 'places'])
  })
})

describe('the registry hands back the control that is really on screen', () => {
  it('resolves the control that registered for a place', () => {
    const registry = createOpenerRegistry<FakeNode>()
    const target = node()
    registry.register('library_hut', target)
    expect(registry.resolve('library_hut')).toBe(target)
    expect(registry.focus('library_hut')).toBe('opener')
    expect(target.focus).toHaveBeenCalledTimes(1)
  })

  it('refuses a detached node, and forgets it', () => {
    // The defect: `focus()` on a node outside the document moves the focus to
    // `document.body` while every caller believes it landed somewhere.
    const registry = createOpenerRegistry<FakeNode>()
    const target = node()
    registry.register('the_forge', target)
    target.isConnected = false

    expect(registry.resolve('the_forge')).toBeNull()
    expect(registry.focus('the_forge')).toBe('none')
    expect(target.focus).not.toHaveBeenCalled()
    expect(registry.size()).toBe(0)
  })

  it('a replaced control’s cleanup does not null out its replacement', () => {
    // Switching from the map to the list mounts the new control and unmounts
    // the old one in the same commit, and the two share a key. If the old
    // one's `ref(null)` won, the place would have no opener while a perfectly
    // good one was on screen — and the focus would land nowhere.
    const registry = createOpenerRegistry<FakeNode>()
    const mapTarget = node()
    const listTile = node()

    registry.register('old_bridge', mapTarget)
    // The replacement registers first…
    registry.register('old_bridge', listTile)
    // …and then the one it replaced is torn down.
    mapTarget.isConnected = false
    registry.register('old_bridge', null)

    expect(registry.resolve('old_bridge')).toBe(listTile)
    expect(registry.focus('old_bridge')).toBe('opener')
    expect(listTile.focus).toHaveBeenCalledTimes(1)
    expect(mapTarget.focus).not.toHaveBeenCalled()
  })

  it('and the other order leaves the replacement in place too', () => {
    // The same commit, the other way round: the old control is nulled before
    // the new one registers. Nothing is held afterwards except the new one.
    const registry = createOpenerRegistry<FakeNode>()
    const mapTarget = node()
    const listTile = node()

    registry.register('banner_hall', mapTarget)
    mapTarget.isConnected = false
    registry.register('banner_hall', null)
    expect(registry.resolve('banner_hall')).toBeNull()

    registry.register('banner_hall', listTile)
    expect(registry.resolve('banner_hall')).toBe(listTile)
  })

  it('an ordinary re-render keeps the control it already has', () => {
    // An inline `ref` callback is called with null on every re-render, with the
    // node still in the document. That must not drop the entry.
    const registry = createOpenerRegistry<FakeNode>()
    const target = node()
    registry.register('watchtower', target)
    registry.register('watchtower', null)
    expect(registry.resolve('watchtower')).toBe(target)
  })
})

describe('what happens when there is no control for the place', () => {
  it('a plain focus takes nothing — no nearest thing, no guess', () => {
    // What a return from My Books needs: a request naming a place this board
    // does not have leaves the focus exactly where it was. There is no
    // fallback on this path at all, which is why it is a separate call.
    const registry = createOpenerRegistry<FakeNode>()
    expect(registry.focus('not_a_place')).toBe('none')
    expect(registry.focus(null)).toBe('none')
  })

  it('a closing view falls back, because the keyboard has to land somewhere', () => {
    const registry = createOpenerRegistry<FakeNode>()
    const fallback = vi.fn()
    expect(registry.focusOrFallback('not_a_place', fallback)).toBe('fallback')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('and it does not fall back when the exact control is still there', () => {
    const registry = createOpenerRegistry<FakeNode>()
    const target = node()
    const fallback = vi.fn()
    registry.register('lantern_path', target)
    expect(registry.focusOrFallback('lantern_path', fallback)).toBe('opener')
    expect(target.focus).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })
})
