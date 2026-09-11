import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { collectHoursContributions } from '../records/records.logic'
import type { HoursAdjustment } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

/**
 * UX-342 — a picked lesson video is logged as the child it was FOUND for.
 *
 * `LessonVideoDialog` holds a found video, an exclusion list and a "logged N
 * min" confirmation across renders, while `childId`, `childName` and `date` are
 * live props read from Today's own `ChildSelector` and day arrows. A parent
 * could open it for Lincoln, switch to London, tap *30 min*, and put those
 * minutes on London's `hoursAdjustments` — with the confirmation obligingly
 * reading "Logged 30m for London" about a video found for his brother.
 *
 * The census verdict is RESET: a picked video is an intent, nobody has watched
 * anything, and finding another costs one tap.
 *
 * ── The hours rail (DOC-25's four terms) ────────────────────────────────────
 *
 * 1. No number changes. 2. No stored shape changes. 3. The unchanged arithmetic
 * is ASSERTED below, through the canonical `collectHoursContributions`, with a
 * positive control. 4. No record is deleted or downgraded — a row already
 * written is untouched; what changes is only whether a write addressed to one
 * child can be made against another.
 *
 * POSITIVE CONTROL for the fix: delete the identity effect in
 * `LessonVideoDialog` and the first test fails — the dialog stays open with its
 * picked video, and the chips log against the new child.
 * POSITIVE CONTROL for the arithmetic: change `WATCH_DURATIONS` or the fold's
 * input and the last test's totals move.
 */

const chat = vi.fn()
const addDoc = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({
  id: 'adj-1',
}))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  hoursAdjustmentsCollection: () => ({ kind: 'hoursAdjustments' }),
}))

vi.mock('../../core/ai/useAI', async () => {
  const actual = await vi.importActual<typeof import('../../core/ai/useAI')>(
    '../../core/ai/useAI',
  )
  return { ...actual, useAI: () => ({ chat }) }
})

const PICK = {
  title: 'Nouns and verbs, sung',
  url: 'https://example.test/nouns',
  source: 'Example',
  why: 'Matches the lesson',
}

async function importDialog() {
  return (await import('./LessonVideoDialog')).default
}

beforeEach(() => {
  vi.clearAllMocks()
  chat.mockResolvedValue({ message: JSON.stringify(PICK) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a picked video does not follow the parent to another child', () => {
  it('closes and clears when the child changes underneath it', async () => {
    const LessonVideoDialog = await importDialog()
    const onClose = vi.fn()
    const props = {
      open: true,
      onClose,
      familyId: 'fam-1',
      childName: 'Lincoln',
      date: '2026-09-11',
      topic: 'Nouns and verbs',
      subjectBucket: 'LanguageArts',
    }
    const { rerender } = render(<LessonVideoDialog {...props} childId="lincoln" />)
    await screen.findByText(PICK.title)

    rerender(<LessonVideoDialog {...props} childId="london" childName="London" />)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    // And nothing was logged on the way through.
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('closes when the DAY changes underneath it, not only the child', async () => {
    const LessonVideoDialog = await importDialog()
    const onClose = vi.fn()
    const props = {
      open: true,
      onClose,
      familyId: 'fam-1',
      childId: 'lincoln',
      childName: 'Lincoln',
      topic: 'Nouns and verbs',
      subjectBucket: 'LanguageArts',
    }
    const { rerender } = render(<LessonVideoDialog {...props} date="2026-09-11" />)
    await screen.findByText(PICK.title)

    rerender(<LessonVideoDialog {...props} date="2026-09-12" />)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('still logs the minutes it always logged when nothing moved', async () => {
    const user = userEvent.setup()
    const LessonVideoDialog = await importDialog()
    render(
      <LessonVideoDialog
        open
        onClose={vi.fn()}
        familyId="fam-1"
        childId="lincoln"
        childName="Lincoln"
        date="2026-09-11"
        topic="Nouns and verbs"
        subjectBucket="LanguageArts"
      />,
    )
    await screen.findByText(PICK.title)

    await user.click(screen.getByText('30 min'))

    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1))
    const written = addDoc.mock.calls[0][1] as HoursAdjustment
    expect(written).toMatchObject({
      childId: 'lincoln',
      date: '2026-09-11',
      minutes: 30,
      subjectBucket: 'LanguageArts',
      source: 'video-watch',
    })
    await screen.findByText(/Logged 30m for Lincoln/)
  })
})

describe('the hours arithmetic is unchanged (DOC-25, term 3)', () => {
  it('folds a video-watch adjustment to exactly the minutes written', () => {
    const adjustment = {
      childId: 'lincoln',
      date: '2026-09-11',
      minutes: 30,
      reason: 'Watched video: Nouns and verbs',
      subjectBucket: SubjectBucket.LanguageArts,
      source: 'video-watch',
    }
    const contributions = collectHoursContributions([], [], [adjustment], 'lincoln')
    const total = contributions.reduce((sum, c) => sum + c.minutes, 0)
    expect(total).toBe(30)
    expect(contributions.map((c) => c.kind)).toEqual(['adjustment'])
  })

  it("counts nothing of it toward the OTHER child, which is the whole point", () => {
    const adjustment = {
      childId: 'lincoln',
      date: '2026-09-11',
      minutes: 30,
      reason: 'Watched video: Nouns and verbs',
      subjectBucket: SubjectBucket.LanguageArts,
      source: 'video-watch',
    }
    expect(collectHoursContributions([], [], [adjustment], 'london')).toEqual([])
  })
})
