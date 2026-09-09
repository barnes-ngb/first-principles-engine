import { describe, expect, it } from 'vitest'

import {
  CHILD_SWITCHER_MENU_LABEL,
  canSwitchChild,
  childSwitcherLabel,
} from './childSwitcher'

describe('canSwitchChild (UX-324)', () => {
  it('lets a parent with two children switch', () => {
    expect(canSwitchChild({ isChildProfile: false, childCount: 2 })).toBe(true)
  })

  it('refuses a child profile even when the family has two children', () => {
    // `useActiveChild` already hands a kid a no-op setter, so a menu here would
    // be a control that silently does nothing — the very defect UX-324 fixes.
    expect(canSwitchChild({ isChildProfile: true, childCount: 2 })).toBe(false)
  })

  it('refuses a single-child family — a one-entry menu cannot do anything', () => {
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
