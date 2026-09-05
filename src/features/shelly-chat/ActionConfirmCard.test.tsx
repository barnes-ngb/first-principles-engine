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
import { confirmFailureNotice } from './pendingLifecycle'
import { SubjectBucket } from '../../core/types/enums'
import type { ChatWeekDay } from './dayItemActions'
import type { ChatWatchVideo } from './watchActions'
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

  // ── UX-205 ────────────────────────────────────────────────────────────────
  //
  // The owner's list grew a second "Prayer and Scripture", a second "Sight word
  // games" and a second "Dad's Lab: micro:bit" through this card, because every
  // field on it was correct and none of them said "you already have this".
  it('names what an add would duplicate, with its minutes and cadence', () => {
    const existing: ChatActivityConfig = {
      id: 'cfg_prayer',
      name: 'Prayer and Scripture',
      childId: 'both',
      defaultMinutes: 10,
      type: 'routine',
      frequency: 'daily',
      sortOrder: 0,
    }
    renderCard(
      curriculumPending({ ...ADD, type: 'routine', name: 'Prayer and Scripture' }),
      [...CURRICULUM_CONFIGS, existing],
    )
    expect(
      screen.getByText(/You already have "Prayer and Scripture" \(10m · daily\)/),
    ).toBeInTheDocument()
    // A warning, never a refusal — the parent may genuinely want a second one.
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('says nothing about duplicates for a genuinely new activity', () => {
    renderCard(curriculumPending(ADD), CURRICULUM_CONFIGS)
    expect(screen.queryByText(/You already have/)).not.toBeInTheDocument()
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

// ── A confirmed card survives its own write (Codex P2, PR #1669) ─────
//
// Confirming a write CHANGES the state the card resolves against, and the
// subscription delivers that change at once. `markActivityComplete` is the sharp
// case: the config becomes `completed: true`, the resolver correctly refuses it
// as already finished — and the card would disappear, taking with it the
// "Done ✓" that is the parent's only confirmation of an IRREVERSIBLE write.

describe('ActionConfirmCard — an applied card outlives its own write (FEAT-143)', () => {
  const COMPLETE: PendingAction['action'] = {
    kind: 'markActivityComplete',
    childId: 'lincoln1',
    activityConfigId: 'cfg_gatb',
  }
  /** The post-write world: the very config that was just finished. */
  const AFTER_WRITE: ChatActivityConfig[] = CURRICULUM_CONFIGS.map((c) =>
    c.id === 'cfg_gatb' ? { ...c, completed: true } : c,
  )

  it('keeps rendering, with Done, after the config turns completed', () => {
    renderCard(
      [{ id: 'msg1_0', status: 'applied', action: COMPLETE }],
      AFTER_WRITE,
    )
    expect(screen.getByText('Mark "GATB Math 3" finished for Lincoln')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  // The gate still means something while the card is undecided: an activity
  // finished in another tab must stop OFFERING a card here.
  it('still hides a PENDING card once the config turns completed', () => {
    renderCard(
      [{ id: 'msg1_0', status: 'pending', action: COMPLETE }],
      AFTER_WRITE,
    )
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByText(/GATB Math 3/)).not.toBeInTheDocument()
  })

  it('keeps a dismissed card rendering too', () => {
    renderCard(
      [{ id: 'msg1_0', status: 'dismissed', action: COMPLETE }],
      AFTER_WRITE,
    )
    expect(screen.getByText('Dismissed')).toBeInTheDocument()
  })

  it('renders nothing when the config is gone entirely, whatever the status', () => {
    renderCard([{ id: 'msg1_0', status: 'applied', action: COMPLETE }], [])
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('shows Saving… while the write is in flight, with no buttons to tap again', () => {
    renderCard(
      [{ id: 'msg1_0', status: 'applying', action: COMPLETE }],
      CURRICULUM_CONFIGS,
    )
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  // An applied position card reads the config's NEW number on both sides; the
  // arrow is dropped rather than rendering "lesson 107 → 107".
  it('drops the arrow on an applied position card', () => {
    const applied: ChatActivityConfig[] = CURRICULUM_CONFIGS.map((c) =>
      c.id === 'cfg_gatb' ? { ...c, currentPosition: 107 } : c,
    )
    renderCard(
      [
        {
          id: 'msg1_0',
          status: 'applied',
          action: {
            kind: 'setActivityPosition',
            childId: 'lincoln1',
            activityConfigId: 'cfg_gatb',
            position: 107,
          },
        },
      ],
      applied,
    )
    expect(screen.getByText('GATB Math 3: lesson 107')).toBeInTheDocument()
  })
})

// ── Watch actions (FEAT-149) ─────────────────────────────────────────────────
//
// A vet-in card is the one card in the portal that asks the parent to let
// something the ASSISTANT found into a library the boys play from. So it has to
// carry the source link: she is the curator, the model is a scout, and she
// cannot curate what she cannot watch.

const WATCH_VIDEOS: ChatWatchVideo[] = [
  {
    id: 'vid_glacier',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'How Glaciers Move',
    plannedMinutes: 9,
    subjectBucket: SubjectBucket.Science,
    childId: 'lincoln1',
  },
]

const PLANNABLE_DAYS = [
  { dateKey: '2026-08-19', label: 'Wednesday' },
  { dateKey: '2026-08-25', label: 'next Tuesday' },
]

const VET_IN_PENDING: PendingAction[] = [
  {
    id: 'msg1_0',
    status: 'pending',
    action: {
      kind: 'vetInVideo',
      childId: 'lincoln1',
      youtubeId: 'zZzZzZzZzZz',
      title: 'How Rivers Carve Canyons',
      plannedMinutes: 11,
      subjectBucket: SubjectBucket.Science,
      why: 'He asked how the Grand Canyon got there',
      suggestedFromUrl: 'https://www.youtube.com/watch?v=zZzZzZzZzZz',
    },
  },
]

function renderWatchCard(pending: PendingAction[]) {
  return render(
    <ActionConfirmCard
      pending={pending}
      familyChildren={CHILDREN}
      watchVideos={WATCH_VIDEOS}
      plannableDays={PLANNABLE_DAYS}
      onConfirm={vi.fn()}
      onDismiss={vi.fn()}
      onConfirmAll={vi.fn()}
    />,
  )
}

describe('ActionConfirmCard — vetInVideo (FEAT-149)', () => {
  it('shows the title, length, subject, who it is for, and the why', () => {
    renderWatchCard(VET_IN_PENDING)
    expect(
      screen.getByText('Add "How Rivers Carve Canyons" to Lincoln\'s Watch Library'),
    ).toBeInTheDocument()
    expect(screen.getByText('Science · 11m')).toBeInTheDocument()
    expect(screen.getByText(/Adds a video to Lincoln's library/)).toBeInTheDocument()
    expect(screen.getByText(/He asked how the Grand Canyon got there/)).toBeInTheDocument()
  })

  it('links the source so she can watch it before confirming', () => {
    renderWatchCard(VET_IN_PENDING)
    const link = screen.getByRole('link', { name: /watch it first/i })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=zZzZzZzZzZz')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('says adding it plans nothing', () => {
    renderWatchCard(VET_IN_PENDING)
    expect(screen.getByText(/nothing lands on a day until you plan it/i)).toBeInTheDocument()
  })

  it('never shows the raw youtube id', () => {
    const { container } = renderWatchCard(VET_IN_PENDING)
    // The id appears inside the href (it has to — that IS the link), but never
    // as text the parent is asked to read.
    expect(container.textContent).not.toContain('zZzZzZzZzZz')
  })
})

describe('ActionConfirmCard — planVideoOnDay (FEAT-149)', () => {
  const planPending = (dateKey: string, status: PendingAction['status'] = 'pending'): PendingAction[] => [
    {
      id: 'msg1_0',
      status,
      action: { kind: 'planVideoOnDay', childId: 'lincoln1', watchVideoId: 'vid_glacier', dateKey },
    },
  ]

  it('names the video and the weekday in words — including "next Tuesday"', () => {
    renderWatchCard(planPending('2026-08-25'))
    expect(
      screen.getByText('Add "How Glaciers Move" to Lincoln\'s next Tuesday'),
    ).toBeInTheDocument()
  })

  it('names a current-week day without the "next"', () => {
    renderWatchCard(planPending('2026-08-19'))
    expect(screen.getByText('Add "How Glaciers Move" to Lincoln\'s Wednesday')).toBeInTheDocument()
  })

  it('shows neither a doc id nor a raw date', () => {
    const { container } = renderWatchCard(planPending('2026-08-25'))
    expect(container.textContent).not.toContain('vid_glacier')
    expect(container.textContent).not.toContain('2026-08-25')
  })

  it('says the add changes nothing already on the day', () => {
    renderWatchCard(planPending('2026-08-25'))
    expect(screen.getByText(/Nothing already on it changes/i)).toBeInTheDocument()
  })

  it('renders no card for a video that is not in the library', () => {
    const { container } = render(
      <ActionConfirmCard
        pending={[
          {
            id: 'msg1_0',
            status: 'pending',
            action: {
              kind: 'planVideoOnDay',
              childId: 'lincoln1',
              watchVideoId: 'vid_gone',
              dateKey: '2026-08-25',
            },
          },
        ]}
        familyChildren={CHILDREN}
        watchVideos={WATCH_VIDEOS}
        plannableDays={PLANNABLE_DAYS}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        onConfirmAll={vi.fn()}
      />,
    )
    expect(container.textContent).toBe('')
  })
})

describe('ActionConfirmCard — an applied vet-in outlives its own write (FEAT-149)', () => {
  it("keeps the card and its Done ✓ once the video it added is in the library", () => {
    // The write makes the action a duplicate of itself, so the OFFER gate now
    // refuses it. The already-tapped card must still render — it is the parent's
    // only confirmation the video landed (the FEAT-144 lesson).
    const applied: PendingAction[] = [{ ...VET_IN_PENDING[0], status: 'applied' }]
    render(
      <ActionConfirmCard
        pending={applied}
        familyChildren={CHILDREN}
        watchVideos={[
          ...WATCH_VIDEOS,
          { ...WATCH_VIDEOS[0], id: 'vid_new', youtubeId: 'zZzZzZzZzZz', title: 'How Rivers Carve Canyons' },
        ]}
        plannableDays={PLANNABLE_DAYS}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        onConfirmAll={vi.fn()}
      />,
    )
    expect(
      screen.getByText('Add "How Rivers Carve Canyons" to Lincoln\'s Watch Library'),
    ).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})

// ── Dad Lab cards (FEAT-157) ─────────────────────────────────────────

describe('ActionConfirmCard — createConceptArc (FEAT-157)', () => {
  const ARC_ACTION: PendingAction[] = [
    {
      id: 'msg1_0',
      status: 'pending',
      action: {
        kind: 'createConceptArc',
        childId: 'lincoln1',
        title: 'The Electricity Arc',
        domainLabel: 'Electricity',
        steps: [
          { title: 'Static electricity', conceptBeat: 'Charge jumps' },
          { title: 'Make a circuit', conceptBeat: 'A loop lets current flow' },
          { title: 'Add a switch' },
        ],
      },
    },
  ]

  it('renders EVERY step, numbered and in order, with its concept beat — the steps ARE the write', () => {
    renderCard(ARC_ACTION)

    expect(screen.getByText('Creates a Dad Lab concept arc')).toBeInTheDocument()
    expect(
      screen.getByText('Create the concept arc "The Electricity Arc" for Lincoln and London'),
    ).toBeInTheDocument()
    expect(screen.getByText('1. Static electricity — Charge jumps')).toBeInTheDocument()
    expect(screen.getByText('2. Make a circuit — A loop lets current flow')).toBeInTheDocument()
    expect(screen.getByText('3. Add a switch')).toBeInTheDocument()
    expect(screen.getByText('Domain: Electricity')).toBeInTheDocument()
  })

  it('footnotes that the arc is created as shown and the rest lives on the Dad Lab page', () => {
    renderCard(ARC_ACTION)

    expect(
      screen.getByText(/first step starts active/),
    ).toBeInTheDocument()
    expect(screen.getByText(/live on the Dad Lab page/)).toBeInTheDocument()
  })
})

describe('ActionConfirmCard — planLab (FEAT-157)', () => {
  const ARCS = [
    {
      id: 'arc_elec',
      title: 'The Electricity Arc',
      childIds: ['lincoln1', 'london1'],
      steps: [
        { title: 'Static', conceptBeat: '', status: 'done' as const },
        { title: 'Circuit', conceptBeat: '', status: 'active' as const },
      ],
      createdFrom: 'owner-authored' as const,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ]
  const LAB_ACTION: PendingAction[] = [
    {
      id: 'msg1_0',
      status: 'pending',
      action: {
        kind: 'planLab',
        childId: 'lincoln1',
        title: 'Make a bulb light up',
        question: 'What makes it turn on?',
        labType: 'science',
        materials: ['battery', 'bulb'],
        arcId: 'arc_elec',
        arcStepIndex: 1,
      },
    },
  ]

  function renderLabCard(pending: PendingAction[], arcs = ARCS) {
    return render(
      <ActionConfirmCard
        pending={pending}
        familyChildren={CHILDREN}
        conceptArcs={arcs}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        onConfirmAll={vi.fn()}
      />,
    )
  }

  it('names the lab, the arc by TITLE with a 1-based step, the question and the materials — never a doc id', () => {
    renderLabCard(LAB_ACTION)

    expect(screen.getByText('Adds a lab to the Dad Lab backlog')).toBeInTheDocument()
    expect(
      screen.getByText('Plan the Science lab "Make a bulb light up" — step 2 of "The Electricity Arc"'),
    ).toBeInTheDocument()
    expect(screen.getByText('Question: What makes it turn on?')).toBeInTheDocument()
    expect(screen.getByText('Materials: battery, bulb')).toBeInTheDocument()
    expect(screen.queryByText(/arc_elec/)).not.toBeInTheDocument()
  })

  it('footnotes where it lands: the backlog, started from the Dad Lab page, no hours until completion', () => {
    renderLabCard(LAB_ACTION)

    expect(
      screen.getByText(
        'Adds to the Dad Lab backlog — start it from the Dad Lab page. No hours are recorded until the lab is completed there.',
      ),
    ).toBeInTheDocument()
  })

  it('offers no card while pending if the linked arc is gone — the stage gate holds at render too', () => {
    renderLabCard(LAB_ACTION, [])

    expect(screen.queryByText(/Make a bulb light up/)).not.toBeInTheDocument()
  })

  it('an APPLIED card outlives its arc — the "Done ✓" confirmation survives an archive', () => {
    const applied: PendingAction[] = [{ ...LAB_ACTION[0], status: 'applied' }]
    renderLabCard(applied, [])

    expect(screen.getByText(/Plan the Science lab "Make a bulb light up"/)).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})

describe('ActionConfirmCard — a failed write says so (FEAT-162 / UX-33c)', () => {
  const failed = (error?: string): PendingAction[] => [
    {
      id: 'msg1_0',
      status: 'pending',
      action: { kind: 'addSightWord', childId: 'lincoln1', word: 'said' },
      ...(error ? { error } : {}),
    },
  ]

  it('renders the failure sentence on the card that failed', () => {
    renderCard(failed(confirmFailureNotice()))
    expect(screen.getByText(confirmFailureNotice())).toBeInTheDocument()
  })

  it('keeps the card retryable — Confirm is still there beside the sentence', () => {
    renderCard(failed(confirmFailureNotice()))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('shows nothing extra on a card that has not failed', () => {
    renderCard(failed())
    expect(screen.queryByText(confirmFailureNotice())).not.toBeInTheDocument()
  })

  it('names only the card that failed in a multi-card turn', () => {
    renderCard([
      ...failed(confirmFailureNotice()),
      {
        id: 'msg1_1',
        status: 'applied',
        action: { kind: 'addSightWord', childId: 'lincoln1', word: 'come' },
      },
    ])
    expect(screen.getAllByText(confirmFailureNotice())).toHaveLength(1)
  })
})
