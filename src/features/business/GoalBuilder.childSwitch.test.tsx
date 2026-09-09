import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import GoalBuilder from './GoalBuilder'
import type { EditableMilestone } from './useBusinessGoal'

/**
 * UX-324, Codex round 3 — a dirty goal stack must not be saved onto another
 * child.
 *
 * `GoalBuilder`'s `!dirty` guard was written to stop a re-firing snapshot
 * clobbering an in-progress edit, and it did that job. What it also did, once
 * the header chip could switch child on a screen with no selector of its own,
 * was hold ONE child's rows across the change — so `handleSave` passed the new
 * `childId` with the old child's draft and overwrote that child's saved
 * `businessGoals` document.
 */

const LINCOLNS: EditableMilestone[] = [{ id: 'm1', label: 'Xbox Series S', price: 350 }]
const LONDONS: EditableMilestone[] = [{ id: 'm2', label: 'A big Lego set', price: 80 }]

const onSave = vi.fn(async () => {})

beforeEach(() => {
  onSave.mockClear()
})

describe('GoalBuilder — a switch does not carry one child’s draft to another', () => {
  it('re-seeds from the new child even when the draft is dirty', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <GoalBuilder childId="lincoln" milestones={LINCOLNS} saving={false} onSave={onSave} />,
    )

    // Make the draft dirty for Lincoln.
    await user.click(screen.getByRole('button', { name: /A game · /i }))
    expect(screen.getByDisplayValue('A game')).toBeInTheDocument()

    // The header switches child; the page re-renders the same builder.
    rerender(
      <GoalBuilder childId="london" milestones={LONDONS} saving={false} onSave={onSave} />,
    )

    // London's own stack is showing — Lincoln's rows are gone.
    expect(screen.getByDisplayValue('A big Lego set')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Xbox Series S')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('A game')).not.toBeInTheDocument()
  })

  it('leaves Save disabled after the switch — there is no draft to write', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <GoalBuilder childId="lincoln" milestones={LINCOLNS} saving={false} onSave={onSave} />,
    )
    await user.click(screen.getByRole('button', { name: /A game · /i }))
    // Dirty for Lincoln: Save is live and would write his rows.
    expect(screen.getByRole('button', { name: /save goal/i })).toBeEnabled()

    rerender(
      <GoalBuilder childId="london" milestones={LONDONS} saving={false} onSave={onSave} />,
    )

    // The defect is now unreachable rather than merely unlikely: `dirty` is
    // cleared with the re-seed, so the one button that calls `onSave` is off
    // until London's own stack is edited. Before the fix, `dirty` survived the
    // switch and this button wrote Lincoln's rows under London's id.
    expect(screen.getByRole('button', { name: /save goal/i })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the new child’s OWN rows once they are edited', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <GoalBuilder childId="lincoln" milestones={LINCOLNS} saving={false} onSave={onSave} />,
    )
    await user.click(screen.getByRole('button', { name: /A game · /i }))
    rerender(
      <GoalBuilder childId="london" milestones={LONDONS} saving={false} onSave={onSave} />,
    )

    await user.click(screen.getByRole('button', { name: /Game Pass · /i }))
    await user.click(screen.getByRole('button', { name: /save goal/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const [savedChildId, savedRows] = onSave.mock.calls[0] as unknown as [
      string,
      EditableMilestone[],
    ]
    expect(savedChildId).toBe('london')
    // London's own row plus what was typed FOR London — never Lincoln's.
    expect(savedRows.map((m) => m.label)).toEqual(['A big Lego set', 'Game Pass'])
  })

  it('says the unsaved changes were not kept, rather than dropping them silently', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <GoalBuilder childId="lincoln" milestones={LINCOLNS} saving={false} onSave={onSave} />,
    )
    await user.click(screen.getByRole('button', { name: /A game · /i }))
    rerender(
      <GoalBuilder childId="london" milestones={LONDONS} saving={false} onSave={onSave} />,
    )
    expect(screen.getByText(/weren’t kept|weren't kept/i)).toBeInTheDocument()
  })

  it('says nothing when there was no unsaved edit to lose', () => {
    const { rerender } = render(
      <GoalBuilder childId="lincoln" milestones={LINCOLNS} saving={false} onSave={onSave} />,
    )
    rerender(
      <GoalBuilder childId="london" milestones={LONDONS} saving={false} onSave={onSave} />,
    )
    expect(screen.queryByText(/weren’t kept|weren't kept/i)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('A big Lego set')).toBeInTheDocument()
  })
})
