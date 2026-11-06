import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeAvatarProfile } from '../normalizeProfile'
import { buildHeroAppearance } from './heroAppearance'
import { HERO_MOTION_MS } from './heroEntranceMotion'
import { HERO_ROAD } from './villageMapLayout'
import StonebridgeHeroStage from './StonebridgeHeroStage'

const fx = vi.hoisted(() => ({ reduced: false }))
vi.mock('@mui/material/useMediaQuery', () => ({ default: () => fx.reduced }))
type Observer = { callback: IntersectionObserverCallback; target: Element | null; disconnect: ReturnType<typeof vi.fn> }
let observers: Observer[]
let frames: Map<number, FrameRequestCallback>
let frameId: number
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
const appearance = buildHeroAppearance({ profile: normalizeAvatarProfile({}), hasSavedFeatures: false })
const props = { appearance, exposureKey: 'a-read-1', exposed: true }
const stage = () => screen.getByTestId('hero-stage')
const walker = () => screen.getByTestId('hero-walker')
function intersect(visible = true, observer = observers[observers.length - 1], ratio = visible ? 1 : 0) {
  act(() => observer.callback([{ target: observer.target!, isIntersecting: visible, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver))
}
function frame() {
  const first = [...frames.entries()][0]
  if (!first) throw new Error('Expected an armed frame')
  frames.delete(first[0])
  act(() => first[1](0))
}
function startWalk() { intersect(); frame(); frame() }
function hidden(value: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
}

beforeEach(() => {
  vi.useFakeTimers()
  fx.reduced = false
  observers = []
  frames = new Map()
  frameId = 0
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('IntersectionObserver', class {
    entry: Observer
    constructor(callback: IntersectionObserverCallback) {
      this.entry = { callback, target: null, disconnect: vi.fn() }
      observers.push(this.entry)
    }
    observe(target: Element) { this.entry.target = target }
    disconnect() { this.entry.disconnect() }
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor)
  else Reflect.deleteProperty(document, 'hidden')
})

describe('finite visible entrance', () => {
  it('waits for the actual complete hero corridor, paints a start frame, steps, waves, then stops', () => {
    render(<StonebridgeHeroStage {...props} />)
    expect(observers[0].target).toBe(screen.getByTestId('hero-corridor'))
    expect(walker().style.visibility).toBe('hidden')
    expect(frames.size).toBe(0)
    intersect(true, observers[0], 0.2)
    expect(frames.size).toBe(0)
    intersect()
    expect(walker().style.transform).toBe(`translate(${HERO_ROAD.startX}px, ${HERO_ROAD.startGround}px)`)
    expect(walker().style.transition).toBe('none')
    frame()
    expect(stage()).toHaveAttribute('data-hero-phase', 'armed')
    expect(walker().style.transform).toBe(`translate(${HERO_ROAD.startX}px, ${HERO_ROAD.startGround}px)`)
    frame()
    expect(stage()).toHaveAttribute('data-hero-phase', 'entering')
    expect(walker().style.transform).toBe(`translate(${HERO_ROAD.stopX}px, ${HERO_ROAD.ground}px)`)
    expect(walker().style.transition).toBe(`transform ${HERO_MOTION_MS.enter}ms linear`)
    for (const leg of screen.getAllByTestId('hero-leg')) {
      expect(getComputedStyle(leg).animation).toContain('200ms linear 6')
    }
    const legs = screen.getAllByTestId('hero-leg')
    expect(getComputedStyle(legs[0]).animation).not.toBe(getComputedStyle(legs[1]).animation)
    act(() => vi.advanceTimersByTime(HERO_MOTION_MS.enter))
    expect(stage()).toHaveAttribute('data-hero-phase', 'waving')
    expect(getComputedStyle(screen.getByTestId('hero-wave-arm')).animation).toContain('350ms ease-in-out 2')
    act(() => vi.advanceTimersByTime(HERO_MOTION_MS.wave))
    expect(stage()).toHaveAttribute('data-hero-phase', 'settled')
    expect(getComputedStyle(screen.getByTestId('hero-wave-arm')).animation).toBe('none')
    expect(vi.getTimerCount()).toBe(0)
    expect(frames.size).toBe(0)
    act(() => vi.advanceTimersByTime(60000))
    expect(stage()).toHaveAttribute('data-hero-phase', 'settled')
  })

  it('reduced motion draws the stable pose with no pending clock', () => {
    fx.reduced = true
    render(<StonebridgeHeroStage {...props} />)
    intersect()
    expect(walker().style.transform).toContain(`${HERO_ROAD.stopX}px`)
    expect(walker().style.transition).toBe('none')
    expect(getComputedStyle(screen.getByTestId('hero-wave-arm')).animation).toBe('none')
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['modal-or-Places', 'offscreen', 'document-hidden', 'reduced'] as const)('cancels %s and refuses retained same-key completion after eligibility returns', (reason) => {
    const timers = vi.spyOn(window, 'setTimeout')
    const { rerender } = render(<StonebridgeHeroStage {...props} />)
    startWalk()
    const retained = timers.mock.calls.find((call) => call[1] === HERO_MOTION_MS.enter)![0] as () => void
    if (reason === 'modal-or-Places') rerender(<StonebridgeHeroStage {...props} exposed={false} />)
    if (reason === 'offscreen') intersect(false)
    if (reason === 'document-hidden') hidden(true)
    if (reason === 'reduced') { fx.reduced = true; rerender(<StonebridgeHeroStage {...props} />) }
    expect(vi.getTimerCount()).toBe(0)
    expect(frames.size).toBe(0)
    expect(walker().style.transition).toBe('none')
    if (reason === 'offscreen') intersect()
    if (reason === 'document-hidden') hidden(false)
    fx.reduced = false
    rerender(<StonebridgeHeroStage {...props} />)
    act(retained)
    expect(stage()).toHaveAttribute('data-hero-phase', 'settled')
    expect(stage()).toHaveAttribute('data-hero-waving', 'false')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels both armed frames and refuses an old observer after unmount', () => {
    const { rerender, unmount } = render(<StonebridgeHeroStage {...props} />)
    intersect()
    frame()
    const retainedFrame = [...frames.values()][0]
    rerender(<StonebridgeHeroStage {...props} exposed={false} />)
    expect(frames.size).toBe(0)
    act(() => retainedFrame(0))
    expect(stage()).toHaveAttribute('data-hero-phase', 'armed')
    const old = observers[0]
    unmount()
    expect(old.disconnect).toHaveBeenCalled()
    render(<StonebridgeHeroStage {...props} exposureKey="b-read-1" />)
    intersect(true, old)
    expect(walker().style.visibility).toBe('hidden')
    expect(frames.size).toBe(0)
  })

  it('a new read gets its own entrance while incidental appearances do not replay', () => {
    const { rerender } = render(<StonebridgeHeroStage {...props} />)
    startWalk()
    act(() => vi.advanceTimersByTime(HERO_MOTION_MS.enter + HERO_MOTION_MS.wave))
    // Drain each committed phase separately rather than assume React commits mid tick.
    act(() => vi.advanceTimersByTime(HERO_MOTION_MS.wave))
    expect(stage()).toHaveAttribute('data-hero-phase', 'settled')
    rerender(<StonebridgeHeroStage {...props} appearance={{ ...appearance, shirt: '#abcdef' }} />)
    expect(stage()).toHaveAttribute('data-hero-phase', 'settled')
    expect(frames.size).toBe(0)
    rerender(<StonebridgeHeroStage {...props} exposureKey="b-read-1" />)
    expect(stage()).toHaveAttribute('data-hero-phase', 'armed')
    expect(frames.size).toBe(1)
  })
})
