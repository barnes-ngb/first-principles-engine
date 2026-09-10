import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-336 — one boy's XP award must never land on his brother's `xpLedger`.
 *
 * `ArmorTab` renders its own child chips, so this is reachable with the header
 * switcher off. `QuickAwardXP` holds a typed amount, reason and award type and
 * is not re-keyed on the child, while `doAward` reads the live `childId` prop —
 * so a filled form plus a chip tap plus Award wrote the XP against the wrong
 * child, moving his armor unlocks and tier with it.
 *
 * `DOC-25` term 3: the unchanged arithmetic is asserted, not claimed. The last
 * block below pins the sign flip and the amount that reach `addXpEvent`, and
 * the POSITIVE CONTROL is the first block — remove the render-time reset and
 * Lincoln's 20 XP reaches `addXpEvent` under London's id.
 */

const addXpEvent = vi.fn(async () => {})
const checkAndUnlockArmor = vi.fn(async () => ({ newlyUnlockedVoxelPieces: [] as string[] }))

vi.mock('../../core/xp/addXpEvent', () => ({
  addXpEvent: (...args: unknown[]) => addXpEvent(...(args as [])),
}))
vi.mock('../../core/xp/checkAndUnlockArmor', () => ({
  checkAndUnlockArmor: (...args: unknown[]) => checkAndUnlockArmor(...(args as [])),
}))
vi.mock('../../core/xp/useXpLedger', () => ({
  useXpLedger: () => ({ totalXp: 100, nextTierProgress: { xpToNext: 50 } }),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  avatarProfilesCollection: () => ({}),
}))

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

function setActive(child: { id: string; name: string }) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
}

async function typeAward(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.click(screen.getByRole('button', { name: /award xp/i }))
  await user.type(screen.getByLabelText(/^amount$/i), amount)
  await user.type(screen.getByLabelText(/reason/i), 'Cleaned the whole kitchen')
}

beforeEach(() => {
  vi.clearAllMocks()
  setActive(LINCOLN)
})

describe('ArmorTab — a child switch does not re-target a typed XP award', () => {
  it('clears the typed award, names whose it was, and writes nothing', async () => {
    const user = userEvent.setup()
    const { default: ArmorTab } = await import('./ArmorTab')
    const { rerender } = render(<ArmorTab />)

    await typeAward(user, '20')
    expect(screen.getByRole('button', { name: /award \+20 xp to lincoln/i })).toBeEnabled()

    setActive(LONDON)
    rerender(<ArmorTab />)

    // POSITIVE CONTROL — before the reset the amount and reason survived and
    // the button read "Award +20 XP to London" over Lincoln's typed reason.
    expect(screen.getByLabelText(/^amount$/i)).toHaveValue(null)
    expect(screen.getByLabelText(/reason/i)).toHaveValue('')

    const notice = screen.getByText(/wasn't awarded|wasn’t awarded/i)
    expect(notice.textContent).toContain('Lincoln')
    expect(notice.textContent).toContain('London')
    expect(addXpEvent).not.toHaveBeenCalled()
  })

  it('says nothing when there was no typed award to lose', async () => {
    const { default: ArmorTab } = await import('./ArmorTab')
    const { rerender } = render(<ArmorTab />)

    setActive(LONDON)
    rerender(<ArmorTab />)

    expect(screen.queryByText(/wasn't awarded|wasn’t awarded/i)).not.toBeInTheDocument()
  })

  it('awards the child on screen, with the XP arithmetic untouched', async () => {
    const user = userEvent.setup()
    const { default: ArmorTab } = await import('./ArmorTab')
    const { rerender } = render(<ArmorTab />)

    await typeAward(user, '20')
    setActive(LONDON)
    rerender(<ArmorTab />)

    await user.type(screen.getByLabelText(/^amount$/i), '15')
    await user.type(screen.getByLabelText(/reason/i), 'Read to his brother')
    await user.click(screen.getByRole('button', { name: /award \+15 xp to london/i }))

    expect(addXpEvent).toHaveBeenCalledTimes(1)
    const [familyId, childId, type, amount] = addXpEvent.mock.calls[0] as unknown as [
      string, string, string, number,
    ]
    expect(familyId).toBe('fam-1')
    expect(childId).toBe('london')
    // `DOC-25` term 1, asserted: no number changed. A positive award is still
    // written at exactly the typed magnitude, under the same event type.
    expect(type).toBe('MANUAL_AWARD')
    expect(amount).toBe(15)
  })

  it('still flips a Correction negative — the sign rule is untouched', async () => {
    const user = userEvent.setup()
    const { default: ArmorTab } = await import('./ArmorTab')
    render(<ArmorTab />)

    await user.click(screen.getByRole('button', { name: /award xp/i }))
    await user.click(screen.getByRole('combobox', { name: /type/i }))
    await user.click(screen.getByRole('option', { name: 'Correction' }))
    await user.type(screen.getByLabelText(/amount to remove/i), '20')
    await user.type(screen.getByLabelText(/reason/i), 'Logged twice')
    await user.click(screen.getByRole('button', { name: /remove 20 xp from lincoln/i }))
    await user.click(screen.getByRole('button', { name: /yes, remove xp/i }))

    const [, childId, , amount] = addXpEvent.mock.calls[0] as unknown as [
      string, string, string, number,
    ]
    expect(childId).toBe('lincoln')
    expect(amount).toBe(-20)
  })

  it('closes the correction confirm dialog on a switch, so its button cannot fire', async () => {
    const user = userEvent.setup()
    const { default: ArmorTab } = await import('./ArmorTab')
    const { rerender } = render(<ArmorTab />)

    await user.click(screen.getByRole('button', { name: /award xp/i }))
    await user.click(screen.getByRole('combobox', { name: /type/i }))
    await user.click(screen.getByRole('option', { name: 'Correction' }))
    await user.type(screen.getByLabelText(/amount to remove/i), '20')
    await user.type(screen.getByLabelText(/reason/i), 'Logged twice')
    await user.click(screen.getByRole('button', { name: /remove 20 xp from lincoln/i }))
    expect(screen.getByRole('button', { name: /yes, remove xp/i })).toBeInTheDocument()

    setActive(LONDON)
    rerender(<ArmorTab />)

    // POSITIVE CONTROL — this dialog's own button calls `doAward` directly, so
    // left open it read "Remove 0 XP from London" over a live button that would
    // have taken XP off the wrong child.
    // `waitFor` because MUI keeps a Dialog mounted through its close
    // transition; what matters is that it is closing rather than live.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /yes, remove xp/i })).not.toBeInTheDocument(),
    )
    expect(addXpEvent).not.toHaveBeenCalled()
  })
})
