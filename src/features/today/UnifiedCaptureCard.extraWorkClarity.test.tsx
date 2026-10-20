/**
 * `FIX-266` — the parent capture form is recognisable, and says only true
 * things.
 *
 * Reported (2026-10-20): logging extra work is unclear and there is no History
 * category to pick. Three things, asserted against the real card:
 *
 *   • **History has a category.** The *Category* picker reads *Social Studies
 *     (including History)*, which is a word on a picker and nothing more: the
 *     option's value, and every byte written, stay
 *     `SubjectBucket.SocialStudies` — no new bucket, no second category
 *     identity, nothing re-categorised. The parenthetical must not reach a
 *     record, which is asserted over the whole payload rather than field by
 *     field.
 *   • **An empty minutes field promises nothing**, since every pathway gates
 *     the `hours` row on `minutes > 0`. The positive preview is unchanged and
 *     still names the bucket's own shared label.
 *   • **The hint is the PARENT's.** The kid card is chip-first by design and
 *     keeps its own copy, so neither the new sentence nor the category picker
 *     may appear there.
 *
 * The writes themselves are pinned, because a copy change that quietly moved a
 * payload is the risk: a note with minutes writes one artifact and one `hours`
 * row under the stored bucket, and a note with NO minutes writes the artifact
 * and no `hours` row — the sentence's own claim, made good.
 *
 * Regression sensitivity: against the card before this run, the category and
 * guidance tests fail on the strings; the payload and no-hours assertions pass
 * then and now, which is the point of carrying them.
 *
 * Synthetic services only, inherited from `UnifiedCaptureCard.pendingSave.test`
 * — the Firestore writers, the uploader and the two media surfaces are local
 * stubs. The card is imported normally.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from './UnifiedCaptureCard'
import type { Child } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

type AddDocCall = { collectionKey: string; data: Record<string, unknown> }
const addDocCalls: AddDocCall[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async (col: { __key: string }, data: Record<string, unknown>) => {
    addDocCalls.push({ collectionKey: col.__key, data })
    return { id: `mock-${addDocCalls.length}` }
  }),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  query: vi.fn(() => ({ __key: 'activityConfigs' })),
  where: vi.fn(() => ({})),
  // No family has a flagged quick-log config here, so the built-in chips are
  // what the tests see — the same shape the pending-save suite runs under.
  onSnapshot: vi.fn((_q: unknown, next: (snap: unknown) => void) => {
    next({ docs: [] })
    return () => {}
  }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  hoursCollection: vi.fn(() => ({ __key: 'hours' })),
  activityConfigsCollection: vi.fn(() => ({ __key: 'activityConfigs' })),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: vi.fn((ext: string) => `file.${ext}`),
  uploadArtifactFile: vi.fn(async () => ({ downloadUrl: 'https://x/file' })),
}))

vi.mock('../../components/PhotoCapture', () => ({
  default: () => <div data-testid="photo-capture" />,
}))

vi.mock('../../components/AudioRecorder', () => ({
  default: () => <div data-testid="audio-recorder" />,
}))

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

const TODAY = '2026-10-20'

function renderCard(variant: 'parent' | 'kid' = 'parent') {
  const onSnackMessage = vi.fn()
  render(
    <MemoryRouter>
      <UnifiedCaptureCard
        familyId="fam-1"
        selectedChildId="lincoln"
        today={TODAY}
        weekPlanId="week-1"
        selectableChildren={children}
        todayArtifacts={[]}
        setTodayArtifacts={vi.fn()}
        onSnackMessage={onSnackMessage}
        variant={variant}
        activeChild={children[0]}
      />
    </MemoryRouter>,
  )
  return { onSnackMessage }
}

const saveButton = () => screen.getByRole('button', { name: /save capture/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i)
const minutesField = () => screen.getByLabelText('Duration in minutes')
const artifactWrites = () => addDocCalls.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => addDocCalls.filter((c) => c.collectionKey === 'hours')

/** Opens the Category picker and taps an option by its displayed words. */
function pickCategory(optionName: string | RegExp) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Category' }))
  fireEvent.click(screen.getByRole('option', { name: optionName }))
}

beforeEach(() => {
  addDocCalls.length = 0
})

describe('UnifiedCaptureCard — filing ordinary extra work (FIX-266)', () => {
  it('offers History inside the Social Studies option, and stores the bucket', async () => {
    renderCard()

    pickCategory('Social Studies (including History)')
    fireEvent.change(minutesField(), { target: { value: '45' } })
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))

    // The stored identity is the enum member, on both writes.
    expect(artifactWrites()[0].data).toMatchObject({
      childId: 'lincoln',
      dayLogId: TODAY,
      tags: { subjectBucket: 'SocialStudies' },
    })
    expect(hoursWrites()[0].data).toMatchObject({
      subjectBucket: 'SocialStudies',
      childId: 'lincoln',
      date: TODAY,
      minutes: 45,
      source: 'unified-capture',
    })
    // The display words reach no record — asserted over everything written, so
    // a future field cannot carry them in quietly.
    expect(JSON.stringify(addDocCalls)).not.toContain('including History')
  })

  it('names no second category — one option per stored bucket, no more', () => {
    renderCard()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Category' }))

    const buckets = Object.values(SubjectBucket)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(buckets.length)

    // Derived from the enum rather than counted: the stored identities behind
    // the options are exactly the buckets, each appearing once — so a display
    // label can neither add an identity nor duplicate one.
    const values = options.map((o) => o.getAttribute('data-value'))
    expect([...values].sort()).toEqual([...buckets].sort())
    expect(new Set(values).size).toBe(values.length)

    // One option carries the hint; the plain name is not offered beside it.
    expect(screen.getByRole('option', { name: 'Social Studies (including History)' }))
      .toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Social Studies' })).toBeNull()
    expect(screen.queryByRole('option', { name: /^History$/ })).toBeNull()
  })

  it('asks for minutes instead of promising hours for an empty field', () => {
    renderCard()

    expect(screen.getByText('Add minutes if you want to log time.')).toBeInTheDocument()
    expect(screen.queryByText(/counts toward/i)).toBeNull()
    expect(screen.queryByText(/will log/i)).toBeNull()
  })

  it('keeps the positive preview, in the bucket’s own words', () => {
    renderCard()

    pickCategory('Social Studies (including History)')
    fireEvent.change(minutesField(), { target: { value: '20' } })

    // The bucket's shared label, not the picker's hint.
    expect(screen.getByText('Will log 20 minutes to Social Studies')).toBeInTheDocument()
    expect(screen.queryByText(/add minutes if you want/i)).toBeNull()
  })

  it('makes the empty-minutes sentence good: a note alone writes no hours row', async () => {
    renderCard()

    fireEvent.change(noteField(), { target: { value: 'Visited the dentist' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(hoursWrites()).toHaveLength(0)
    expect(addDocCalls.map((c) => c.collectionKey)).toEqual(['artifacts'])
  })

  it('tells a parent what the card is, and the quick logs are shortcuts', () => {
    renderCard()

    expect(screen.getByText(/photos are optional/i)).toBeInTheDocument()
    expect(screen.getByText(/shortcuts that fill/i)).toBeInTheDocument()
  })

  it('leaves a kid’s card alone — neither the hint nor the picker', () => {
    renderCard('kid')

    expect(screen.queryByText(/photos are optional/i)).toBeNull()
    expect(screen.queryByText(/shortcuts that fill/i)).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Category' })).toBeNull()
    // Positive control: the kid card did render — its minutes stepper is here.
    expect(screen.getByTestId('kid-duration-display')).toBeInTheDocument()
  })
})
