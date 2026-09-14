import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `UX-362` → `UX-425` — Today's context strip carries NO child control.
 *
 * `ContextBar` used to draw its own `<Chip label={activeChild.name}
 * color="primary" variant="outlined" />` with no `onClick`: the exact defect
 * `UX-324` wrote `ChildSwitcherChip` to fix, live on the page a parent opens
 * first. `UX-362` replaced it with the shared switcher, and this file pinned
 * that the chip and the page's own `ChildSelector` could not disagree.
 *
 * Then the owner ran the deployed app, 2026-09-13: *"There are now as many as
 * four locations to choose a child. I like the chip drop-down in the header as
 * the primary source; remove the others."* So the strip's chip went with the
 * ten in-page selectors, and what this file pins is the other half of the same
 * rule: the strip renders the child as a **picture and nothing else**, the
 * shell's chip still drives the page body, and the look-alike does not come
 * back through the door the real one left by.
 *
 * It uses the shared harness (`src/test/childSwitchHarness.tsx`) — the real
 * `useActiveChild`, the real shared stores and the real switcher rules, with
 * only the Firestore edges stubbed. A harness that mocked the hook could not
 * fail on the thing being asserted.
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
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('../core/hooks/useChildren', async (importOriginal) => {
  const { sharedChildrenMock } = await import('../test/sharedChildrenMock')
  return sharedChildrenMock(await importOriginal<object>())
})

import ContextBar from './ContextBar'
import { useActiveChild } from '../core/hooks/useActiveChild'
import {
  PageBody,
  ShellHeader,
  pageBodyText,
  seedHarnessChildren,
  switchChildInHeader,
} from '../test/childSwitchHarness'

/**
 * Today's shape: the shell's chip above, then `ContextBar` handed
 * `useActiveChild().activeChild` as a prop, then the page. That split — a prop
 * beside a hook — is exactly what could drift, so the harness reproduces it
 * rather than passing a literal.
 */
function TodayLikeHarness() {
  const { activeChild } = useActiveChild()
  return (
    <MemoryRouter>
      <ShellHeader />
      <ContextBar page="today" activeChild={activeChild} dateKey="2026-09-11" />
      <PageBody />
    </MemoryRouter>
  )
}

beforeEach(() => {
  profileRef.current = 'parents'
  seedHarnessChildren()
})

describe('ContextBar offers no way to choose a child (UX-425)', () => {
  it('renders exactly ONE switcher on the page, and it is the shell’s', () => {
    render(<TodayLikeHarness />)
    expect(
      screen.getAllByRole('button', { name: 'Switch child — currently Lincoln' }),
    ).toHaveLength(1)
    // The caret is the affordance; asserted positively so the count above
    // cannot pass by there being no switcher at all.
    expect(screen.getAllByTestId('ArrowDropDownIcon')).toHaveLength(1)
  })

  it('draws no chip out of the child NAME — the look-alike stays gone', () => {
    render(<TodayLikeHarness />)
    // The shell's chip holds the name; nothing inside the strip repeats it.
    expect(screen.getAllByText('Lincoln')).toHaveLength(1)
  })

  it('the strip keeps its date chip and its four action icons', () => {
    render(<TodayLikeHarness />)
    expect(screen.getByRole('button', { name: 'Week Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dad Lab' })).toBeInTheDocument()
  })
})

describe('the shell’s chip still moves this page (UX-425)', () => {
  it('switching there changes the child the strip and the body are on', async () => {
    render(<TodayLikeHarness />)
    expect(pageBodyText()).toBe('Lincoln (c1)')

    await switchChildInHeader('London')

    expect(pageBodyText()).toBe('London (c2)')
    // The `activeChild` PROP the strip is handed followed too — the chip's
    // accessible name is built from the hook, the body's text from the prop's
    // twin, and both now read London.
    expect(
      screen.getByRole('button', { name: 'Switch child — currently London' }),
    ).toBeInTheDocument()
  })
})

describe('a kid profile — capability, never a name (UX-362, unchanged)', () => {
  beforeEach(() => {
    profileRef.current = 'lincoln'
  })

  it('reads his name once, in the shell, with no control anywhere', () => {
    render(<TodayLikeHarness />)
    expect(screen.getAllByText('Lincoln')).toHaveLength(1)
    expect(screen.queryByTestId('ArrowDropDownIcon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Switch child/ })).not.toBeInTheDocument()
  })
})
