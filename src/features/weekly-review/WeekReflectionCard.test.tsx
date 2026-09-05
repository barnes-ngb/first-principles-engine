import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WeeklyReview } from '../../core/types'

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const mockWrite = vi.fn()
vi.mock('./writeWeekReflection', () => ({
  writeWeekReflection: (...args: unknown[]) => mockWrite(...args),
}))

import WeekReflectionCard from './WeekReflectionCard'

const review = (reflection?: unknown, weekKey = '2026-08-30'): WeeklyReview =>
  ({
    id: `${weekKey}_c1`,
    childId: 'c1',
    weekKey,
    reflection,
  } as unknown as WeeklyReview)

const onSaved = vi.fn()

function renderCard(current?: unknown, history: WeeklyReview[] = []) {
  return render(
    <WeekReflectionCard
      familyId="fam-1"
      childId="c1"
      weekKey="2026-08-30"
      review={review(current)}
      history={history}
      onSaved={onSaved}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseActiveChild.mockReturnValue({ isChildProfile: false })
  mockWrite.mockResolvedValue(undefined)
})

describe('the week question (UX-214)', () => {
  it('asks the question and offers the three answers', () => {
    renderCard()
    expect(screen.getByText('Was that enough this week?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes, good week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'About right' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'We can do more' })).toBeInTheDocument()
  })

  it('is never pre-answered — nothing selects a choice on the parent’s behalf', () => {
    renderCard()
    for (const label of ['Yes, good week', 'About right', 'We can do more']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
    expect(screen.getByRole('button', { name: 'Save answer' })).toBeDisabled()
  })

  it('writes exactly once, on an explicit save, and writes only the answer', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'We can do more' }))
    expect(mockWrite).not.toHaveBeenCalled() // a tap is not a write

    await user.click(screen.getByRole('button', { name: 'Save answer' }))
    await waitFor(() => expect(mockWrite).toHaveBeenCalledTimes(1))

    const [familyId, childId, weekKey, reflection] = mockWrite.mock.calls[0]
    expect([familyId, childId, weekKey]).toEqual(['fam-1', 'c1', '2026-08-30'])
    expect(reflection.answer).toBe('can-do-more')
    expect(Object.keys(reflection).sort()).toEqual(['answer', 'answeredAt'])
  })

  it('keeps the optional line when there is one', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'About right' }))
    await user.type(
      screen.getByLabelText('Anything worth remembering (optional)'),
      'packing week',
    )
    await user.click(screen.getByRole('button', { name: 'Save answer' }))

    await waitFor(() => expect(mockWrite).toHaveBeenCalledTimes(1))
    expect(mockWrite.mock.calls[0][3].note).toBe('packing week')
  })

  it('shows an already-given answer back, and does not re-save it unchanged', () => {
    renderCard({ answer: 'good-week', answeredAt: '2026-09-01T10:00:00.000Z' })
    expect(screen.getByRole('button', { name: 'Yes, good week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Save answer' })).toBeDisabled()
  })

  it('shows earlier answers, so three of the same in a row is visible', () => {
    renderCard(undefined, [
      review({ answer: 'can-do-more', answeredAt: 'x' }, '2026-08-23'),
      review({ answer: 'can-do-more', answeredAt: 'x' }, '2026-08-16'),
    ])
    expect(screen.getByText('Earlier weeks')).toBeInTheDocument()
    expect(screen.getByText('Aug 23 — We can do more')).toBeInTheDocument()
    expect(screen.getByText('Aug 16 — We can do more')).toBeInTheDocument()
  })

  it('renders nothing for a child profile — a kid is never asked to grade the week', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    const { container } = renderCard()
    expect(container).toBeEmptyDOMElement()
  })
})
