import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUseActiveChild = vi.fn()
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

/**
 * UX-330 — the switcher ships OFF behind `CHILD_SWITCHER_ENABLED`, so the
 * switchable-path tests below force it on. They are **re-pointed at the real
 * rule, not replaced by a stub**: the mock delegates to the actual
 * `canSwitchChild` and only supplies the `enabled` argument the chip omits.
 * `undefined` falls through to the default parameter, i.e. the shipped
 * constant — which is what the last describe block asserts.
 */
const forceSwitcherEnabled: { current: boolean | undefined } = { current: undefined }
vi.mock('./childSwitcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./childSwitcher')>()
  return {
    ...actual,
    canSwitchChild: (audience: import('./childSwitcher').ChildSwitcherAudience) =>
      actual.canSwitchChild(audience, forceSwitcherEnabled.current),
  }
})

import ChildSwitcherChip from './ChildSwitcherChip'

const LINCOLN = { id: 'c1', name: 'Lincoln' }
const LONDON = { id: 'c2', name: 'London' }

function setActive(over: Record<string, unknown> = {}) {
  const setActiveChildId = vi.fn()
  mockUseActiveChild.mockReturnValue({
    activeChild: LINCOLN,
    activeChildId: LINCOLN.id,
    children: [LINCOLN, LONDON],
    setActiveChildId,
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
    ...over,
  })
  return setActiveChildId
}

beforeEach(() => {
  mockUseActiveChild.mockReset()
  // Every describe below except the last one is about the switcher's own rule,
  // which must stay provably correct while UX-330 holds it off.
  forceSwitcherEnabled.current = true
})

describe('ChildSwitcherChip — a parent with two children (UX-324)', () => {
  it('opens a menu and switches the active child', async () => {
    const setActiveChildId = setActive()
    render(<ChildSwitcherChip />)

    const chip = screen.getByRole('button', { name: 'Switch child — currently Lincoln' })
    await userEvent.click(chip)

    // Both children are offered, in the family's own order.
    expect(screen.getByRole('menuitem', { name: 'Lincoln' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'London' }))

    expect(setActiveChildId).toHaveBeenCalledWith('c2')
    expect(setActiveChildId).toHaveBeenCalledTimes(1)
  })

  it('carries the caret, which is the whole affordance', () => {
    setActive()
    render(<ChildSwitcherChip />)
    // Asserted positively here so the matching negative assertion in the
    // switch-off block below cannot pass vacuously.
    expect(screen.getByTestId('ArrowDropDownIcon')).toBeInTheDocument()
  })

  it('is keyboard reachable and opens on Enter', async () => {
    setActive()
    render(<ChildSwitcherChip />)
    await userEvent.tab()
    expect(
      screen.getByRole('button', { name: 'Switch child — currently Lincoln' }),
    ).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu', { name: 'Choose a child' })).toBeInTheDocument()
  })
})

describe('ChildSwitcherChip — read-only cases', () => {
  it('offers no menu to a child profile, and does not read as a control', () => {
    setActive({ isChildProfile: true })
    render(<ChildSwitcherChip />)

    // The name is still shown — a kid should see whose day this is.
    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    // …but there is nothing to press. A visible menu that silently did nothing
    // would be this same defect in a new place.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('offers no menu to a single-child family', () => {
    setActive({ children: [LINCOLN] })
    render(<ChildSwitcherChip />)
    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders nothing before the active child has loaded', () => {
    setActive({ activeChild: undefined })
    const { container } = render(<ChildSwitcherChip />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ChildSwitcherChip — as it SHIPS (FIX-231, the switch is ON)', () => {
  beforeEach(() => {
    // Read the shipped `CHILD_SWITCHER_ENABLED`, not a forced value.
    forceSwitcherEnabled.current = undefined
  })

  it('gives a parent with two children the real switcher', () => {
    const setActiveChildId = setActive()
    render(<ChildSwitcherChip />)

    // The caret is the affordance and the whole distinction, so it is asserted
    // positively here — a negative-only ship-state test passes vacuously.
    expect(screen.getByTestId('ArrowDropDownIcon')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Switch child — currently Lincoln' }),
    ).toBeInTheDocument()
    expect(setActiveChildId).not.toHaveBeenCalled()
  })

  it('still gives a child profile the read-only chip — capability, never a name', () => {
    const setActiveChildId = setActive({ isChildProfile: true })
    render(<ChildSwitcherChip />)

    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(setActiveChildId).not.toHaveBeenCalled()
  })

  it('still gives a single-child family the read-only chip', () => {
    setActive({ children: [LINCOLN] })
    render(<ChildSwitcherChip />)

    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ChildSwitcherChip — with the switch forced back OFF (UX-330)', () => {
  beforeEach(() => {
    forceSwitcherEnabled.current = false
  })

  it('renders the read-only chip for a parent with two children', () => {
    // Flipping the constant back must not be a fresh gamble either, so the off
    // path keeps the assertions it shipped with.
    setActive()
    render(<ChildSwitcherChip />)

    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Switch child — currently Lincoln'),
    ).not.toBeInTheDocument()
  })

  it('cannot reach the setter at all — there is nothing to press', async () => {
    const setActiveChildId = setActive()
    render(<ChildSwitcherChip />)

    await userEvent.click(screen.getByText('Lincoln'))
    expect(setActiveChildId).not.toHaveBeenCalled()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })
})
