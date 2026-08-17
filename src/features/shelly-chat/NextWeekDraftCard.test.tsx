// ── FEAT-150: the drafted week renders in full, and the apply card is honest ──
//
// Two requirements this component exists to satisfy, and neither is cosmetic:
//
//   1. **Every day, every item.** The parent is approving a write across five
//      days; a summary is not something she can check a week against.
//   2. **The retain rules, in her language.** She is approving a write over days
//      that may already hold her boys' finished work, so the card has to say
//      what happens to it — before the tap, not after.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import NextWeekDraftCard from './NextWeekDraftCard'
import { nextWeekDayKeys } from './nextWeekActions'
import type { NextWeekDraftView } from './useNextWeekDraft'

const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Chicago'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

const fullWeek: DraftWeeklyPlan = {
  days: WEEKDAYS.map((day, i) => ({
    day,
    timeBudgetMinutes: 120,
    items: [
      {
        id: `m${i}`,
        title: `${day} math`,
        subjectBucket: SubjectBucket.Math,
        estimatedMinutes: 15,
        skillTags: [],
        accepted: true,
      },
      {
        id: `r${i}`,
        title: `${day} reading`,
        subjectBucket: SubjectBucket.Reading,
        estimatedMinutes: 20,
        skillTags: [],
        accepted: true,
      },
    ],
  })),
  skipSuggestions: [],
  minimumWin: 'Read together',
}

const view = (over: Partial<NextWeekDraftView> = {}): NextWeekDraftView => ({
  phase: 'ready',
  draft: fullWeek,
  weekStart: '2026-08-23',
  weekLabel: 'Aug 24–28',
  days: nextWeekDayKeys(new Date(2026, 7, 18, 12)),
  instructions: 'lighter, math every day but short',
  usedLocalPlanner: false,
  error: null,
  daysWritten: [],
  ...over,
})

const renderCard = (over: Partial<NextWeekDraftView> = {}, props = {}) =>
  render(
    <NextWeekDraftCard
      view={view(over)}
      childName="Lincoln"
      hoursPerDay={2.5}
      onApply={vi.fn()}
      onDismiss={vi.fn()}
      {...props}
    />,
  )

describe('NextWeekDraftCard — the week, in full', () => {
  it('renders all five weekdays', () => {
    renderCard()
    for (const day of WEEKDAYS) {
      expect(screen.getAllByText(new RegExp(day, 'i')).length).toBeGreaterThan(0)
    }
  })

  it('renders every item on every day, not a count', () => {
    renderCard()
    for (const day of WEEKDAYS) {
      expect(screen.getByText(`${day} math`)).toBeTruthy()
      expect(screen.getByText(`${day} reading`)).toBeTruthy()
    }
  })

  it('shows the minutes per day', () => {
    renderCard()
    // 5 days x 35m = 175m ≈ 2.9h planned across the week.
    expect(screen.getByText(/2\.9h planned/)).toBeTruthy()
    // And each item carries its own duration.
    expect(screen.getAllByText(/15m/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/20m/).length).toBeGreaterThan(0)
  })

  it('names the child and the week in words, never a date key', () => {
    const { container } = renderCard()
    expect(screen.getByText(/Lincoln's week of Aug 24–28/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/2026-08-2\d/)
  })

  it("echoes the parent's own instructions so the week can be checked against them", () => {
    renderCard()
    expect(screen.getByText(/lighter, math every day but short/)).toBeTruthy()
  })
})

describe('NextWeekDraftCard — the apply card names the retain rules', () => {
  it('says finished work stays, with its minutes and photos', () => {
    renderCard()
    expect(screen.getByText(/already finished on those days stays/i)).toBeTruthy()
  })

  it('says hand-added items stay', () => {
    renderCard()
    expect(screen.getByText(/added by hand stays/i)).toBeTruthy()
  })

  it('says unfinished leftovers are cleared and replaced', () => {
    renderCard()
    expect(screen.getByText(/leftovers from an earlier plan are cleared/i)).toBeTruthy()
  })

  it('offers Apply as its own separate, named tap', () => {
    renderCard()
    expect(
      screen.getByRole('button', { name: /Apply this plan to Lincoln's next week/i }),
    ).toBeTruthy()
  })

  it('offers the escape hatch to Plan My Week rather than dead-ending', () => {
    renderCard()
    expect(screen.getByText(/open Plan My Week/i)).toBeTruthy()
  })
})

describe('NextWeekDraftCard — honesty across phases', () => {
  it('says nothing is written while generating', () => {
    renderCard({ phase: 'generating', draft: null })
    expect(screen.getByText(/nothing is written yet/i)).toBeTruthy()
  })

  it('renders a plain error and NO week when generation failed', () => {
    renderCard({
      phase: 'error',
      draft: null,
      error: "I couldn't draft a week just now — nothing was written.",
    })
    expect(screen.getByText(/couldn't draft a week just now/i)).toBeTruthy()
    // Crucially: no apply button, because there is no week to apply.
    expect(screen.queryByRole('button', { name: /Apply this plan/i })).toBeNull()
  })

  it('warns when the local planner produced the week instead of the AI', () => {
    renderCard({ usedLocalPlanner: true })
    expect(screen.getByText(/built-in planner/i)).toBeTruthy()
  })

  it('reports the days written once applied', () => {
    renderCard({ phase: 'applied', daysWritten: ['2026-08-24', '2026-08-25'] })
    expect(screen.getByText(/Applied to 2 days/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Apply this plan/i })).toBeNull()
  })

  it('withdraws Apply after a partial write, so a half-week is never doubled', () => {
    renderCard({
      phase: 'error',
      error: 'Only part of that went through: Monday was written, the rest of the week was not.',
      daysWritten: ['2026-08-24'],
    })
    expect(screen.getByText(/Only part of that went through/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Apply this plan/i })).toBeNull()
  })

  it('disables Apply while a write is in flight', () => {
    renderCard({ phase: 'applying' })
    const button = screen.getByRole('button', { name: /Applying/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('renders nothing at all when idle', () => {
    const { container } = renderCard({ phase: 'idle', draft: null })
    expect(container.firstChild).toBeNull()
  })
})
