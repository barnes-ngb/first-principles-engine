/**
 * FIX-262 — one tap, one write.
 *
 * Every save on this card is asynchronous and reaches its first `await` before
 * anything on screen changes. Tapping the save button again while the first
 * write was in flight therefore wrote the capture again — one artifact and one
 * hours row per tap — and the same hole was open on the time-only and media
 * pathways, which share the card's child, category and minutes.
 *
 * What these tests hold:
 *
 *   • repeat taps during a pending save produce exactly ONE write per
 *     collection, with the SAME payload the single-tap path writes;
 *   • a deliberate second log after the first finishes still works;
 *   • a failure — early (the entry) or late (the hours row) — releases the
 *     guard, so nothing is left permanently unsavable;
 *   • nothing-to-save does not claim the guard at all;
 *   • choosing media while a save is in flight writes nothing and cannot add a
 *     second record to the save that is running.
 *
 * Regression sensitivity. Against the production code at 69e4f89 — no guard at
 * all — the repeat-tap tests fail by writing one document per tap. Each test
 * also asserts the FIRST write happened, so a card that saves nothing cannot
 * pass them either.
 *
 * Adapted for FIX-267: the button is *Save work*, the quick fill is folded
 * away, and media is staged into the one tray rather than committing itself.
 *
 * Synthetic services only: the Firestore writers, the uploader and the two
 * media surfaces are local stubs. The card itself is imported normally.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from './UnifiedCaptureCard'
import type { Child } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'

interface WriteCall {
  collectionKey: string
  id: string
  data: Record<string, unknown>
}
const writes: WriteCall[] = []
let generated = 0

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
    writes.push({ collectionKey: col.__key, id: `added-${writes.length}`, data })
    if (gate) await gate
    if (failing.has(col.__key)) throw new Error(`synthetic ${col.__key} write failure`)
    return { id: `mock-${writes.length}` }
  }),
  doc: vi.fn((col: { __key: string }, id?: string) => ({
    __key: col.__key,
    id: id ?? `generated-${(generated += 1)}`,
  })),
  setDoc: vi.fn(async (ref: { __key: string; id: string }, data: Record<string, unknown>) => {
    writes.push({ collectionKey: ref.__key, id: ref.id, data })
    if (gate) await gate
    if (failing.has(ref.__key)) throw new Error(`synthetic ${ref.__key} write failure`)
  }),
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
 * The stub reports the `uploading` flag rather than refusing a tap, so the
 * card's own guard is what is under test. It stages through the host's seam
 * (direct staging) and keeps the kid card's single `onCapture` path.
 */
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onStageFiles,
    onCapture,
    uploading,
  }: {
    onStageFiles?: (files: File[]) => void
    onCapture?: (file: File) => void
    uploading?: boolean
  }) => (
    <div data-testid="photo-capture" data-uploading={uploading ? 'yes' : 'no'}>
      <button
        data-testid="stage-photo"
        onClick={() => {
          if (onStageFiles) onStageFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
          else onCapture?.(new File(['a'], 'a.jpg', { type: 'image/jpeg' }))
        }}
      >
        choose a photo
      </button>
      <button data-testid="stage-nothing" onClick={() => onStageFiles?.([])}>
        choose nothing
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

const saveButton = () => screen.getByRole('button', { name: /^save work$/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i)
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const artifactWrites = () => writes.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => writes.filter((c) => c.collectionKey === 'hours')
const unfinished = () => screen.getByTestId('log-work-unfinished')

/** The quick fill is folded away by design — open it, then tap the chip. */
function tapChip(name: RegExp) {
  const toggle = screen.queryByRole('button', { name: /quick fill/i })
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name }))
}

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
  writes.length = 0
  generated = 0
  failing = new Set()
  gate = null
  openGate = null
  let seq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${(seq += 1)}`),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Log work — a pending save takes one tap (FIX-262)', () => {
  it('writes the log once however many times the parent taps', async () => {
    const { onSnackMessage } = renderCard()
    tapChip(/Lego build/i)
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    await tapThrice(saveButton())

    // Taps two and three were refused while the first write was still open.
    expect(artifactWrites()).toHaveLength(1)

    releaseWrites()
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(1)

    // The write order and both payloads are the single-tap ones, unchanged.
    expect(writes.map((c) => c.collectionKey)).toEqual(['artifacts', 'hours'])
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
      text: 'Saved your note — 45 min logged',
      severity: 'success',
    })
  })

  it('says it is saving, and a tap on the pending button does nothing', async () => {
    renderCard()
    tapChip(/Zoo \/ museum trip/i)

    holdWrites()
    fireEvent.click(saveButton())

    expect(saveButton()).toBeDisabled()
    // Said on screen, not only in a tooltip nobody can hover on a phone — and
    // the button keeps its one name while it is pending.
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(saveButton()).toHaveTextContent('Save work')
    fireEvent.click(saveButton())

    releaseWrites()
    // The status clears when the save finishes — one write for the two taps.
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument())
    expect(hoursWrites()).toHaveLength(1)
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 120, subjectBucket: 'Science' })
  })

  it('logs a time-only draft once, with no artifact, however many taps', async () => {
    renderCard()
    tapChip(/Lego build/i)

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

  it('still accepts the next log the parent means to make', async () => {
    renderCard()
    tapChip(/Lego build/i)
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(writes).toHaveLength(2))

    // A second, deliberate log: the form has reset, so it is filled again.
    await waitFor(() => expect(saveButton()).toBeDisabled())
    tapChip(/Zoo \/ museum trip/i)
    fireEvent.change(noteField(), { target: { value: 'Saw the otters' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(writes).toHaveLength(4))
    expect(writes.map((c) => c.collectionKey)).toEqual([
      'artifacts',
      'hours',
      'artifacts',
      'hours',
    ])
    // Two logs, four documents, four distinct ids.
    expect(new Set(writes.map((c) => c.id)).size).toBe(4)
    expect(hoursWrites()[1].data).toMatchObject({
      minutes: 120,
      subjectBucket: 'Science',
      source: 'unified-capture',
      notes: 'Zoo / museum trip: Saw the otters',
    })
  })

  it('releases the guard when the entry write fails first', async () => {
    failing = new Set(['artifacts'])
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Read two chapters' } })
    fireEvent.click(saveButton())

    await waitFor(() =>
      expect(onSnackMessage).toHaveBeenCalledWith({
        text: 'Couldn’t confirm your note saved.',
        severity: 'error',
      }),
    )
    // No hours row rode on an entry that was not acknowledged.
    expect(hoursWrites()).toHaveLength(0)
    // The form kept the note, and the retry is live rather than stuck.
    expect((noteField() as HTMLTextAreaElement).value).toBe('Read two chapters')
    const retry = within(unfinished()).getByRole('button', { name: /try again/i })
    await waitFor(() => expect(retry).toBeEnabled())

    failing = new Set()
    fireEvent.click(retry)
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))
    // The retry is the same document, not a second record.
    expect(new Set(artifactWrites().map((c) => c.id)).size).toBe(1)
  })

  it('releases the guard when the hours write fails after the entry', async () => {
    failing = new Set(['hours'])
    const { onSnackMessage } = renderCard()
    tapChip(/Lego build/i)
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.click(saveButton())

    await waitFor(() =>
      expect(onSnackMessage).toHaveBeenCalledWith({
        text: 'Your note saved. Couldn’t confirm the 45 minutes saved.',
        severity: 'error',
      }),
    )
    expect(artifactWrites()).toHaveLength(1)
    expect(hoursWrites()).toHaveLength(1)

    // Guard released: the retry finishes the same hours document.
    failing = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: /retry 45 min/i }))
    await waitFor(() => expect(hoursWrites()).toHaveLength(2))
    expect(new Set(hoursWrites().map((c) => c.id)).size).toBe(1)
    expect(hoursWrites()[1].data).toMatchObject({ minutes: 45 })
  })

  it('does not let a staged photo add a record to a save in flight', async () => {
    renderCard()
    tapChip(/Lego build/i)
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())

    // The attachment controls are not the guard: the parent can still choose a
    // photo mid-save, and the media surface reads as busy because the latch is
    // one card-wide. Choosing it writes nothing at all.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    expect(screen.getByTestId('photo-capture')).toHaveAttribute('data-uploading', 'yes')
    fireEvent.click(screen.getByTestId('stage-photo'))

    expect(artifactWrites()).toHaveLength(1)
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // One artifact and one hours row for the one log — the staged photo is a
    // newer draft, not a second write, and the shared 45 minutes were not
    // logged twice.
    expect(artifactWrites()).toHaveLength(1)
    expect(artifactWrites()[0].data).toMatchObject({ type: EvidenceType.Note })
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 45 })
    expect(screen.getByText('1 photo attached — not saved yet.')).toBeInTheDocument()
  })

  it('claims nothing when there is nothing to save', async () => {
    renderCard()
    // Blank form: the button is disabled, with the reason on screen.
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText('Add a note, some minutes, a photo or a recording.'),
    ).toBeInTheDocument()

    // An empty selection is not a draft either, so it must not latch the card.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-nothing'))
    expect(writes).toHaveLength(0)
    expect(saveButton()).toBeDisabled()

    tapChip(/Lego build/i)
    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
  })

  it('refuses a second save while one is unfinished, and says why', async () => {
    failing = new Set(['hours'])
    renderCard()
    tapChip(/Lego build/i)
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(unfinished()).toBeInTheDocument())
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText(
        'Finish the unfinished save below, or stop waiting on it, before starting another.',
      ),
    ).toBeInTheDocument()
    expect(minutesField().value).toBe('45')
    // Exactly the two writes of the one attempt.
    expect(writes).toHaveLength(2)
  })
})

describe('Log work — the kid button is one tap too (FIX-262)', () => {
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
