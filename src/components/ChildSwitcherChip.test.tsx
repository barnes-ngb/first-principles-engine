import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUseActiveChild = vi.fn()
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

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
