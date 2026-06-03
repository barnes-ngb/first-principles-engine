import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getActiveChildId,
  setActiveChildIdShared,
  subscribeActiveChildId,
} from './activeChildStore'

describe('activeChildStore', () => {
  beforeEach(() => {
    setActiveChildIdShared('seed')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists writes and exposes them via getActiveChildId', () => {
    setActiveChildIdShared('lincoln')
    expect(getActiveChildId()).toBe('lincoln')
    expect(localStorage.getItem('fpe_active_child_id')).toBe('lincoln')
  })

  it('notifies every subscriber on change — the cross-instance sync that fixes the header/selector desync', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeActiveChildId(a)
    const unsubB = subscribeActiveChildId(b)

    setActiveChildIdShared('london')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)

    unsubA()
    unsubB()
  })

  it('does not notify when the value is unchanged', () => {
    setActiveChildIdShared('lincoln')
    const listener = vi.fn()
    const unsub = subscribeActiveChildId(listener)
    setActiveChildIdShared('lincoln')
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = subscribeActiveChildId(listener)
    unsub()
    setActiveChildIdShared('london')
    expect(listener).not.toHaveBeenCalled()
  })
})
