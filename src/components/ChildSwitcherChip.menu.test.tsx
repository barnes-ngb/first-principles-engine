import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `FEAT-237` / `UX-425` — the chip is the ONE place a parent chooses the child,
 * and since the ten in-page `ChildSelector`s went it is also the one place a
 * parent ADDS one.
 *
 * Owner, 2026-09-13, after the first post-deploy test: *"There are now as many
 * as four locations to choose a child. I like the chip drop-down in the header
 * as the primary source; remove the others. Keep the actual profile change
 * between parent and child."*
 *
 * `AddChildDialog` had exactly one host in the app — `ChildSelector` — so
 * removing the selectors without moving the door would have left a family
 * unable to add a second child at all, and a family with NO children unable to
 * add a first. Both are asserted below, because both are the kind of hole that
 * a green suite over the removal alone would not have shown.
 *
 * Only the Firestore edges are stubbed (`src/test/childSwitchHarness.tsx`): the
 * real `useActiveChild`, the real shared stores and the real `canSwitchChild` /
 * `canOpenChildMenu` rules run.
 */

const profileRef = { current: 'parents' }
vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({
    profile: profileRef.current,
    canEdit: profileRef.current === 'parents',
  }),
}))
vi.mock('../core/auth/useAuth', () => ({
  useAuth: () => ({ familyId: 'family-1' }),
  useFamilyId: () => 'family-1',
}))
vi.mock('../core/hooks/useChildren', async (importOriginal) => {
  const { sharedChildrenMock } = await import('../test/sharedChildrenMock')
  return sharedChildrenMock(await importOriginal<object>())
})

const addDoc = vi.fn(async () => ({ id: 'c9' }))
vi.mock('firebase/firestore', () => ({ addDoc: () => addDoc() }))
vi.mock('../core/firebase/firestore', () => ({ childrenCollection: () => ({}) }))

import {
  HARNESS_CHILDREN,
  PageBody,
  ShellHeader,
  pageBodyText,
  seedHarnessChildren,
  switchChildInHeader,
} from '../test/childSwitchHarness'
import type { Child } from '../core/types'

function App() {
  return (
    <>
      <ShellHeader />
      <PageBody />
    </>
  )
}

beforeEach(() => {
  profileRef.current = 'parents'
  addDoc.mockClear()
  seedHarnessChildren()
})

describe('the header chip moves the page (UX-425)', () => {
  it('switching in the chip changes which child the page is on', async () => {
    render(<App />)
    expect(pageBodyText()).toBe('Lincoln (c1)')

    await switchChildInHeader('London')

    expect(pageBodyText()).toBe('London (c2)')
    expect(
      screen.getByRole('button', { name: 'Switch child — currently London' }),
    ).toBeInTheDocument()
  })

  it('the caret is the affordance, and it is there', () => {
    render(<App />)
    expect(screen.getByTestId('ArrowDropDownIcon')).toBeInTheDocument()
  })
})

describe('Add a child lives in the chip menu now (UX-425)', () => {
  it('offers it below the children, and a tap opens the dialog', async () => {
    render(<App />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch child — currently Lincoln' }),
    )

    const items = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual(['Lincoln', 'London', 'Add a child…'])

    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a child…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a ONE-CHILD family still gets the menu — for the add row alone', async () => {
    // `canSwitchChild` refuses a one-entry child list, and rightly: a menu that
    // can only re-pick the child you are on does nothing. It can now do
    // something else. Refusing the menu here would leave such a family with no
    // way to add a second child anywhere in the app.
    seedHarnessChildren([{ id: 'c1', name: 'Lincoln' }] as Child[])
    render(<App />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch child — currently Lincoln' }),
    )
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Add a child…',
    ])
  })

  it('a family with NO children gets the door before there is a name for it', async () => {
    // The chip returns `null` with no active child, which was harmless while
    // every page carried a selector whose empty state offered *Add Child*.
    seedHarnessChildren([] as Child[], '')
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Add a child' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('a kid profile gets no menu at all — capability, never a name', () => {
  beforeEach(() => {
    profileRef.current = 'lincoln'
  })

  it('reads his name and offers no control', () => {
    render(<App />)
    expect(screen.getByText('Lincoln')).toBeInTheDocument()
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Switch child/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a child' })).not.toBeInTheDocument()
  })

  it('resolves to his OWN child however the shared store is set', () => {
    // Not "whatever was last selected" — `useActiveChild` locks a child profile
    // to his own record, which is what makes the read-only chip honest rather
    // than merely inert.
    seedHarnessChildren(HARNESS_CHILDREN, 'c2')
    render(<App />)
    expect(pageBodyText()).toBe('Lincoln (c1)')
  })

  it('with no children at all he gets nothing, not an inert add chip', () => {
    seedHarnessChildren([] as Child[], '')
    render(<App />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
