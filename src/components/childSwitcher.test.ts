import { describe, expect, it } from 'vitest'

import {
  CHILD_SWITCHER_MENU_LABEL,
  canSwitchChild,
  childSwitcherLabel,
} from './childSwitcher'

/**
 * The audience rule, with the switch forced ON. These are UX-324's original
 * assertions, re-pointed rather than deleted when UX-330 turned the switcher
 * off: the switcher had to stay provably correct while it was off, or turning
 * it back on would have been a fresh gamble. `FIX-231` turned it back on and
 * they are unchanged — which is the point of having written them this way.
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

  it('is still the whole switch — forcing it off refuses the one audience', () => {
    // The parameter is what keeps the OFF state provably correct now that the
    // shipped default is ON. Turning it back off must not be a fresh gamble
    // either, so the off path keeps its own assertions.
    expect(canSwitchChild({ isChildProfile: false, childCount: 2 }, false)).toBe(false)
  })
})

/**
 * FIX-231 — the shipped state, read by omitting the argument. `UX-329` bounded
 * the class the switcher exposed (five verdicts, a derived registry, a test
 * that fails closed) and `FIX-223` cleared the P1s, so the owner's 2026-09-11
 * decision turned the constant back on.
 */
describe('canSwitchChild as it SHIPS (FIX-231 — the switch is ON)', () => {
  it('lets a parent with two children switch', () => {
    expect(canSwitchChild({ isChildProfile: false, childCount: 2 })).toBe(true)
  })

  it('still refuses a child profile — capability, never a name', () => {
    // The flag widened exactly one audience. A kid's setter is a no-op, so a
    // menu here would be a control that silently does nothing.
    expect(canSwitchChild({ isChildProfile: true, childCount: 2 })).toBe(false)
  })

  it('still refuses a single-child family', () => {
    expect(canSwitchChild({ isChildProfile: false, childCount: 1 })).toBe(false)
    expect(canSwitchChild({ isChildProfile: false, childCount: 0 })).toBe(false)
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
