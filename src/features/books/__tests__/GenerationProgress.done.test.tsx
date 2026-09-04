import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import GenerationProgress from '../GenerationProgress'
import { ART_QUOTA_MESSAGE } from '../../business/useArtQuota'

// UX-115 — the finish screen used to print a hard-coded "Your book is ready!"
// whatever happened, so the FEAT-168 refusal copy written for exactly this
// moment never reached a screen: a kid at the cap saw a green check and
// "ready", then landed in a book with no pictures and was never told why.

describe('UX-115 — the done state tells the truth about what landed', () => {
  it('shows the cap nudge instead of "ready" when the budget refused the pictures', () => {
    const message = `Your story is saved! ${ART_QUOTA_MESSAGE} You can add photos or drawings in the editor.`
    render(
      <GenerationProgress
        progress={{ phase: 'done', currentPage: 0, totalPages: 0, message }}
      />,
    )
    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.queryByText('Your book is ready!')).toBeNull()
  })

  it('says how many pages still need a picture after a partial failure', () => {
    const message =
      'Book made! 3 pages still need a picture — you can add photos or drawings in the editor.'
    render(
      <GenerationProgress
        progress={{ phase: 'done', currentPage: 0, totalPages: 0, message }}
      />,
    )
    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.queryByText('Your book is ready!')).toBeNull()
  })

  it('still says "Your book is ready!" when every page got its picture', () => {
    render(
      <GenerationProgress
        progress={{
          phase: 'done',
          currentPage: 0,
          totalPages: 0,
          message: 'Your book is ready!',
        }}
      />,
    )
    expect(screen.getByText('Your book is ready!')).toBeTruthy()
  })
})
