/**
 * `FIX-267` — the Today jump lands somewhere, for everybody.
 *
 * The bar's button scrolled a marker `<div>` smoothly into view and moved no
 * focus, so a parent on a keyboard or a screen reader tapped *Log extra work*
 * and nothing happened. And a smooth scroll is motion: the one preference the
 * platform offers about it was not read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LOG_WORK_ANCHOR_ID,
  focusLogWork,
  prefersReducedMotion,
  scrollBehaviourFor,
} from './logWorkJump'

/** A window whose `matchMedia` answers the reduced-motion query as given. */
function windowWith(matches: boolean): Window {
  return { matchMedia: () => ({ matches }) } as unknown as Window
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('logWorkJump — the motion preference is read', () => {
  it('reports the preference, and treats a missing matchMedia as no', () => {
    expect(prefersReducedMotion(windowWith(true))).toBe(true)
    expect(prefersReducedMotion(windowWith(false))).toBe(false)
    expect(prefersReducedMotion({} as unknown as Window)).toBe(false)
  })

  it('does not lose the jump over a matchMedia that throws', () => {
    const hostile = {
      matchMedia: () => {
        throw new Error('synthetic matchMedia failure')
      },
    } as unknown as Window
    expect(prefersReducedMotion(hostile)).toBe(false)
  })

  it('turns the preference into the behaviour', () => {
    expect(scrollBehaviourFor(true)).toBe('auto')
    expect(scrollBehaviourFor(false)).toBe('smooth')
  })
})

describe('logWorkJump — the destination takes focus', () => {
  function mountTarget() {
    const target = document.createElement('div')
    target.id = LOG_WORK_ANCHOR_ID
    target.tabIndex = -1
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView
    document.body.appendChild(target)
    return { target, scrollIntoView }
  }

  it('scrolls to the form and puts the focus in it', () => {
    const { target, scrollIntoView } = mountTarget()
    expect(focusLogWork(document, windowWith(false))).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(document.activeElement).toBe(target)
  })

  it('does not animate for a parent who asked for less motion', () => {
    const { scrollIntoView } = mountTarget()
    focusLogWork(document, windowWith(true))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('reports no jump rather than a silent no-op when the form is not mounted', () => {
    expect(focusLogWork(document, windowWith(false))).toBe(false)
  })
})
