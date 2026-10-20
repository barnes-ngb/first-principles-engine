/**
 * `FIX-267` — a submitted part may not stay in the draft (PR #1909, round 1).
 *
 * ── The defect, as reproduced in a browser ─────────────────────────────────
 *
 * A note, a photo and 27 minutes. *Save work*. The entry and the photo land;
 * the `hours` write is attempted and its acknowledgement never arrives. The
 * parent edits the NOTE — only the note — and taps *Stop waiting*. The old rule
 * read *"the draft has changed, so leave all of it alone"*, which was the wrong
 * sentence applied to the right question: the minutes and the photo in that
 * draft were not edits, they were INHERITED from the submission. So they sat in
 * the form looking unsaved, and the next *Save work* wrote a second `hours` row
 * for the same 27 minutes and re-uploaded the same photo under a new artifact.
 *
 * The same shape reached the two success endings: a retry that completed, and
 * an initial save that completed slowly, both left an unchanged submitted note
 * and an unchanged submitted 27 minutes in the form with *Save work* live.
 *
 * ── What these hold ────────────────────────────────────────────────────────
 *
 * All three terminal transitions retire exactly the parts the submission still
 * owns, and the assertions are on the **writes and the document ids** — not on
 * a field reading empty, which a form can show while the next tap still files a
 * duplicate:
 *
 *   • the reported sequence, end to end, through *Stop waiting*;
 *   • the same through a finished retry and a finished delayed save;
 *   • a note or a minutes value typed away and back is the parent's NEW value
 *     and is kept — the epoch rule, not value equality;
 *   • genuinely new minutes are kept and saved as themselves;
 *   • a photo staged DURING the save stays; the submitted one goes;
 *   • a metadata-only edit (the name) retires the record parts and cannot save
 *     on its own;
 *   • day A → B → A is a scope change and is not touched at all.
 *
 * Synthetic services only: Firestore, the uploader and the two media surfaces
 * are local stubs. `setDoc` RECORDS the write before it throws, which is the
 * lost-acknowledgement case said in code — the row is on the server and the
 * client never heard.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
const updates: { id: string; data: Record<string, unknown> }[] = []
const uploads: string[] = []
let generated = 0

/** Collection keys whose `setDoc` rejects AFTER recording the write. */
let failingWrites = new Set<string>()

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
      // Recorded BEFORE the failure: this is the lost acknowledgement, where
      // the server has the row and the client is told nothing landed.
      writes.push({ collectionKey: ref.__key, id: ref.id, data })
      if (gate) await gate
      if (failingWrites.has(ref.__key)) throw new Error(`synthetic ${ref.__key} failure`)
    },
  ),
  updateDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    updates.push({ id: ref.id, data })
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
      return { downloadUrl: `https://x/${filename}` }
    },
  ),
}))

/** Two distinguishable single photos, so "which file" is a real question. */
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
        data-testid="stage-first-photo"
        onClick={() => {
          onDraftChange?.()
          onStageFiles?.([new File(['a'], 'first.jpg', { type: 'image/jpeg' })])
        }}
      >
        choose the first
      </button>
      <button
        data-testid="stage-second-photo"
        onClick={() => {
          onDraftChange?.()
          onStageFiles?.([new File(['z'], 'second.jpg', { type: 'image/jpeg' })])
        }}
      >
        choose another
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
const nameField = () => screen.getByLabelText(/what is this\?/i) as HTMLInputElement
const artifactWrites = () => writes.filter((w) => w.collectionKey === 'artifacts')
const hoursWrites = () => writes.filter((w) => w.collectionKey === 'hours')
const hoursIds = () => new Set(hoursWrites().map((w) => w.id))
const unfinished = () => screen.getByTestId('log-work-unfinished')
const retired = () => screen.queryByTestId('log-work-retired')

/** Tap *Stop waiting* and confirm it, then wait the dialog out. */
async function stopWaiting() {
  fireEvent.click(within(unfinished()).getByRole('button', { name: 'Stop waiting' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stop waiting' }))
  await waitFor(() => expect(screen.queryByTestId('log-work-unfinished')).toBeNull())
  // The leaving dialog still holds the background `aria-hidden`, so Save is not
  // accessibly reachable until its exit transition is done.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

beforeEach(() => {
  writes.length = 0
  updates.length = 0
  uploads.length = 0
  generated = 0
  failingWrites = new Set()
  gate = null
  openGate = null
  let seq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${(seq += 1)}`),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('LogWorkCard — Stop waiting after an unanswered hours write', () => {
  it('the reported sequence: the next Save files the new note ONLY', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-first-photo'))
    fireEvent.click(saveButton())

    await waitFor(() => expect(unfinished()).toBeInTheDocument())
    // The 27 minutes were ATTEMPTED — the row is on the server and the client
    // was told nothing. That is the ambiguity this whole repair turns on.
    expect(hoursWrites()).toHaveLength(1)
    expect(uploads).toEqual(['0-stamp.jpg'])

    // The parent edits the note, and only the note.
    fireEvent.change(noteField(), { target: { value: 'A different thing' } })
    await stopWaiting()

    // Her edit is hers. The parts she never touched belonged to the submission.
    expect(noteField().value).toBe('A different thing')
    expect(minutesField().value).toBe('')
    expect(screen.queryByText(/photo attached — not saved yet/)).toBeNull()
    expect(retired()).toHaveTextContent(
      '1 photo and 27 minutes you submitted have been taken out of this draft, so the same work can’t be filed twice.',
    )
    expect(retired()).toHaveTextContent('anything you changed or attached since is still here')
    // Stopping writes nothing and deletes nothing.
    expect(writes).toHaveLength(2)

    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))

    // The new note, as its own record — and NOT a second 27 minutes, not the
    // photo again, under ids that prove it rather than an empty field.
    expect(artifactWrites()[1].data).toMatchObject({ content: 'A different thing' })
    expect(artifactWrites()[1].id).not.toBe(artifactWrites()[0].id)
    expect(hoursWrites()).toHaveLength(1)
    expect(hoursIds().size).toBe(1)
    expect(uploads).toEqual(['0-stamp.jpg'])
    expect(updates).toHaveLength(1)
  })

  it('says which child and day it is finishing, and promises nothing it cannot keep', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A different thing' } })
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Stop waiting' }))
    const dialog = await screen.findByRole('dialog')

    // The original child and day, from the submission — not whoever the page is
    // showing now.
    expect(dialog).toHaveTextContent('Lincoln · Tue, Oct 20')
    expect(dialog).toHaveTextContent('Whatever already saved stays saved — nothing is deleted.')
    expect(dialog).toHaveTextContent(
      'The parts you already submitted are taken out of this draft, because they may be saved already — what you have changed or attached since is kept.',
    )
    // The sentence this replaced was a promise the action does not keep.
    expect(dialog).not.toHaveTextContent('kept as it is')
    // Both ways out are still here, and both are reachable by name.
    expect(within(dialog).getByRole('button', { name: /keep waiting/i })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Stop waiting' })).toBeEnabled()

    // Declining does nothing at all.
    fireEvent.click(within(dialog).getByRole('button', { name: /keep waiting/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(unfinished()).toBeInTheDocument()
    expect(minutesField().value).toBe('27')
    expect(retired()).toBeNull()
  })

  it('keeps a note and a minutes value typed away and back — they are new', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    // Away, and back to the same characters. `captureDraftOwnership` calls that
    // a new draft on purpose, and the field-level rule may not quietly disagree
    // with it by comparing values.
    fireEvent.change(noteField(), { target: { value: 'Built a tow' } })
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '30' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })

    await stopWaiting()

    expect(noteField().value).toBe('Built a tower')
    expect(minutesField().value).toBe('27')
    // Nothing was taken, so nothing is announced.
    expect(retired()).toBeNull()
    expect(saveButton()).toBeEnabled()
  })

  it('keeps genuinely new minutes, and saves them as themselves', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    // She corrects the time and nothing else.
    fireEvent.change(minutesField(), { target: { value: '45' } })
    failingWrites = new Set()
    await stopWaiting()

    expect(minutesField().value).toBe('45')
    expect(noteField().value).toBe('')
    expect(retired()).toHaveTextContent('The note you submitted has been taken out of this draft')

    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(2))
    // Her 45 minutes, as a row of its own — and no second copy of the note.
    expect(hoursWrites()[1].data).toMatchObject({ minutes: 45, date: DAY_A })
    expect(hoursIds().size).toBe(2)
    expect(artifactWrites()).toHaveLength(1)
  })

  it('retires the record parts when only the NAME was edited, and will not save a name', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    // The activity name is filing, not a record: editing it makes this a
    // changed draft, but it carries nothing of its own to save.
    fireEvent.change(nameField(), { target: { value: 'Lego build' } })
    await stopWaiting()

    expect(nameField().value).toBe('Lego build')
    expect(noteField().value).toBe('')
    expect(minutesField().value).toBe('')
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText(
        'A name on its own isn’t saved. Add a note, some minutes, a photo or a recording.',
      ),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(2)
  })
})

describe('LogWorkCard — the two success endings retire the same way', () => {
  it('a finished RETRY leaves the newer note and takes the submitted minutes', async () => {
    failingWrites = new Set(['hours'])
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(unfinished()).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'The next thing entirely' } })
    failingWrites = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: 'Retry 27 min' }))
    await waitFor(() => expect(screen.queryByTestId('log-work-unfinished')).toBeNull())

    expect(noteField().value).toBe('The next thing entirely')
    expect(minutesField().value).toBe('')
    expect(retired()).toHaveTextContent('27 minutes you submitted')

    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))
    expect(artifactWrites()[1].data).toMatchObject({ content: 'The next thing entirely' })
    // Two attempts at ONE hours row, and no third write for the same minutes.
    expect(hoursWrites()).toHaveLength(2)
    expect(hoursIds().size).toBe(1)
  })

  it('an initial save that completes LATE retires what it saved', async () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-first-photo'))

    holdWrites()
    fireEvent.click(saveButton())
    // The parent types the next note while the save is still in the air.
    fireEvent.change(noteField(), { target: { value: 'And then the fort' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    await waitFor(() => expect(minutesField().value).toBe(''))
    expect(noteField().value).toBe('And then the fort')
    expect(screen.queryByText(/photo attached — not saved yet/)).toBeNull()
    expect(retired()).toHaveTextContent('1 photo and 27 minutes you submitted')

    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))
    expect(artifactWrites()[1].data).toMatchObject({ content: 'And then the fort' })
    expect(hoursWrites()).toHaveLength(1)
    expect(uploads).toEqual(['0-stamp.jpg'])
  })

  it('keeps a photo staged DURING the save and takes only the submitted one', async () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-first-photo'))

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.click(screen.getByTestId('stage-second-photo'))
    releaseWrites()

    await waitFor(() => expect(updates).toHaveLength(1))
    // The new photo is still attached; the submitted one is not. Object
    // identity, so "another photo" is never mistaken for "that photo".
    await waitFor(() =>
      expect(screen.getByText('1 photo attached — not saved yet.')).toBeInTheDocument(),
    )
    expect(noteField().value).toBe('')
    expect(retired()).toHaveTextContent('The note and 1 photo you submitted')

    fireEvent.click(saveButton())
    await waitFor(() => expect(updates).toHaveLength(2))
    // A second artifact for the second photo, with no copy of the saved note.
    expect(artifactWrites()).toHaveLength(2)
    expect(artifactWrites()[1].data.content).toBeUndefined()
    expect(updates[1].data).toEqual({
      uri: 'https://x/0-stamp.jpg',
      mediaUrls: ['https://x/0-stamp.jpg'],
    })
    expect(updates[1].id).not.toBe(updates[0].id)
    expect(uploads).toHaveLength(2)
  })

  it('does not touch a draft the parent went away from and came back to', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Day A note' } })
    fireEvent.change(minutesField(), { target: { value: '27' } })

    holdWrites()
    fireEvent.click(saveButton())
    // Away to another day and back: a NEW visit, so what is on screen is not
    // the thing that was submitted even though it looks identical.
    rerenderWith({ today: DAY_B })
    rerenderWith({ today: DAY_A })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('Day A note')
    expect(minutesField().value).toBe('27')
    expect(retired()).toBeNull()
    expect(onSnackMessage.mock.calls.at(-1)?.[0].text).toContain(
      'What is on screen now is untouched',
    )
  })
})

describe('LogWorkCard — the epoch is wired to every field writer', () => {
  it('writes the note and the minutes through the epoch writers and nowhere else', () => {
    // A source guard, because the rule is only as good as its coverage and the
    // coverage is a property of the FILE, not of any one path through it: a
    // `setNoteText` / `setDurationInput` call added anywhere else would move a
    // field without moving its epoch, and the next completion would then retire
    // a value out from under a parent's edit. The permitted call is one each,
    // inside its writer — which the second pair of assertions pins, so the
    // count alone cannot be satisfied by moving the call somewhere wrong.
    const source = readFileSync(join(import.meta.dirname, 'LogWorkCard.tsx'), 'utf8')
    expect(source.match(/setNoteText\(/g) ?? []).toHaveLength(1)
    expect(source.match(/setDurationInput\(/g) ?? []).toHaveLength(1)
    expect(source).toMatch(/noteEpochRef\.current \+= 1\s*\n\s*setNoteText\(value\)/)
    expect(source).toMatch(/durationEpochRef\.current \+= 1\s*\n\s*setDurationInput\(value\)/)
  })
})
