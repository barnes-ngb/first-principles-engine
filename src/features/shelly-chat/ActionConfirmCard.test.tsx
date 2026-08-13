// ── ActionConfirmCard — setActivityMinutes preview (FEAT-135) ────────
//
// This card is the parent's ENTIRE view of the write before she taps. So the
// things the write does have to be legible on it: which activity (by name, not
// an id she can't read), what the number is changing from and to, who it
// affects — loudly, when the activity is shared between the boys — and that it
// applies to future plans rather than to anything already recorded.

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { Child } from '../../core/types'
import ActionConfirmCard from './ActionConfirmCard'
import { describeActivityAudience } from './activityMinutesView'
import type { ChatWeekDay } from './dayItemActions'
import type { ChatActivityConfig, PendingAction } from './useShellyChatActions'

const CHILDREN: Child[] = [
  { id: 'lincoln1', name: 'Lincoln' } as Child,
  { id: 'london1', name: 'London' } as Child,
]

const CONFIGS: ChatActivityConfig[] = [
  { id: 'cfg_math', name: 'Math Lesson', childId: 'lincoln1', defaultMinutes: 15 },
  { id: 'cfg_read', name: 'Read Aloud', childId: 'both', defaultMinutes: 20 },
]

function pendingFor(activityConfigId: string, minutes = 30): PendingAction[] {
  return [
    {
      id: 'msg1_0',
      status: 'pending',
      action: { kind: 'setActivityMinutes', childId: 'lincoln1', activityConfigId, minutes },
    },
  ]
}

function renderCard(pending: PendingAction[], configs = CONFIGS, suppressed: string[] = []) {
  return render(
    <ActionConfirmCard
      pending={pending}
      familyChildren={CHILDREN}
      activityConfigs={configs}
      suppressed={suppressed}
      onConfirm={vi.fn()}
      onDismiss={vi.fn()}
      onConfirmAll={vi.fn()}
    />,
  )
}

describe('ActionConfirmCard — setActivityMinutes (FEAT-135)', () => {
  it('shows the activity name and the old → new minutes, never the raw id', () => {
    renderCard(pendingFor('cfg_math'))

    expect(screen.getByText('Math Lesson: 15m → 30m')).toBeInTheDocument()
    expect(screen.queryByText(/cfg_math/)).not.toBeInTheDocument()
  })

  it('names only the acting child for a config that child owns', () => {
    renderCard(pendingFor('cfg_math'))

    expect(screen.getByText('Affects Lincoln only.')).toBeInTheDocument()
  })

  it('warns loudly that a shared activity changes the time for both boys', () => {
    renderCard(pendingFor('cfg_read', 45))

    expect(screen.getByText('Read Aloud: 20m → 45m')).toBeInTheDocument()
    expect(
      screen.getByText('Shared activity — this changes it for Lincoln and London.'),
    ).toBeInTheDocument()
  })

  it('says the change applies to future plans, not to what is already recorded', () => {
    renderCard(pendingFor('cfg_math'))

    expect(
      screen.getByText(
        'Applies to future plans — this week and anything already recorded stay as they are.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Changes the default time for future plans')).toBeInTheDocument()
  })

  it('renders no card at all when the id resolves to no real config', () => {
    renderCard(pendingFor('cfg_hallucinated'))

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByText(/→/)).not.toBeInTheDocument()
  })

  it('still renders other action kinds unchanged', () => {
    renderCard([
      {
        id: 'msg1_0',
        status: 'pending',
        action: { kind: 'addSightWord', childId: 'lincoln1', word: 'because' },
      },
    ])

    expect(screen.getByText('Add sight word "because" for Lincoln')).toBeInTheDocument()
  })
})

describe('ActionConfirmCard — suppressed-proposal notices (PR #1653 Codex P2)', () => {
  it('shows why a proposal produced no card, so the reply is not left dangling', () => {
    renderCard([], CONFIGS, ['Changing how long an activity takes is something a grown-up does — nothing was changed.'])

    expect(
      screen.getByText(
        'Changing how long an activity takes is something a grown-up does — nothing was changed.',
      ),
    ).toBeInTheDocument()
    // A notice is not a card: nothing to confirm or dismiss.
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('renders notices alongside a real card when a turn has both', () => {
    renderCard(pendingFor('cfg_math'), CONFIGS, ['Nothing was changed.'])

    expect(screen.getByText('Nothing was changed.')).toBeInTheDocument()
    expect(screen.getByText('Math Lesson: 15m → 30m')).toBeInTheDocument()
  })

  it('renders nothing at all when there is neither a card nor a notice', () => {
    const { container } = renderCard([], CONFIGS, [])
    expect(container).toBeEmptyDOMElement()
  })
})

describe('describeActivityAudience', () => {
  it('lists every child for a shared config', () => {
    expect(describeActivityAudience('both', ['Lincoln', 'London'], 'Lincoln')).toBe(
      'Shared activity — this changes it for Lincoln and London.',
    )
  })

  it('handles three or more children with a comma list', () => {
    expect(describeActivityAudience('both', ['A', 'B', 'C'], 'A')).toBe(
      'Shared activity — this changes it for A, B and C.',
    )
  })

  it('falls back gracefully when no names are known', () => {
    expect(describeActivityAudience('both', [], 'Lincoln')).toBe(
      'Shared activity — this changes it for every child.',
    )
  })

  it('names only the acting child for an owned config', () => {
    expect(describeActivityAudience('lincoln1', ['Lincoln', 'London'], 'Lincoln')).toBe(
      'Affects Lincoln only.',
    )
  })
})

// ── Live-day edit cards (FEAT-142) ───────────────────────────────────────────
//
// Same standard as the FEAT-135 card above: this is the parent's entire view of
// the write before she taps, so what it changes has to be legible — the child,
// the weekday in words, and the row by its title. Never an itemKey, never a raw
// date, and never a card at all for a proposal that resolves to nothing.

const WEEK: ChatWeekDay[] = [
  {
    dateKey: '2026-08-10',
    label: 'Monday',
    items: [
      { itemKey: 'Reading Eggs (30m)::Reading', label: 'Reading Eggs (30m)', completed: true },
      { itemKey: 'Math Facts (10m)::Math', label: 'Math Facts (10m)', completed: false },
    ],
  },
  { dateKey: '2026-08-13', label: 'Thursday', items: [] },
]

function renderDayCard(action: PendingAction['action'], week = WEEK) {
  return render(
    <ActionConfirmCard
      pending={[{ id: 'msg1_0', status: 'pending', action }]}
      familyChildren={CHILDREN}
      activityConfigs={CONFIGS}
      weekDays={week}
      onConfirm={vi.fn()}
      onDismiss={vi.fn()}
      onConfirmAll={vi.fn()}
    />,
  )
}

describe('ActionConfirmCard — live-day edits (FEAT-142)', () => {
  it('previews a removal by row title and weekday, naming the child', () => {
    renderDayCard({
      kind: 'removeItemFromDay',
      childId: 'lincoln1',
      dateKey: '2026-08-10',
      itemKey: 'Math Facts (10m)::Math',
    })
    expect(screen.getByText(`Remove "Math Facts" from Lincoln's Monday`)).toBeInTheDocument()
    expect(screen.getByText("Changes Lincoln's week")).toBeInTheDocument()
  })

  it('previews a move naming both weekdays', () => {
    renderDayCard({
      kind: 'moveItemToDay',
      childId: 'lincoln1',
      fromDateKey: '2026-08-10',
      toDateKey: '2026-08-13',
      itemKey: 'Math Facts (10m)::Math',
    })
    expect(
      screen.getByText(`Move "Math Facts" from Lincoln's Monday to Thursday`),
    ).toBeInTheDocument()
  })

  it('previews an add with its minutes and the day it lands on', () => {
    renderDayCard({
      kind: 'addItemToDay',
      childId: 'lincoln1',
      dateKey: '2026-08-13',
      label: 'Sight word games',
      estimatedMinutes: 15,
    })
    expect(
      screen.getByText(`Add "Sight word games" (15m) to Lincoln's Thursday`),
    ).toBeInTheDocument()
    expect(screen.getByText("Adds to Lincoln's week")).toBeInTheDocument()
    expect(screen.getByText('Adds one row to that day. Nothing already on it changes.'))
      .toBeInTheDocument()
  })

  it('says finished work is not in play, on the subtractive cards', () => {
    renderDayCard({
      kind: 'removeItemFromDay',
      childId: 'lincoln1',
      dateKey: '2026-08-10',
      itemKey: 'Math Facts (10m)::Math',
    })
    expect(
      screen.getByText('Finished work stays put — only what has not been done yet can move.'),
    ).toBeInTheDocument()
  })

  it('shows no itemKey and no raw date anywhere on the card', () => {
    const { container } = renderDayCard({
      kind: 'removeItemFromDay',
      childId: 'lincoln1',
      dateKey: '2026-08-10',
      itemKey: 'Math Facts (10m)::Math',
    })
    expect(container.textContent).not.toContain('::')
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('renders NO card for a row the live week does not hold', () => {
    const { container } = renderDayCard({
      kind: 'removeItemFromDay',
      childId: 'lincoln1',
      dateKey: '2026-08-10',
      itemKey: 'Handwriting (20m)::LanguageArts',
    })
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders NO card for a completed row, rather than one whose Confirm would fail', () => {
    const { container } = renderDayCard({
      kind: 'removeItemFromDay',
      childId: 'lincoln1',
      dateKey: '2026-08-10',
      itemKey: 'Reading Eggs (30m)::Reading',
    })
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders NO card when no week is loaded at all', () => {
    const { container } = renderDayCard(
      {
        kind: 'addItemToDay',
        childId: 'lincoln1',
        dateKey: '2026-08-13',
        label: 'Sight word games',
        estimatedMinutes: 15,
      },
      [],
    )
    expect(container.querySelector('button')).toBeNull()
  })
})
