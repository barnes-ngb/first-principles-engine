import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-327 — a session started for one child must not be logged as another
 * child's hours.
 *
 * `useCreativeTimer.stopTimer` wrote its `hours` row against the child the hook
 * was rendered with at the moment Done was tapped. The timer is mounted on
 * several screens, UX-324's header switcher reaches all of them, and the
 * running timer survives the change — so a Lincoln session stopped after a
 * switch was logged as London's hours, in the collection the Records page, the
 * compliance pack and `collectHoursContributions` all read.
 *
 * This is the compliance rail, so the assertion is on the written document.
 */

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }
const activeRef = { current: LINCOLN }

vi.mock('../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: activeRef.current,
    activeChildId: activeRef.current.id,
    children: [LINCOLN, LONDON],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
  }),
}))

const addDocMock = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({
  id: 'hours-1',
}))
vi.mock('firebase/firestore', () => ({ addDoc: (...a: unknown[]) => addDocMock(...a) }))
vi.mock('../core/firebase/firestore', () => ({ hoursCollection: () => ({}) }))

import CreativeTimer from './CreativeTimer'

/**
 * Start a timer for Lincoln and let 27 minutes pass — comfortably inside a
 * bucket, since `stopTimer` rounds UP to the next 5 minutes and a value landing
 * exactly on a boundary drifts to the next one by the test's own real
 * milliseconds.
 */
async function runTwentySevenMinutesForLincoln(user: ReturnType<typeof userEvent.setup>) {
  activeRef.current = LINCOLN
  const { rerender } = render(<CreativeTimer />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await screen.findByRole('button', { name: /done/i })

  // Wind the clock forward past the 5-minute floor.
  const started = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(started + 27 * 60_000)
  return rerender
}

beforeEach(() => {
  localStorage.clear()
  addDocMock.mockClear()
  vi.restoreAllMocks()
  activeRef.current = LINCOLN
})

describe('CreativeTimer — the hours row follows the session (UX-327)', () => {
  it('logs the minutes to the child the timer was started for', async () => {
    const user = userEvent.setup()
    const rerender = await runTwentySevenMinutesForLincoln(user)

    // The parent switches child in the header while the timer runs.
    activeRef.current = LONDON
    rerender(<CreativeTimer />)

    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))

    const row = addDocMock.mock.calls[0][1] as unknown as {
      childId: string
      minutes: number
      source: string
    }
    expect(row.childId).toBe(LINCOLN.id)
    // The hours math is untouched: 27 minutes still round UP to the next
    // 5-minute bucket exactly as before, and the row is still stamped by the
    // same source. Only WHOSE the row is changed.
    expect(row.minutes).toBe(30)
    expect(row.source).toBe('creative-timer')
  })

  it('says whose the time is BEFORE Done, not in the receipt after it', async () => {
    const user = userEvent.setup()
    const rerender = await runTwentySevenMinutesForLincoln(user)
    activeRef.current = LONDON
    rerender(<CreativeTimer />)

    expect(screen.getByText(/This time is Lincoln's — it will be logged to Lincoln\./)).toBeInTheDocument()
  })

  it('says nothing while the header is still on the session’s own child', async () => {
    const user = userEvent.setup()
    await runTwentySevenMinutesForLincoln(user)
    expect(screen.queryByText(/it will be logged to/)).not.toBeInTheDocument()
  })

  it('still logs to the active child when nothing was switched', async () => {
    const user = userEvent.setup()
    await runTwentySevenMinutesForLincoln(user)
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))
    const row = addDocMock.mock.calls[0][1] as unknown as { childId: string }
    expect(row.childId).toBe(LINCOLN.id)
  })

  it('writes nothing at all under the five-minute floor', async () => {
    // The floor is part of the hours rule and is deliberately untouched.
    const user = userEvent.setup()
    activeRef.current = LINCOLN
    render(<CreativeTimer />)
    await user.click(screen.getByRole('button', { name: /start/i }))
    await user.click(await screen.findByRole('button', { name: /done/i }))
    await waitFor(() =>
      expect(screen.getByText(/Timer saves after 5 minutes/i)).toBeInTheDocument(),
    )
    expect(addDocMock).not.toHaveBeenCalled()
  })
})
