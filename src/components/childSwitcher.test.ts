import { describe, expect, it } from 'vitest'

import {
  CHILD_SWITCHER_MENU_LABEL,
  canSwitchChild,
  childSwitcherLabel,
} from './childSwitcher'

/**
 * The audience rule, with the UX-330 switch forced ON. These are UX-324's
 * original assertions, re-pointed rather than deleted: the switcher has to stay
 * provably correct while it is off, or turning it back on is a fresh gamble.
 */
describe('canSwitchChild with the switch ON (UX-324)', () => {
  it('lets a parent with two children switch', () => {
    expect(canSwitchChild({ isChildProfile: false, childCount: 2 }, true)).toBe(true)
  })

  it('refuses a child profile even when the family has two children', () => {
    // `useActiveChild` already hands a kid a no-op setter, so a menu here would
    // be a control that silently does nothing — the very defect UX-324 fixes.
    expect(canSwitchChild({ isChildProfile: true, childCount: 2 }, true)).toBe(false)
  })

  it('refuses a single-child family — a one-entry menu cannot do anything', () => {
    expect(canSwitchChild({ isChildProfile: false, childCount: 1 }, true)).toBe(false)
    expect(canSwitchChild({ isChildProfile: false, childCount: 0 }, true)).toBe(false)
  })
})

describe('canSwitchChild with the switch OFF (UX-330)', () => {
  it('refuses the one audience the switch is for', () => {
    // A parent with two children is the ONLY case the flag changes; every other
    // audience was already refused on capability, so this is the whole switch.
    expect(canSwitchChild({ isChildProfile: false, childCount: 2 }, false)).toBe(false)
  })

  it('leaves the capability refusals exactly as they were', () => {
    // Off is a narrowing, never a widening: nothing the rule refused with the
    // switch on becomes allowed with it off.
    expect(canSwitchChild({ isChildProfile: true, childCount: 2 }, false)).toBe(false)
    expect(canSwitchChild({ isChildProfile: false, childCount: 1 }, false)).toBe(false)
  })

  it('is what SHIPS — the default answers no to a parent with two children', () => {
    // Omitting the argument reads the shipped `CHILD_SWITCHER_ENABLED`. This is
    // the ship-state assertion: when UX-329 closes and the constant flips, this
    // expectation flips with it, in the same one-line reviewable PR.
    expect(canSwitchChild({ isChildProfile: false, childCount: 2 })).toBe(false)
  })
})

describe('switcher copy', () => {
  it('names the action AND the current child', () => {
    // "Lincoln" alone reads as a status; the accessible name has to say that
    // this opens something and whom it is currently on.
    expect(childSwitcherLabel('Lincoln')).toBe('Switch child — currently Lincoln')
    expect(CHILD_SWITCHER_MENU_LABEL).toBe('Choose a child')
  })
})
