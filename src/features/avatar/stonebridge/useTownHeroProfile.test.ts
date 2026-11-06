import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import { endLibraryReturnFlow, getLibraryReturnFlow, observeLibraryReturnIdentity } from './libraryReturnFlow'
import { useTownHeroProfile } from './useTownHeroProfile'

type Listener = {
  path: string
  next: (snapshot: { exists: () => boolean; data: () => unknown }) => void
  error: (error: Error) => void
  closed: boolean
}
const fx = vi.hoisted(() => ({ listeners: [] as Listener[], write: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({
  avatarProfilesCollection: (familyId: string) => `families/${familyId}/avatarProfiles`,
}))
vi.mock('firebase/firestore', () => ({
  doc: (collection: string, childId: string) => ({ path: `${collection}/${childId}` }),
  onSnapshot: (ref: { path: string }, next: Listener['next'], error: Listener['error']) => {
    const listener = { path: ref.path, next, error, closed: false }
    fx.listeners.push(listener)
    return () => {
      listener.closed = true
      // A hostile retained completion delivered synchronously by unsubscribe.
      next({ exists: () => true, data: () => ({ childId: 'stale-unsubscribe' }) })
    }
  },
  setDoc: fx.write,
  updateDoc: fx.write,
  addDoc: fx.write,
}))

const initial = { familyId: 'family-a', childId: 'a', ready: true, identityKey: 'parent' }
const saved = (childId: string, color = '#123456') => ({
  childId, characterFeatures: { skinTone: color, hairColor: '#654321', eyeColor: '#112233' },
})
function deliver(listener: Listener, data: unknown) {
  act(() => listener.next({ exists: () => data !== null, data: () => data }))
}
const last = () => fx.listeners[fx.listeners.length - 1]

beforeEach(() => {
  fx.listeners = []
  fx.write.mockClear()
  setActiveChildIdShared('a')
  observeLibraryReturnIdentity('family-a|parent|a')
  endLibraryReturnFlow()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  expect(fx.write).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('the actual owned profile subscriber', () => {
  it('holds B empty, refuses retained A success/error/unsubscribe and accepts only B’s path', () => {
    const { result, rerender } = renderHook(useTownHeroProfile, { initialProps: initial })
    const a = last()
    expect(a.path).toBe('families/family-a/avatarProfiles/a')
    deliver(a, saved('a'))
    expect(result.current.document?.profile.childId).toBe('a')
    rerender({ ...initial, childId: 'b' })
    const b = last()
    expect(a.closed).toBe(true)
    expect(b.path).toBe('families/family-a/avatarProfiles/b')
    expect(result.current.phase).toBe('loading')
    expect(result.current.document).toBeNull()
    deliver(a, saved('a', '#ffffff'))
    act(() => a.error(new Error('late A')))
    expect(result.current.phase).toBe('loading')
    deliver(b, saved('b'))
    expect(result.current.document?.profile.childId).toBe('b')
  })

  it('refuses raw same-tick ABA even though the resolved child never changes', () => {
    const { result } = renderHook(useTownHeroProfile, { initialProps: initial })
    const first = last()
    deliver(first, saved('a'))
    const exposure = result.current.exposureKey
    act(() => { setActiveChildIdShared('b'); setActiveChildIdShared('a') })
    expect(result.current.phase).toBe('loading')
    expect(result.current.document).toBeNull()
    expect(result.current.exposureKey).not.toBe(exposure)
    deliver(first, saved('a'))
    expect(result.current.phase).toBe('loading')
    deliver(last(), saved('a', '#abcdef'))
    expect(result.current.document?.profile.characterFeatures?.skinTone).toBe('#abcdef')
  })

  it('reacts to parent/kid epochs with NO Books journey, re-reading instead of dead callbacks', () => {
    const { result } = renderHook(useTownHeroProfile, { initialProps: initial })
    const first = last()
    deliver(first, saved('a'))
    expect(getLibraryReturnFlow()).toBeNull()
    act(() => observeLibraryReturnIdentity('family-a|kid-a|a'))
    expect(first.closed).toBe(true)
    expect(result.current.phase).toBe('loading')
    deliver(first, saved('a'))
    expect(result.current.document).toBeNull()
    const second = last()
    deliver(second, saved('a', '#abcdef'))
    expect(result.current.phase).toBe('ready')
    act(() => observeLibraryReturnIdentity('family-a|parent|a'))
    expect(second.closed).toBe(true)
    expect(result.current.document).toBeNull()
    deliver(last(), saved('a'))
    expect(result.current.phase).toBe('ready')
  })

  it('clears on the actual profile render before its passive epoch watch, and on family changes', () => {
    const { result, rerender } = renderHook(useTownHeroProfile, { initialProps: initial })
    deliver(last(), saved('a'))
    const old = last()
    rerender({ ...initial, identityKey: 'kid-a' })
    expect(result.current.document).toBeNull()
    expect(old.closed).toBe(true)
    deliver(last(), saved('a'))
    rerender({ ...initial, familyId: 'family-b' })
    expect(result.current.document).toBeNull()
    expect(last().path).toBe('families/family-b/avatarProfiles/a')
  })

  it('gates unsettled/failed children readiness, and restarts when ready', () => {
    const { result, rerender } = renderHook(useTownHeroProfile, { initialProps: initial })
    const old = last()
    deliver(old, saved('a'))
    rerender({ ...initial, ready: false })
    expect(result.current.phase).toBe('idle')
    expect(result.current.document).toBeNull()
    expect(old.closed).toBe(true)
    deliver(old, saved('a'))
    rerender(initial)
    expect(result.current.phase).toBe('loading')
    deliver(last(), saved('a'))
    expect(result.current.phase).toBe('ready')
  })

  it('distinguishes missing/error/legacy ownership/mismatch, and retries by read only', () => {
    const { result } = renderHook(useTownHeroProfile, { initialProps: initial })
    deliver(last(), null)
    expect(result.current.phase).toBe('missing')
    expect(result.current.document).toBeNull()
    act(() => last().error(new Error('offline')))
    expect(result.current.phase).toBe('error')
    expect(result.current.failure).toBe('read')
    const old = last()
    act(() => result.current.retry())
    expect(result.current.phase).toBe('loading')
    expect(old.closed).toBe(true)
    deliver(last(), { totalXp: 0 })
    expect(result.current.phase).toBe('ready')
    expect(result.current.document?.hasSavedFeatures).toBe(false)
    deliver(last(), saved('b'))
    expect(result.current.phase).toBe('error')
    expect(result.current.failure).toBe('mismatch')
    expect(result.current.document).toBeNull()
  })

  it('does not replay an exposure on incidental snapshots and refuses stale retry/unmount callbacks', () => {
    const { result, unmount } = renderHook(useTownHeroProfile, { initialProps: initial })
    const old = last()
    deliver(old, saved('a'))
    const exposure = result.current.exposureKey
    deliver(old, { ...saved('a'), updatedAt: '2030-01-01' })
    expect(result.current.exposureKey).toBe(exposure)
    const staleRetry = result.current.retry
    act(() => observeLibraryReturnIdentity('family-a|kid-a|a'))
    const count = fx.listeners.length
    act(staleRetry)
    expect(fx.listeners).toHaveLength(count)
    const current = last()
    unmount()
    expect(current.closed).toBe(true)
    deliver(current, saved('a'))
    act(() => current.error(new Error('after unmount')))
    expect(fx.listeners).toHaveLength(count)
  })
})
