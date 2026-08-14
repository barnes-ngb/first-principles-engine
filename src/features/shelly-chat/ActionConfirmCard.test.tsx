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

// ── ActionConfirmCard — curriculum previews (FEAT-143) ───────────────
//
// Same rule as the minutes card: this card is the parent's ENTIRE view of the
// write before she taps. An add creates something from nothing, so the whole
// shape has to be on it — including who it lands on, loudly, when it is shared.
// A position bump has to show the number she already knows, changing.

const CURRICULUM_CONFIGS: ChatActivityConfig[] = [
  {
    id: 'cfg_gatb',
    name: 'GATB Math 3',
    childId: 'lincoln1',
    defaultMinutes: 20,
    type: 'workbook',
    currentPosition: 98,
    totalUnits: 140,
    unitLabel: 'lesson',
    sortOrder: 2,
  },
  {
    id: 'cfg_done',
    name: 'Explode the Code 3',
    childId: 'lincoln1',
    defaultMinutes: 15,
    type: 'workbook',
    currentPosition: 60,
    totalUnits: 60,
    completed: true,
    sortOrder: 3,
  },
]

const curriculumPending = (action: PendingAction['action']): PendingAction[] => [
  { id: 'msg1_0', status: 'pending', action },
]

const ADD: PendingAction['action'] = {
  kind: 'addActivity',
  childId: 'lincoln1',
  name: 'Khan Academy math',
  type: 'app',
  subjectBucket: 'Math',
  defaultMinutes: 20,
  frequency: 'daily',
}

describe('ActionConfirmCard — setActivityPosition (FEAT-143)', () => {
  it('shows the real old → new position, never the raw id', () => {
    renderCard(
      curriculumPending({
        kind: 'setActivityPosition',
        childId: 'lincoln1',
        activityConfigId: 'cfg_gatb',
        position: 107,
      }),
      CURRICULUM_CONFIGS,
    )
    expect(screen.getByText('GATB Math 3: lesson 98 → 107')).toBeInTheDocument()
    expect(screen.queryByText(/cfg_gatb/)).not.toBeInTheDocument()
  })

  it('says the change is forward-looking', () => {
    renderCard(
      curriculumPending({
        kind: 'setActivityPosition',
        childId: 'lincoln1',
        activityConfigId: 'cfg_gatb',
        position: 107,
      }),
      CURRICULUM_CONFIGS,
    )
    expect(screen.getByText(/already recorded stay as they are/)).toBeInTheDocument()
  })

  it('renders no card for a hallucinated id', () => {
    renderCard(
      curriculumPending({
        kind: 'setActivityPosition',
        childId: 'lincoln1',
        activityConfigId: 'cfg_nope',
        position: 107,
      }),
      CURRICULUM_CONFIGS,
    )
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('renders no card against a finished program', () => {
    renderCard(
      curriculumPending({
        kind: 'setActivityPosition',
        childId: 'lincoln1',
        activityConfigId: 'cfg_done',
        position: 12,
      }),
      CURRICULUM_CONFIGS,
    )
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
})

describe('ActionConfirmCard — markActivityComplete (FEAT-143)', () => {
  const COMPLETE: PendingAction['action'] = {
    kind: 'markActivityComplete',
    childId: 'lincoln1',
    activityConfigId: 'cfg_gatb',
  }

  it('names the activity and the child', () => {
    renderCard(curriculumPending(COMPLETE), CURRICULUM_CONFIGS)
    expect(screen.getByText('Mark "GATB Math 3" finished for Lincoln')).toBeInTheDocument()
  })

  // The consequence has to be on the card, in parent language, before the tap.
  it('states the consequence and that there is no undo anywhere', () => {
    renderCard(curriculumPending(COMPLETE), CURRICULUM_CONFIGS)
    const note = screen.getByText(/stops appearing in future plans/)
    expect(note).toHaveTextContent('everything already logged stays')
    expect(note).toHaveTextContent('no undo for this, here or in Progress → Curriculum')
  })
})

describe('ActionConfirmCard — addActivity (FEAT-143)', () => {
  it('shows the full shape being created', () => {
    renderCard(curriculumPending(ADD), CURRICULUM_CONFIGS)
    expect(screen.getByText('Add "Khan Academy math" to Lincoln\'s curriculum')).toBeInTheDocument()
    expect(screen.getByText('Math · 20m · daily')).toBeInTheDocument()
  })

  it('names only the acting child for an unshared add', () => {
    renderCard(curriculumPending(ADD), CURRICULUM_CONFIGS)
    expect(screen.getByText('Affects Lincoln only.')).toBeInTheDocument()
  })

  // A shared add lands on every child's list — she has to read that BEFORE she
  // taps, not discover it after.
  it('carries the both-boys warning for a shared add', () => {
    renderCard(
      curriculumPending({ ...ADD, type: 'routine', shared: true }),
      CURRICULUM_CONFIGS,
    )
    expect(
      screen.getByText(describeActivityAudience('both', ['Lincoln', 'London'], 'Lincoln')),
    ).toBeInTheDocument()
    expect(screen.getByText(/Lincoln and London/)).toBeInTheDocument()
  })

  it('shows the starting position when the parent gave real numbers', () => {
    renderCard(
      curriculumPending({ ...ADD, type: 'workbook', totalUnits: 140, currentPosition: 98 }),
      CURRICULUM_CONFIGS,
    )
    expect(screen.getByText('Math · 20m · daily · lesson 98 of 140')).toBeInTheDocument()
  })

  // DATA-08 — the one add the card must refuse to render.
  it('renders no card for a shared workbook', () => {
    renderCard(
      curriculumPending({ ...ADD, type: 'workbook', shared: true }),
      CURRICULUM_CONFIGS,
    )
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
})
