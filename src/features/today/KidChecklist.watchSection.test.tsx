import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, Child, DayLog } from '../../core/types'

vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: () => Promise.resolve(0) }))

import KidChecklist from './KidChecklist'
import { computeQuestProgress } from './kidQuestGate'

function quest(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Quest', completed: false, category: 'must-do', ...overrides }
}

function watchRow(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    label: 'Watch: Revolution war (12m)',
    completed: false,
    category: 'choose',
    itemType: 'watch',
    watchVideoId: 'vid-rev',
    estimatedMinutes: 12,
    ...overrides,
  }
}

/**
 * Render the kid checklist the way `KidTodayView` does — props derived from the
 * real `computeQuestProgress`, not hand-assembled — so the bucket split and the
 * rendering are exercised together.
 */
function renderKid(checklist: ChecklistItem[], opts: { isMvd?: boolean } = {}) {
  const onWatchOpen = vi.fn<(item: ChecklistItem, index: number) => void>()
  const onToggleChoice = vi.fn()
  const p = computeQuestProgress(checklist)
  const dayLog = { id: '2026-07-30', date: '2026-07-30', checklist } as unknown as DayLog
  const child = { id: 'c1', name: 'Lincoln' } as unknown as Child

  render(
    <MemoryRouter>
      <KidChecklist
        mustDo={p.mustDo}
        choose={p.choose}
        watch={p.watch}
        checklist={checklist}
        maxChoices={2}
        isLincoln
        isChildProfile
        isMvd={opts.isMvd ?? false}
        gateUnlocked={p.gateUnlocked}
        gateThreshold={p.gateThreshold}
        mustDoCompleted={p.mustDoCompleted}
        mustDoDone={p.mustDoDone}
        mustDoRemaining={p.mustDoRemaining}
        dailyXp={0}
        selectedChoices={new Set()}
        onToggleChoice={onToggleChoice}
        dayLog={dayLog}
        child={child}
        familyId="f1"
        today="2026-07-30"
        persistDayLogImmediate={vi.fn()}
        onCaptureOpen={vi.fn()}
        onXpToast={vi.fn()}
        onWatchOpen={onWatchOpen}
      />
    </MemoryRouter>,
  )
  return { onWatchOpen, onToggleChoice, progress: p }
}

/** Lincoln's reported day: 11 quests, 1 done, plus the video Shelly planned. */
function lincolnsDay(): ChecklistItem[] {
  return [
    ...Array.from({ length: 11 }, (_, i) => quest({ label: `Quest ${i + 1}`, completed: i === 0 })),
    watchRow(),
  ]
}

describe('KidChecklist — a planned video is visible and playable (FEAT-134)', () => {
  it('shows the video with a ▶ Watch button when almost no quests are done', () => {
    // The reported bug: at 1 of 11 quests done the row was locked inside "Craft 2".
    renderKid(lincolnsDay())
    expect(screen.getByText('10 jobs to go!')).toBeTruthy()
    expect(screen.getByText(/Watch: Revolution war/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /watch/i })).toBeTruthy()
    // …and no lock copy anywhere near it.
    expect(screen.queryByText(/must-do jobs first/i)).toBeNull()
  })

  it('shows the video with zero quests done', () => {
    renderKid([quest({ label: 'Prayer' }), quest({ label: 'Math' }), watchRow()])
    expect(screen.getByText('2 jobs to go!')).toBeTruthy()
    expect(screen.getByRole('button', { name: /watch/i })).toBeTruthy()
  })

  it('shows the video on a Minimum Viable Day', () => {
    // The old choose section was wrapped in `!isMvd`, so the row vanished entirely.
    renderKid(lincolnsDay(), { isMvd: true })
    expect(screen.getByText(/Watch: Revolution war/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /watch/i })).toBeTruthy()
  })

  it('opens the player with the right video when tapped', () => {
    const { onWatchOpen } = renderKid(lincolnsDay())
    fireEvent.click(screen.getByRole('button', { name: /watch/i }))
    expect(onWatchOpen).toHaveBeenCalledTimes(1)
    expect(onWatchOpen.mock.calls[0][0].watchVideoId).toBe('vid-rev')
    // Index is the row's position in the FULL checklist, so the completion
    // writer targets the right item.
    expect(onWatchOpen.mock.calls[0][1]).toBe(11)
  })

  it('is not a craft choice — it never appears in the Craft pool or consumes a slot', () => {
    const { onToggleChoice, progress } = renderKid([
      ...Array.from({ length: 11 }, (_, i) => quest({ label: `Quest ${i + 1}`, completed: i === 0 })),
      watchRow(),
      quest({ label: 'Art project', category: 'choose' }),
    ])
    // The craft card still renders, and holds only the real choice.
    expect(screen.getByText('🔨 Craft 2')).toBeTruthy()
    expect(screen.getByText('Art project')).toBeTruthy()
    expect(progress.choose.map((i) => i.label)).toEqual(['Art project'])

    // Tapping the video row routes to the player, never to choice selection.
    fireEvent.click(screen.getByText(/Watch: Revolution war/))
    expect(onToggleChoice).not.toHaveBeenCalled()
  })

  it('a completed video shows no Watch button', () => {
    renderKid([quest({ label: 'Prayer' }), watchRow({ completed: true })])
    expect(screen.getByText(/Watch: Revolution war/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /watch/i })).toBeNull()
  })

  it('a watch row with a wrong category still lands in the watch section, never the quest list', () => {
    renderKid([
      quest({ label: 'Prayer' }),
      quest({ label: 'Math' }),
      watchRow({ category: 'must-do', mvdEssential: true }),
    ])
    // The count stays 2 — the video is not a quest.
    expect(screen.getByText('2 jobs to go!')).toBeTruthy()
    expect(screen.getByRole('button', { name: /watch/i })).toBeTruthy()
  })

  // Skip is a parent-only action (FUNC-08) and the Today edit-mode toggle has no
  // itemType guard, so it applies to a watch row too. The always-open section
  // must not hand back a video the parent removed — newly reachable, since the
  // old choose section was locked or hidden when this could bite (Codex P2).
  it('a parent-skipped video is inert — struck through, no Watch button, no player', () => {
    const { onWatchOpen } = renderKid([
      quest({ label: 'Prayer' }),
      watchRow({ label: 'Watch: Skipped one (12m)', skipped: true }),
      watchRow({ label: 'Watch: Live one (8m)', watchVideoId: 'vid-live' }),
    ])
    expect(screen.getByText('Watch: Skipped one (12m) — skipped')).toBeTruthy()

    // Only the un-skipped video offers a player, and tapping the skipped row
    // does nothing at all.
    const buttons = screen.getAllByRole('button', { name: /watch/i })
    expect(buttons).toHaveLength(1)
    fireEvent.click(screen.getByText('Watch: Skipped one (12m) — skipped'))
    expect(onWatchOpen).not.toHaveBeenCalled()

    fireEvent.click(buttons[0])
    expect(onWatchOpen).toHaveBeenCalledTimes(1)
    expect(onWatchOpen.mock.calls[0][0].watchVideoId).toBe('vid-live')
  })

  it('hides the whole section when every planned video is skipped', () => {
    renderKid([quest({ label: 'Prayer' }), watchRow({ skipped: true })])
    expect(screen.queryByText(/You Can Watch/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /watch/i })).toBeNull()
  })

  it('renders no watch section on a day with no planned video', () => {
    renderKid([quest({ label: 'Prayer' }), quest({ label: 'Math' })])
    expect(screen.queryByText(/You Can Watch/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /watch/i })).toBeNull()
  })
})

/**
 * FEAT-138 — the live-week edits are a parent job, and the kid surface has none
 * of them. `KidTodayView` renders this component, which has no edit mode at all;
 * a kid deep-linking to the planner is stopped by the write layer's capability
 * argument (`liveDayEdit`, `canEdit`), not by this surface. This pins the half
 * the kid view owns.
 */
describe('KidChecklist — no live-week editing on the kid surface (FEAT-138)', () => {
  it('offers no move, remove or change-video affordance on a planned video', () => {
    renderKid([quest({ label: 'Prayer' }), watchRow()])
    expect(screen.queryByRole('button', { name: /move to another day/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /change video/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove from today/i })).toBeNull()
    // …and the one thing a kid CAN do is still there.
    expect(screen.getAllByRole('button', { name: /watch/i })).toHaveLength(1)
  })
})
