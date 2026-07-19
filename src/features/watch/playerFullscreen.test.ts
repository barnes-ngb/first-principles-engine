import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  currentFullscreenElement,
  exitFullscreenIfActive,
  fullscreenSupported,
  requestFrameFullscreen,
} from './playerFullscreen'

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: el,
  })
}

function setFullscreenEnabled(enabled: boolean | undefined) {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: enabled,
  })
}

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'requestFullscreen')
  Reflect.deleteProperty(document, 'exitFullscreen')
  setFullscreenElement(null)
  setFullscreenEnabled(undefined)
})

describe('fullscreenSupported', () => {
  it('is false when the element Fullscreen API is absent (jsdom default)', () => {
    expect(fullscreenSupported()).toBe(false)
  })

  it('is true when the API exists AND fullscreen is enabled', () => {
    Element.prototype.requestFullscreen = vi.fn()
    setFullscreenEnabled(true)
    expect(fullscreenSupported()).toBe(true)
  })

  it('is false when the API exists but fullscreen is disabled by policy', () => {
    Element.prototype.requestFullscreen = vi.fn()
    setFullscreenEnabled(false)
    expect(fullscreenSupported()).toBe(false)
  })
})

describe('requestFrameFullscreen', () => {
  it('calls requestFullscreen on the element when available', () => {
    const el = document.createElement('div')
    const req = vi.fn(() => Promise.resolve())
    el.requestFullscreen = req
    requestFrameFullscreen(el)
    expect(req).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected fullscreen request (no user gesture) — non-fatal', () => {
    const el = document.createElement('div')
    el.requestFullscreen = vi.fn(() => Promise.reject(new Error('no gesture')))
    expect(() => requestFrameFullscreen(el)).not.toThrow()
  })

  it('is a no-op when the API is unavailable', () => {
    const el = document.createElement('div')
    expect(() => requestFrameFullscreen(el)).not.toThrow()
  })
})

describe('exitFullscreenIfActive', () => {
  it('exits when something is fullscreen', () => {
    const exit = vi.fn(() => Promise.resolve())
    document.exitFullscreen = exit
    setFullscreenElement(document.body)
    exitFullscreenIfActive()
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('does nothing when nothing is fullscreen', () => {
    const exit = vi.fn(() => Promise.resolve())
    document.exitFullscreen = exit
    setFullscreenElement(null)
    exitFullscreenIfActive()
    expect(exit).not.toHaveBeenCalled()
  })
})

describe('currentFullscreenElement', () => {
  it('reflects document.fullscreenElement', () => {
    expect(currentFullscreenElement()).toBeNull()
    setFullscreenElement(document.body)
    expect(currentFullscreenElement()).toBe(document.body)
  })
})
