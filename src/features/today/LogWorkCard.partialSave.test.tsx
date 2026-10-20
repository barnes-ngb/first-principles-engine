/**
 * `FIX-267` — a save that half-landed says exactly what landed, and finishes.
 *
 * The old card's answer to a failure was a red snackbar and one route forward:
 * tap Save again, which called `addDoc` again. So the two honest outcomes were
 * *lose the work* or *file it twice* — on the `hours` rail, where a duplicate
 * is a wrong number in a legal record.
 *
 * What these hold:
 *
 *   • each failure named for what it is, with what DID save stated and never
 *     overstated;
 *   • the draft and the staged files kept, because they are what a retry needs;
 *   • a retry that writes the SAME documents — no second artifact, no second
 *     `hours` row — and reports the child and day it finished for;
 *   • no second save allowed while one is unfinished, with the reason visible;
 *   • *Dismiss* keeping whatever saved and writing nothing;
 *   • the identity rails from FIX-263 intact: a completion that lands after the
 *     day moved names the day it was written for and leaves the new draft
 *     alone, and a child or day change DROPS staged media rather than filing
 *     one boy's photo under his brother.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LogWorkCard from './LogWorkCard'
import type { Child } from '../../core/types'

interface WriteCall {
  collectionKey: string
  id: string
  data: Record<string, unknown>
}
const writes: WriteCall[] = []
const updates: { id: string }[] = []
const uploads: string[] = []
let generated = 0

/** Collection keys whose `setDoc` rejects. */
let failingWrites = new Set<string>()
/** Filenames whose upload rejects. */
let failingUploads = new Set<string>()

/** Writes park here until the test lets them go — a save in flight. */
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

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((col: { __key: string }, id?: string) => ({
    __key: col.__key,
    id: id ?? `generated-${(generated += 1)}`,
  })),
  setDoc: vi.fn(
    async (ref: { __key: string; id: string }, data: Record<string, unknown>) => {
      writes.push({ collectionKey: ref.__key, id: ref.id, data })
      if (gate) await gate
      if (failingWrites.has(ref.__key)) throw new Error(`synthetic ${ref.__key} failure`)
    },
  ),
  updateDoc: vi.fn(async (ref: { id: string }) => {
    updates.push({ id: ref.id })
  }),
  query: vi.fn(() => ({ __key: 'activityConfigs' })),
  where: vi.fn(() => ({})),
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
  generateFilename: vi.fn((ext: string) => `stamp.${ext}`),
  uploadArtifactFile: vi.fn(
    async (_fam: string, _id: string, _file: unknown, filename: string) => {
      uploads.push(filename)
      if (failingUploads.has(filename)) throw new Error(`synthetic upload failure`)
      return { downloadUrl: `https://x/${filename}` }
    },
  ),
}))

vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onStageFiles,
    onDraftChange,
  }: {
    onStageFiles?: (files: File[]) => void
    onDraftChange?: () => void
  }) => (
    <div data-testid="photo-capture">
      <button
        data-testid="stage-two-photos"
        onClick={() => {
          onDraftChange?.()
          onStageFiles?.([
            new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
            new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
          ])
        }}
      >
        choose two
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

const DAY_A = '2026-10-20'
const DAY_B = '2026-10-21'

type CardProps = ComponentProps<typeof LogWorkCard>

function renderCard(overrides: Partial<CardProps> = {}) {
  const onSnackMessage = vi.fn()
  const setTodayArtifacts = vi.fn()
  const props: CardProps = {
    familyId: 'fam-1',
    selectedChildId: 'lincoln',
    today: DAY_A,
    weekPlanId: 'week-1',
    selectableChildren: children,
    todayArtifacts: [],
    setTodayArtifacts,
    onSnackMessage,
    activeChild: children[0],
    ...overrides,
  }
  const view = render(
    <MemoryRouter>
      <LogWorkCard {...props} />
    </MemoryRouter>,
  )
  const rerenderWith = (next: Partial<CardProps>) =>
    view.rerender(
      <MemoryRouter>
        <LogWorkCard {...props} {...next} />
      </MemoryRouter>,
    )
  return { onSnackMessage, setTodayArtifacts, rerenderWith }
}

const saveButton = () => screen.getByRole('button', { name: /^save work$/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i) as HTMLTextAreaElement
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const artifactWrites = () => writes.filter((w) => w.collectionKey === 'artifacts')
const hoursWrites = () => writes.filter((w) => w.collectionKey === 'hours')
const unfinished = () => screen.getByTestId('log-work-unfinished')
const lastSnack = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as { text: string; severity: string }

function fillNoteAndMinutes(note = 'Built a tower', minutes = '45') {
  fireEvent.change(noteField(), { target: { value: note } })
  fireEvent.change(minutesField(), { target: { value: minutes } })
}

beforeEach(() => {
  writes.length = 0
  updates.length = 0
  uploads.length = 0
  generated = 0
  failingWrites = new Set()
  failingUploads = new Set()
  gate = null
  openGate = null
  let seq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${(seq += 1)}`),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('LogWorkCard — the hours row failed and the evidence did not', () => {
  it('says which, keeps the draft, and finishes it on one tap', async () => {
    failingWrites = new Set(['hours'])
    const { onSnackMessage, setTodayArtifacts } = renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())

    await waitFor(() => expect(unfinished()).toBeInTheDocument())
    // Bound to what was submitted, honest about both halves, and never a claim
    // that an unanswered write did not happen.
    expect(unfinished()).toHaveTextContent('Unfinished — Lincoln · Tue, Oct 20')
    expect(unfinished()).toHaveTextContent('Your note saved. Couldn’t confirm the 45 minutes saved.')
    expect(lastSnack(onSnackMessage)).toEqual({
      text: 'Your note saved. Couldn’t confirm the 45 minutes saved.',
      severity: 'error',
    })
    // The evidence that IS whole reaches the day's list now, rather than
    // waiting for the whole operation to finish.
    expect(setTodayArtifacts).toHaveBeenCalled()
    // The draft is still here, because a retry needs it.
    expect(noteField().value).toBe('Built a tower')
    expect(minutesField().value).toBe('45')
    // And no second save may start while this one is open.
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText(
        'Finish the unfinished save below, or stop waiting on it, before starting another.',
      ),
    ).toBeInTheDocument()

    failingWrites = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Retry 45 min' }))

    await waitFor(() =>
      expect(lastSnack(onSnackMessage).text).toBe(
        `Saved your note — 45 min logged — finished for Lincoln on ${DAY_A}`,
      ),
    )
    // ONE artifact and ONE hours row for the whole episode: the retry did not
    // re-create the entry, and the two hours attempts share one document.
    expect(artifactWrites()).toHaveLength(1)
    expect(hoursWrites()).toHaveLength(2)
    expect(new Set(hoursWrites().map((w) => w.id)).size).toBe(1)
    expect(screen.queryByTestId('log-work-unfinished')).not.toBeInTheDocument()
  })

  it('a finished retry clears the draft it saved, so it cannot be filed twice', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fillNoteAndMinutes('RETRY NOTE', '27')
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    failingWrites = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Retry 27 min' }))
    await waitFor(() => expect(screen.queryByTestId('log-work-unfinished')).toBeNull())

    // The whole log is saved, and nothing of it is left in the form offering
    // itself as an unsaved entry — the defect was a second artifact and a
    // second hours row from the obvious next tap.
    await waitFor(() => expect(noteField().value).toBe(''))
    expect(minutesField().value).toBe('')
    expect(saveButton()).toBeDisabled()
    expect(artifactWrites()).toHaveLength(1)
    expect(new Set(hoursWrites().map((w) => w.id)).size).toBe(1)
  })

  /**
   * Adapted, not dropped, in the PR #1909 repair.
   *
   * The assertion here used to require the words *"The draft you have typed
   * since is kept as it is."* — and that promise was false for the fields the
   * newer draft had only INHERITED: the unchanged 45 minutes stayed, and the
   * next tap wrote them a second time. What this test was protecting is kept
   * and still asserted — the parent's own typing is not cleared, and the dialog
   * does not say it will be — with the inherited half now stated truthfully.
   * The write-level proof lives in `LogWorkCard.submittedRetirement.test`.
   */
  it('Stop waiting keeps a newer draft’s own typing, and says what it takes', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A different thing' } })
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Stop waiting' }))

    const dialog = await screen.findByRole('dialog')
    // It must not imply the parent's newer typing will be cleared.
    expect(dialog).toHaveTextContent('what you have changed or attached since is kept')
    expect(dialog).not.toHaveTextContent('clears this draft')
    // Nor promise that a field she never touched survives.
    expect(dialog).toHaveTextContent('The parts you already submitted are taken out of this draft')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop waiting' }))

    await waitFor(() =>
      expect(screen.queryByTestId('log-work-unfinished')).not.toBeInTheDocument(),
    )
    expect(noteField().value).toBe('A different thing')
    // The submitted minutes are not left behind as an apparently unsaved entry.
    expect(minutesField().value).toBe('')
    expect(artifactWrites()).toHaveLength(1)
  })

  it('a finished retry leaves a NEWER draft’s edits alone', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    // The parent starts typing the next log while the panel is open.
    fireEvent.change(noteField(), { target: { value: 'The next thing entirely' } })

    failingWrites = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Retry 45 min' }))
    await waitFor(() => expect(screen.queryByTestId('log-work-unfinished')).toBeNull())

    expect(noteField().value).toBe('The next thing entirely')
    expect(saveButton()).toBeEnabled()
    // …and the 45 minutes it just finished are no longer in the draft, so her
    // next tap files the new note and not a second hours row.
    expect(minutesField().value).toBe('')
  })

  it('Stop waiting explains itself, then takes the submitted draft with it', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    const before = writes.length
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Stop waiting' }))

    // It says what it keeps and what it clears BEFORE doing either.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Whatever already saved stays saved — nothing is deleted.')
    expect(dialog).toHaveTextContent('clears this draft, so the same work can’t be filed twice')
    fireEvent.click(within(dialog).getByRole('button', { name: /keep waiting/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(unfinished()).toBeInTheDocument()

    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Stop waiting' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stop waiting' }),
    )

    await waitFor(() =>
      expect(screen.queryByTestId('log-work-unfinished')).not.toBeInTheDocument(),
    )
    // The panel goes before the dialog's exit transition finishes, and the
    // leaving dialog still holds the background `aria-hidden` — so wait it out
    // as the Keep waiting half above does, then ask for Save accessibly.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(writes).toHaveLength(before)
    // Nothing stored is deleted or rolled back: the artifact that saved is
    // still the family's record. But the submitted words are NOT left in the
    // form as an apparently unsaved entry for the next tap to file again.
    expect(artifactWrites()).toHaveLength(1)
    expect(noteField().value).toBe('')
    expect(minutesField().value).toBe('')
    expect(saveButton()).toBeDisabled()
  })

  it('offers no race: both panel controls are dead while a retry is in flight', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    failingWrites = new Set()
    holdWrites()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Retry 45 min' }))

    expect(within(unfinished()).getByRole('button', { name: 'Retry 45 min' })).toBeDisabled()
    expect(within(unfinished()).getByRole('button', { name: 'Stop waiting' })).toBeDisabled()

    releaseWrites()
    await waitFor(() => expect(screen.queryByTestId('log-work-unfinished')).toBeNull())
    expect(new Set(hoursWrites().map((w) => w.id)).size).toBe(1)
  })
})

describe('LogWorkCard — nothing landed, and an upload that half landed', () => {
  it('claims no save when the entry itself failed, and retries into the same document', async () => {
    failingWrites = new Set(['artifacts'])
    const { onSnackMessage } = renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())

    await waitFor(() => expect(unfinished()).toBeInTheDocument())
    expect(unfinished()).toHaveTextContent('Couldn’t confirm your note saved.')
    // It may not claim the write did not happen — it was never answered.
    expect(lastSnack(onSnackMessage).text).not.toMatch(/did not save|nothing saved/i)
    // The hours row never rode on an unacknowledged entry.
    expect(hoursWrites()).toHaveLength(0)

    failingWrites = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(2)
    // Two attempts, ONE document — so an ambiguous first failure that really
    // committed cannot become a second record.
    expect(new Set(artifactWrites().map((w) => w.id)).size).toBe(1)
  })

  it('counts the files that uploaded and finishes only the rest', async () => {
    failingUploads = new Set(['1-stamp.jpg'])
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-two-photos'))
    fireEvent.click(saveButton())

    await waitFor(() => expect(unfinished()).toBeInTheDocument())
    expect(unfinished()).toHaveTextContent('The entry and 1 of 2 files saved.')
    expect(unfinished()).toHaveTextContent('Couldn’t confirm 1 of 2 uploaded.')
    // The record does not claim media it does not have.
    expect(updates).toHaveLength(0)
    // The files are still staged, which is what the retry uses.
    expect(screen.getByText('2 photos attached — not saved yet.')).toBeInTheDocument()

    failingUploads = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Finish uploading' }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(uploads).toEqual(['0-stamp.jpg', '1-stamp.jpg', '1-stamp.jpg'])
    expect(artifactWrites()).toHaveLength(1)
    expect(lastSnack(onSnackMessage).severity).toBe('success')
    // Finished: the staged files are no longer offered as unsaved.
    await waitFor(() =>
      expect(screen.queryByText(/photos attached — not saved yet/)).not.toBeInTheDocument(),
    )
  })
})

describe('LogWorkCard — the identity rails still hold', () => {
  it('names the day a completion belongs to when the page has moved on', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    fillNoteAndMinutes('Day A note')

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ today: DAY_B })
    fireEvent.change(noteField(), { target: { value: 'Day B note' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // The newer draft is untouched and the receipt is about the older save.
    expect(noteField().value).toBe('Day B note')
    expect(lastSnack(onSnackMessage).text).toBe(
      `Saved your note — 45 min logged — saved for Lincoln on ${DAY_A}. What is on screen now is untouched.`,
    )
    expect(artifactWrites()[0].data).toMatchObject({
      dayLogId: DAY_A,
      content: 'Day A note',
    })
    expect(hoursWrites()[0].data).toMatchObject({ date: DAY_A, minutes: 45 })
  })

  it('a retry stays bound to its own child after the page switches child', async () => {
    failingWrites = new Set(['hours'])
    const { onSnackMessage, rerenderWith } = renderCard()
    fillNoteAndMinutes()
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    rerenderWith({ selectedChildId: 'london', activeChild: children[1] })
    // The card still names the child and day the log was submitted for, rather
    // than relabelling itself to whoever the page is showing.
    expect(unfinished()).toHaveTextContent('Unfinished — Lincoln · Tue, Oct 20')

    failingWrites = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Retry 45 min' }))

    await waitFor(() => expect(hoursWrites()).toHaveLength(2))
    expect(hoursWrites()[1].data).toMatchObject({ childId: 'lincoln', date: DAY_A })
    expect(lastSnack(onSnackMessage).text).toContain(`finished for Lincoln on ${DAY_A}`)
  })

  it('drops staged media when the child changes, and says it did', async () => {
    const { rerenderWith } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-two-photos'))
    expect(screen.getByText('2 photos attached — not saved yet.')).toBeInTheDocument()

    rerenderWith({ selectedChildId: 'london', activeChild: children[1] })

    await waitFor(() =>
      expect(screen.queryByText('2 photos attached — not saved yet.')).not.toBeInTheDocument(),
    )
    // The loss is visible, and nothing was written for either child.
    expect(
      screen.getByText(/the media attached here was removed — nothing was saved/i),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)
    expect(uploads).toHaveLength(0)
  })
})
