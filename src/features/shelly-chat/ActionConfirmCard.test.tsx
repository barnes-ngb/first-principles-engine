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

function renderCard(pending: PendingAction[], configs = CONFIGS) {
  return render(
    <ActionConfirmCard
      pending={pending}
      familyChildren={CHILDREN}
      activityConfigs={configs}
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
