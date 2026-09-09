import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-324, Codex round 4 — a quick-add selection made while looking at one child
 * must not be logged as another child's hours.
 *
 * The header's switcher reaches Records and this form stays mounted, while
 * `handleSave` reads the live `childId` and writes the compliance `hours`
 * collection. The session's "just added" receipts had the same problem from the
 * other direction: they kept showing the previous child's entries under the new
 * child's name.
 */

const addDocMock = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({
  id: 'hours-1',
}))
vi.mock('firebase/firestore', () => ({ addDoc: (...a: unknown[]) => addDocMock(...a) }))
vi.mock('../../core/firebase/firestore', () => ({ hoursCollection: () => ({}) }))

import QuickAddHours from './QuickAddHours'

function renderFor(childId: string, childName: string) {
  return render(
    <QuickAddHours
      familyId="fam-1"
      childId={childId}
      childName={childName}
      date="2026-09-09"
      onSaved={() => {}}
    />,
  )
}

/** Select an activity and a duration, so the Log button appears. */
async function pickAnEntry(user: ReturnType<typeof userEvent.setup>) {
  const activity = screen.getAllByRole('button').find((b) => /Museum/i.test(b.textContent ?? ''))
  await user.click(activity as HTMLElement)
  const duration = screen
    .getAllByRole('button')
    .find((b) => /^1 hour$|^60m$|^1h$/i.test((b.textContent ?? '').trim()))
  await user.click((duration ?? screen.getByText(/How long\?/i)) as HTMLElement)
}

const logButton = () => screen.queryByRole('button', { name: /^Log / })

beforeEach(() => {
  addDocMock.mockClear()
})

describe('QuickAddHours — a child switch clears the pending entry', () => {
  it('drops a ready-to-log selection instead of writing it for the new child', async () => {
    const user = userEvent.setup()
    const { rerender } = renderFor('lincoln', 'Lincoln')
    await pickAnEntry(user)
    // The entry is armed and would write on the next tap.
    expect(logButton()).toBeInTheDocument()

    rerender(
      <QuickAddHours
        familyId="fam-1"
        childId="london"
        childName="London"
        date="2026-09-09"
        onSaved={() => {}}
      />,
    )

    // Gone: there is no armed entry to land on London.
    expect(logButton()).not.toBeInTheDocument()
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it("clears the session receipts, which belong to the child they were logged under", async () => {
    const user = userEvent.setup()
    const { rerender } = renderFor('lincoln', 'Lincoln')
    await pickAnEntry(user)
    await user.click(logButton() as HTMLElement)

    // Logged for Lincoln, and the row says so.
    await screen.findByText(/Added today:/i)
    const row = addDocMock.mock.calls[0][1] as unknown as { childId: string }
    expect(row.childId).toBe('lincoln')

    rerender(
      <QuickAddHours
        familyId="fam-1"
        childId="london"
        childName="London"
        date="2026-09-09"
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByText(/Added today:/i)).not.toBeInTheDocument()
  })

  it('leaves the form alone on a re-render for the SAME child', async () => {
    const user = userEvent.setup()
    const { rerender } = renderFor('lincoln', 'Lincoln')
    await pickAnEntry(user)
    rerender(
      <QuickAddHours
        familyId="fam-1"
        childId="lincoln"
        childName="Lincoln"
        date="2026-09-09"
        onSaved={() => {}}
      />,
    )
    // Keyed on the child, so an unrelated parent re-render cannot wipe a pick.
    expect(logButton()).toBeInTheDocument()
  })
})
