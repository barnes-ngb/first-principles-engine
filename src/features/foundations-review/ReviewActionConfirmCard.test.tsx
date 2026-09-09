import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ReviewActionConfirmCard from './ReviewActionConfirmCard'
import type { PendingReviewAction } from './useFoundationsReview'

const CVC = 'reading.phonics.cvc'
const LONG = 'reading.phonics.longVowels'

const pending: PendingReviewAction[] = [
  { id: 'a', status: 'pending', action: { kind: 'attest', childId: 'c1', conceptId: CVC, state: 'solid', note: 'reads cat' } },
  { id: 'b', status: 'pending', action: { kind: 'covered', childId: 'c1', conceptId: LONG, source: 'Fast Phonics', unit: 'Peak 18' } },
  { id: 'c', status: 'pending', action: { kind: 'queueTest', childId: 'c1', conceptId: LONG } },
]

describe('ReviewActionConfirmCard — §14 display rules', () => {
  it('renders plain-language previews with no band numbers or percentages', () => {
    render(
      <ReviewActionConfirmCard
        pending={pending}
        childName="Lincoln"
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        onConfirmAll={vi.fn()}
      />,
    )
    const text = document.body.textContent ?? ''
    // Plain-language kid names appear (not node ids).
    expect(text).toContain('Sound out short words')
    expect(text).not.toContain(CVC)
    // §14 locked rules: no percentages, no "band N", no "level N".
    expect(text).not.toContain('%')
    expect(text).not.toMatch(/\bband\b/i)
    expect(text).not.toMatch(/\blevel\s*\d/i)
    // Confirm affordance is present.
    expect(screen.getAllByText('Confirm').length).toBeGreaterThan(0)
  })
})


// UX-287 — a confirm that could not be written reads as *not saved*, never as
// still-pending (which is what a silent no-op left on screen).
describe('ReviewActionConfirmCard — a failed confirm (UX-287)', () => {
  it('says Not saved and offers no Confirm on that card', () => {
    const failed: PendingReviewAction[] = [{ ...pending[0], status: 'failed' }]
    render(
      <ReviewActionConfirmCard
        pending={failed}
        childName="Lincoln"
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        onConfirmAll={vi.fn()}
      />,
    )
    expect(screen.getByText('Not saved')).toBeInTheDocument()
    expect(screen.queryByText('Confirm')).toBeNull()
    expect(screen.queryByText('Done')).toBeNull()
  })
})
