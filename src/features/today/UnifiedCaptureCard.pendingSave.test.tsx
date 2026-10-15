/**
 * FIX-262 — one tap, one write.
 *
 * The parent capture card's saves are all asynchronous and every entry point
 * reaches its first `await` before anything on screen changes. Tapping *Save
 * Capture* again while the first write was in flight therefore wrote the
 * capture again — one artifact and one hours row per tap — and the same hole
 * was open on the time-only and media pathways, which share this card's child,
 * category and minutes.
 *
 * What these tests hold:
 *
 *   • repeat taps during a pending save produce exactly ONE write per
 *     collection, with the SAME payload the single-tap path always wrote;
 *   • a deliberate second capture after the first finishes still works;
 *   • a failure — early (the artifact) or late (the hours row) — releases the
 *     guard, so nothing is left permanently unsavable;
 *   • nothing-to-save and an empty photo batch do not claim the guard at all;
 *   • a media commit cannot slip past a note save that is still in flight.
 *
 * Regression sensitivity. Against the production code at 69e4f89 — no guard at
 * all — the repeat-tap tests fail by writing one document per tap: three
 * artifacts and three hours rows (the note case), three hours rows (the
 * time-only and kid cases) and two artifacts (the cross-pathway case).
 * Each test also asserts the FIRST write happened, so a card that saves
 * nothing cannot pass them either.
 *
 * Synthetic services only: the Firestore writers, the uploader and the two
 * media surfaces are local stubs. The card itself is imported normally.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from './UnifiedCaptureCard'
import type { Child } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'

type AddDocCall = { collectionKey: string; data: Record<string, unknown> }
const addDocCalls: AddDocCall[] = []

/**
 * Writes park here until the test lets them go, which is what "a save is in
 * flight" means on a real phone on a real connection. The call is RECORDED
 * before it waits, so a second write that should never have been attempted is
 * still counted.
 */
let gate: Promise<void> | null = null
let openGate: (() => void) | null = null

function holdWrites() {
  gate = new Promise<void>((resolve) => {
    openGate = () => {
      gate = null
      openGate = null
      resolve()
    }
  })
}

function releaseWrites() {
  openGate?.()
}

/** Collection keys whose writes reject once they are let go. */
let failing = new Set<string>()

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async (col: { __key: string }, data: Record<string, unknown>) => {
    addDocCalls.push({ collectionKey: col.__key, data })
    if (gate) await gate
    if (failing.has(col.__key)) throw new Error(`synthetic ${col.__key} write failure`)
    return { id: `mock-${addDocCalls.length}` }
  }),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  query: vi.fn(() => ({ __key: 'activityConfigs' })),
  where: vi.fn(() => ({})),
  // The card reads the family's quick-log configs; no family has any here, so
  // the eight built-in chips are what the tests tap.
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
  uploadArtifactFile: vi.fn(async (_fam: string, _id: string, _f: unknown, name: string) => ({
    downloadUrl: `https://x/${name}`,
  })),
}))

/**
 * The stub deliberately does NOT disable its own commit button while
 * `uploading` — it reports the flag instead. A surface that refused the tap
 * would prove its own stub rather than the card's guard; the pending UI is
 * asserted separately, by reading the flag the card passed down.
 */
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onCaptureBatch,
    uploading,
  }: {
    onCaptureBatch?: (files: File[]) => void
    uploading?: boolean
  }) => (
    <div data-testid="photo-capture" data-uploading={uploading ? 'yes' : 'no'}>
      <button
        data-testid="commit-batch"
        onClick={() => onCaptureBatch?.([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])}
      >
        commit batch
      </button>
      <button data-testid="commit-empty-batch" onClick={() => onCaptureBatch?.([])}>
        commit nothing
      </button>
    </div>
  ),
}))

vi.mock('../../components/AudioRecorder', () => ({
  default: () => <div data-testid="audio-recorder" />,
}))

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

const TODAY = '2026-05-17'

function renderCard(variant: 'parent' | 'kid' = 'parent') {
  const onSnackMessage = vi.fn()
  const setTodayArtifacts = vi.fn()
  render(
    <MemoryRouter>
      <UnifiedCaptureCard
        familyId="fam-1"
        selectedChildId="lincoln"
        today={TODAY}
        weekPlanId="week-1"
        selectableChildren={children}
        todayArtifacts={[]}
        setTodayArtifacts={setTodayArtifacts}
        onSnackMessage={onSnackMessage}
        variant={variant}
        activeChild={children[0]}
      />
    </MemoryRouter>,
  )
  return { onSnackMessage, setTodayArtifacts }
}

const saveButton = () => screen.getByRole('button', { name: /save capture/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i)
const artifactWrites = () => addDocCalls.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => addDocCalls.filter((c) => c.collectionKey === 'hours')

/**
 * Taps the same button three times with no render in between. React has not
 * re-rendered — the disabled attribute has not landed yet — so the only thing
 * that can refuse taps two and three is the synchronous ref the card claims
 * before its first `await`.
 */
async function tapThrice(button: HTMLElement) {
  await act(async () => {
    button.click()
    button.click()
    button.click()
  })
}

beforeEach(() => {
  addDocCalls.length = 0
  failing = new Set()
  gate = null
  openGate = null
})

describe('UnifiedCaptureCard — a pending save takes one tap (FIX-262)', () => {
  it('writes the note capture once however many times the parent taps', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    await tapThrice(saveButton())

    // Taps two and three were refused while the first write was still open.
    expect(artifactWrites()).toHaveLength(1)

    releaseWrites()
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(1)

    // The write order and both payloads are the single-tap ones, unchanged.
    expect(addDocCalls.map((c) => c.collectionKey)).toEqual(['artifacts', 'hours'])
    expect(artifactWrites()[0].data).toMatchObject({
      title: 'Lego build',
      type: EvidenceType.Note,
      content: 'Built a tower',
      activityName: 'Lego build',
      childId: 'lincoln',
      dayLogId: TODAY,
      weekPlanId: 'week-1',
    })
    expect(hoursWrites()[0].data).toMatchObject({
      childId: 'lincoln',
      date: TODAY,
      minutes: 45,
      subjectBucket: 'PracticalArts',
      source: 'unified-capture',
      quickCapture: true,
      notes: 'Lego build: Built a tower',
    })
    expect(onSnackMessage).toHaveBeenCalledTimes(1)
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })

  it('says it is saving, and a tap on the pending button does nothing', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))

    holdWrites()
    fireEvent.click(saveButton())

    expect(saveButton()).toBeDisabled()
    // Said on screen, not only in a tooltip nobody can hover on a phone — and
    // the button keeps its one name while it is pending.
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(saveButton()).toHaveTextContent('Save Capture')
    fireEvent.click(saveButton())

    releaseWrites()
    // The status clears when the save finishes — one write for the two taps.
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument())
    expect(hoursWrites()).toHaveLength(1)
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 120, subjectBucket: 'Science' })
  })

  it('logs a time-only capture once, with no artifact, however many taps', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))

    holdWrites()
    await tapThrice(saveButton())
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(0)
    expect(hoursWrites()[0].data).toMatchObject({
      minutes: 45,
      subjectBucket: 'PracticalArts',
      source: 'unified-capture',
      notes: 'Lego build',
    })
  })

  it('still accepts the next capture the parent means to make', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(addDocCalls).toHaveLength(2))

    // A second, deliberate capture: the form has reset, so it is filled again.
    await waitFor(() => expect(saveButton()).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    fireEvent.change(noteField(), { target: { value: 'Saw the otters' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(addDocCalls).toHaveLength(4))
    expect(addDocCalls.map((c) => c.collectionKey)).toEqual([
      'artifacts',
      'hours',
      'artifacts',
      'hours',
    ])
    expect(hoursWrites()[1].data).toMatchObject({
      minutes: 120,
      subjectBucket: 'Science',
      source: 'unified-capture',
      notes: 'Zoo / museum trip: Saw the otters',
    })
  })

  it('releases the guard when the artifact write fails first', async () => {
    failing = new Set(['artifacts'])
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Read two chapters' } })
    fireEvent.click(saveButton())

    await waitFor(() =>
      expect(onSnackMessage).toHaveBeenCalledWith({
        text: 'Failed to save note.',
        severity: 'error',
      }),
    )
    // The early return still stands: no hours row rode on a failed artifact.
    expect(hoursWrites()).toHaveLength(0)
    // The form kept the note, and the button is live again rather than stuck.
    expect((noteField() as HTMLTextAreaElement).value).toBe('Read two chapters')
    await waitFor(() => expect(saveButton()).not.toBeDisabled())

    failing = new Set()
    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))
  })

  it('releases the guard when the hours write fails after the artifact', async () => {
    failing = new Set(['hours'])
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.click(saveButton())

    await waitFor(() =>
      expect(onSnackMessage).toHaveBeenCalledWith({
        text: "Captured (couldn't log hours — try again from Records)",
        severity: 'error',
      }),
    )
    expect(artifactWrites()).toHaveLength(1)
    expect(hoursWrites()).toHaveLength(1)

    // Guard released: the next capture is accepted.
    failing = new Set()
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(2))
    expect(hoursWrites()[1].data).toMatchObject({ minutes: 120, subjectBucket: 'Science' })
  })

  it('does not let a photo commit slip past a note save in flight', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())

    // The tabs are not the guard: the parent can still move to Photo mid-save,
    // and the media surface reads as busy because the latch is one card-wide.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    expect(screen.getByTestId('photo-capture')).toHaveAttribute('data-uploading', 'yes')
    fireEvent.click(screen.getByTestId('commit-batch'))

    expect(artifactWrites()).toHaveLength(1)
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // One artifact and one hours row for the one capture — the photo pathway
    // wrote nothing, and the shared 45 minutes were not logged twice.
    expect(artifactWrites()).toHaveLength(1)
    expect(artifactWrites()[0].data).toMatchObject({ type: EvidenceType.Note })
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 45 })
  })

  it('claims nothing when there is nothing to save', async () => {
    renderCard()
    // Blank form: the button is disabled for the reason it always was.
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveAttribute('title', 'Add a photo, audio, note, or duration')

    // An empty photo batch is not a save either, so it must not latch the card.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('commit-empty-batch'))
    expect(addDocCalls).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /^note$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
  })
})

describe('UnifiedCaptureCard — the kid button is one tap too (FIX-262)', () => {
  it('logs the kid’s minutes once however many times the button is tapped', async () => {
    const { onSnackMessage } = renderCard('kid')
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))

    holdWrites()
    await tapThrice(screen.getByRole('button', { name: /save my time/i }))

    expect(hoursWrites()).toHaveLength(1)
    expect(screen.getByRole('button', { name: /save my time/i })).toBeDisabled()
    expect(screen.getByText('Saving…')).toBeInTheDocument()

    releaseWrites()
    await waitFor(() =>
      expect(onSnackMessage).toHaveBeenCalledWith({ text: 'Logged 45 min', severity: 'success' }),
    )
    expect(hoursWrites()).toHaveLength(1)
    expect(artifactWrites()).toHaveLength(0)
    expect(hoursWrites()[0].data).toMatchObject({
      childId: 'lincoln',
      date: TODAY,
      minutes: 45,
      subjectBucket: 'PracticalArts',
      source: 'unified-capture',
      quickCapture: true,
      notes: 'Lego build',
    })
  })
})
