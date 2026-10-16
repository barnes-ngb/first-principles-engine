/**
 * Capture draft protection (G1/G2) — a finished save clears only the draft it
 * was started from, and never says a draft saved that did not.
 *
 * The FIX-262 latch made the card one-save-at-a-time; it did not make the form
 * that save came from still be there when the write landed. Every completion
 * path called `resetForm()` unconditionally, so a 19-minute note written for day
 * A and landing seconds later wiped the 41-minute note already typed for day B —
 * and toasted *"Captured + 19 min logged"* over it, so the erased draft read as
 * saved.
 *
 * What these tests hold:
 *
 *   • a save whose draft is untouched still clears the form and still shows the
 *     exact receipt this card always showed (the positive control: a card that
 *     never clears cannot pass);
 *   • a draft edited while the save was in flight keeps EVERY field — same day,
 *     text typed away and typed back, media pathways included;
 *   • a scope change — child or day, by the shell or by this card's own picker,
 *     including day A → day B → day A — keeps the draft too;
 *   • the receipt names the capture that actually saved (whose, and which day)
 *     whenever the editor has moved on, success or failure;
 *   • the photo dialog is closed only by the opening that is on screen — a
 *     callback kept from an earlier one closes nothing and writes nothing;
 *   • what the fix must NOT change: one write per tap, the payloads and minutes
 *     of the capture as submitted, the latch released on every exit.
 *
 * Regression sensitivity. Against the production code at 7a158f8 — an
 * unconditional `resetForm()` — every preserve test fails on the first field it
 * reads (the note, the activity name or the minutes come back empty) and every
 * contextual-receipt test fails on the toast text. The clear-and-receipt test
 * and the one-write tests fail against a card that simply stopped clearing or
 * stopped writing, so the suite cannot be passed by doing nothing.
 *
 * Synthetic services only: the Firestore writers, the uploader and the two
 * media surfaces are local stubs, as in `UnifiedCaptureCard.pendingSave.test`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from './UnifiedCaptureCard'
import {
  captureErrorText,
  captureSuccessText,
  captureUnsavedText,
  classifyDraftClaim,
  type CaptureDraftClaim,
} from './captureDraftOwnership'
import type { Child } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'

type AddDocCall = { collectionKey: string; data: Record<string, unknown> }
const addDocCalls: AddDocCall[] = []

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
 * Every distinct `onCaptureBatch` the card has handed down, newest last — so a
 * test can keep the callback from an EARLIER render and invoke it after the
 * editor moved, which is what a real `PhotoCapture` does across its compression
 * `await`. Recorded in render order; the real component's own staging is
 * exercised against the real one in `.draftProtectionMedia.test`.
 */
const photoBatchCallbacks: Array<(files: File[]) => void> = []

/** Reports `uploading` rather than refusing the tap, so the card is what is tested. */
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onCaptureBatch,
    onDraftChange,
    uploading,
  }: {
    onCaptureBatch?: (files: File[]) => void
    onDraftChange?: () => void
    uploading?: boolean
  }) => {
    if (onCaptureBatch && photoBatchCallbacks[photoBatchCallbacks.length - 1] !== onCaptureBatch) {
      photoBatchCallbacks.push(onCaptureBatch)
    }
    return (
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
        {/* A photo staged inside the surface: a draft change the card cannot see
            on its own fields, announced through the seam. */}
        <button data-testid="stage-photo" onClick={() => onDraftChange?.()}>
          stage a photo
        </button>
      </div>
    )
  },
}))

vi.mock('../../components/AudioRecorder', () => ({
  default: ({
    onCapture,
    onDraftChange,
    uploading,
  }: {
    onCapture: (f: Blob) => void
    onDraftChange?: () => void
    uploading?: boolean
  }) => (
    <div data-testid="audio-recorder" data-uploading={uploading ? 'yes' : 'no'}>
      <button
        data-testid="commit-audio"
        onClick={() => onCapture(new Blob(['a'], { type: 'audio/webm' }))}
      >
        commit audio
      </button>
      <button data-testid="start-recording" onClick={() => onDraftChange?.()}>
        start recording
      </button>
    </div>
  ),
}))

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

const DAY_A = '2026-05-17'
const DAY_B = '2026-05-18'

type CardProps = ComponentProps<typeof UnifiedCaptureCard>

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
    variant: 'parent',
    activeChild: children[0],
    ...overrides,
  }
  const view = render(
    <MemoryRouter>
      <UnifiedCaptureCard {...props} />
    </MemoryRouter>,
  )
  /** The shell re-pointing the card at another child or day, with no remount. */
  const rerenderWith = (next: Partial<CardProps>) =>
    view.rerender(
      <MemoryRouter>
        <UnifiedCaptureCard {...props} {...next} />
      </MemoryRouter>,
    )
  return { onSnackMessage, setTodayArtifacts, rerenderWith }
}

const saveButton = () => screen.getByRole('button', { name: /save capture/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i) as HTMLTextAreaElement
const nameField = () => screen.getByLabelText(/what is this\?/i) as HTMLInputElement
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const artifactWrites = () => addDocCalls.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => addDocCalls.filter((c) => c.collectionKey === 'hours')
const lastSnack = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as { text: string; severity: string }

/** Lego build: 45 minutes, PracticalArts — the chip the pendingSave tests use. */
const tapLegoChip = () => fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))

beforeEach(() => {
  addDocCalls.length = 0
  failing = new Set()
  gate = null
  openGate = null
  photoBatchCallbacks.length = 0
})

describe('UnifiedCaptureCard — a completion clears only its own draft (G1)', () => {
  it('clears the form and gives the usual receipt when the draft is untouched', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))

    // The positive control for every preserve test below: this is the save that
    // still clears, with the sentence this card always showed.
    await waitFor(() => expect(noteField().value).toBe(''))
    expect(nameField().value).toBe('')
    expect(minutesField().value).toBe('')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })

  it('keeps a same-day draft edited while the save was in flight, and says so', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    // The parent carries on typing on the same day — these are HER edits, not
    // the capture that is saving.
    fireEvent.change(noteField(), { target: { value: 'Built a tower and a bridge' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('Built a tower and a bridge')
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage)).toEqual({
      text:
        'Captured + 45 min logged — that earlier capture saved. ' +
        'Your newer edits are still here, not saved yet.',
      severity: 'success',
    })

    // The capture that DID save is the one submitted, unchanged.
    expect(artifactWrites()).toHaveLength(1)
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Note,
      content: 'Built a tower',
      activityName: 'Lego build',
      childId: 'lincoln',
      dayLogId: DAY_A,
    })
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 45, date: DAY_A, childId: 'lincoln' })
  })

  it('counts typing a word away and typing it back as a new draft', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.change(noteField(), { target: { value: 'Built a towe' } })
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // Identical text, deliberately touched after submitting: the parent's note
    // is left where she put it rather than cleared on a text comparison.
    expect(noteField().value).toBe('Built a tower')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
  })

  it('keeps the minutes a parent corrected while the save was in flight', async () => {
    renderCard()
    tapLegoChip()

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.change(minutesField(), { target: { value: '60' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // The write kept the 45 minutes as submitted; the form kept the 60 typed.
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 45 })
    expect(minutesField().value).toBe('60')
    expect(nameField().value).toBe('Lego build')
  })
})

describe('UnifiedCaptureCard — a scope change ends the draft’s visit (G2)', () => {
  it('keeps the draft when the day moved on, and names the day that saved', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Day A note' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ today: DAY_B })
    fireEvent.change(noteField(), { target: { value: 'Day B note' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('Day B note')
    expect(lastSnack(onSnackMessage)).toEqual({
      text: `Captured + 45 min logged — saved for Lincoln on ${DAY_A}. What is on screen now is untouched.`,
      severity: 'success',
    })
    // Attribution unchanged: the capture belongs to the day it was written for.
    expect(artifactWrites()[0].data).toMatchObject({ dayLogId: DAY_A, content: 'Day A note' })
    expect(hoursWrites()[0].data).toMatchObject({ date: DAY_A, minutes: 45 })
  })

  it('treats day A → day B → day A as a new visit, not the old one restored', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Day A note' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ today: DAY_B })
    rerenderWith({ today: DAY_A })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // Nothing was typed on the round trip, so the old code's "same day, same
    // text" reasoning cleared it. The parent has been somewhere and come back:
    // what is on screen is no longer the thing she submitted.
    expect(noteField().value).toBe('Day A note')
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain(`saved for Lincoln on ${DAY_A}`)
  })

  it('keeps the draft when the shell switched child', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Lincoln’s tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ selectedChildId: 'london', activeChild: children[1] })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('Lincoln’s tower')
    // A built-in chip is valid for every child and survives the switch, so the
    // minutes it filled are still on screen too.
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain(`saved for Lincoln on ${DAY_A}`)
    expect(hoursWrites()[0].data).toMatchObject({ childId: 'lincoln', minutes: 45 })
  })

  it('keeps the draft when the card’s own child picker switched child', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Lincoln’s tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /child/i }))
    fireEvent.click(screen.getByRole('option', { name: 'London' }))
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('Lincoln’s tower')
    expect(lastSnack(onSnackMessage).text).toContain('saved for Lincoln')
    expect(hoursWrites()[0].data).toMatchObject({ childId: 'lincoln' })
  })

  it('keeps the draft when the family switched', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ familyId: 'fam-2' })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('Built a tower')
    expect(lastSnack(onSnackMessage).text).toContain(`saved for Lincoln on ${DAY_A}`)
  })

  it('counts the shell re-pointing at the child the picker already holds', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    // The parent moved the card itself to London first, so the shell's catch-up
    // leaves `childId` exactly where it is: ONLY `selectedChildId` moves, and
    // the card's own sync of it is an effect, a render behind the prop.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /child/i }))
    fireEvent.click(screen.getByRole('option', { name: 'London' }))
    fireEvent.change(noteField(), { target: { value: 'London’s tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ selectedChildId: 'london', activeChild: children[1] })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(noteField().value).toBe('London’s tower')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain(`saved for London on ${DAY_A}`)
    expect(hoursWrites()[0].data).toMatchObject({ childId: 'london', minutes: 45 })
  })

  it('still clears when the day re-renders with the same scope', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    // A re-render that changes nothing about the scope is not a visit: this is
    // the ordinary case and it must still clear.
    rerenderWith({ todayArtifacts: [] })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    await waitFor(() => expect(noteField().value).toBe(''))
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })
})

describe('UnifiedCaptureCard — the media pathways own their draft too', () => {
  it('keeps a draft edited while a photo upload was in flight', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    holdWrites()
    fireEvent.click(screen.getByTestId('commit-batch'))
    // The note field is not on the photo tab; the activity name is the draft
    // field every pathway shares.
    fireEvent.change(nameField(), { target: { value: 'Lego build and paint' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(nameField().value).toBe('Lego build and paint')
    expect(minutesField().value).toBe('45')
    // The artifact kept the title the batch was committed with.
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      title: 'Lego build',
      activityName: 'Lego build',
    })
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
  })

  it('clears the form after an untouched photo capture', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    fireEvent.click(screen.getByTestId('commit-batch'))
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))

    await waitFor(() => expect(nameField().value).toBe(''))
    expect(minutesField().value).toBe('')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })

  it('keeps the draft when the day moved on during an audio upload', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))

    holdWrites()
    fireEvent.click(screen.getByTestId('commit-audio'))
    rerenderWith({ today: DAY_B })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Audio,
      dayLogId: DAY_A,
    })
    expect(lastSnack(onSnackMessage).text).toContain(`saved for Lincoln on ${DAY_A}`)
  })

  it('a cancelled photo batch writes nothing and clears nothing', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(nameField(), { target: { value: 'Lego build' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    fireEvent.click(screen.getByTestId('commit-empty-batch'))

    expect(addDocCalls).toHaveLength(0)
    expect(onSnackMessage).not.toHaveBeenCalled()
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
  })

  it('keeps the draft when only the media TAB changed — no field was touched', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    // The only thing that moved is the tab — and `resetForm` resets the tab,
    // so a completion that cleared here would throw the parent off the photo
    // surface she had just opened and unmount whatever it holds.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(screen.getByTestId('photo-capture')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^note \(optional\)$/i)).not.toBeInTheDocument()
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
  })

  it('keeps the draft when only the photo surface’s own staged draft changed', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    holdWrites()
    fireEvent.click(screen.getByTestId('commit-batch'))
    // Staging another shot while the first batch uploads — the real surface
    // allows it. No card field changed, so only the `onDraftChange` seam can
    // tell the card a newer draft exists.
    fireEvent.click(screen.getByTestId('stage-photo'))
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(screen.getByTestId('photo-capture')).toBeInTheDocument()
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
  })

  it('keeps the draft when a recording was started while a save was in flight', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.click(screen.getByTestId('start-recording'))
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(screen.getByTestId('audio-recorder')).toBeInTheDocument()
    expect(nameField().value).toBe('Lego build')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
  })

  it('a media callback kept from an earlier render saves its own capture and clears nothing', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    // What `PhotoCapture` is holding while it compresses: the commit callback
    // as of THIS render. Everything below happens before it is invoked.
    const staleCommit = photoBatchCallbacks[photoBatchCallbacks.length - 1]
    rerenderWith({ today: DAY_B })
    fireEvent.change(nameField(), { target: { value: 'Day B painting' } })

    await act(async () => {
      staleCommit([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
    })
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))

    // The capture is the one the shot was taken for — day A, with the title and
    // minutes it was started with.
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      dayLogId: DAY_A,
      title: 'Lego build',
    })
    expect(hoursWrites()[0].data).toMatchObject({ date: DAY_A, minutes: 45 })
    // And the draft in front of the parent is untouched: a claim read from the
    // refs at invocation time would have called this its own and cleared it.
    expect(nameField().value).toBe('Day B painting')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain(`saved for Lincoln on ${DAY_A}`)
  })

  it('keeps the kid’s chip and minutes when the shell switched child mid-save', async () => {
    const { onSnackMessage, rerenderWith } = renderCard({ variant: 'kid' })
    tapLegoChip()

    holdWrites()
    fireEvent.click(screen.getByRole('button', { name: /save my time/i }))
    rerenderWith({ variant: 'kid', selectedChildId: 'london', activeChild: children[1] })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(screen.getByTestId('kid-duration-display')).toHaveTextContent('45')
    expect(hoursWrites()[0].data).toMatchObject({ childId: 'lincoln', minutes: 45 })
    expect(lastSnack(onSnackMessage)).toEqual({
      text: `Logged 45 min — saved for Lincoln on ${DAY_A}. What is on screen now is untouched.`,
      severity: 'success',
    })
  })
})

describe('UnifiedCaptureCard — the photo dialog is closed only by its own opening', () => {
  const openDialog = () =>
    fireEvent.click(screen.getByRole('button', { name: /add photos of today's work/i }))
  const dialogBody = () => screen.queryByText(/snap or upload several photos/i)

  /**
   * MUI's exit transition starts after the close event is flushed, so the two
   * must be awaited separately: doing both inside one `act` lets the dialog
   * look gone while it is still mounted, and a stale-callback test would pass
   * for the wrong reason.
   */
  async function closeDialogWithEscape() {
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    await waitFor(() => expect(dialogBody()).not.toBeInTheDocument())
  }

  it('an old opening’s callback cannot close the dialog reopened after it', async () => {
    const { onSnackMessage } = renderCard()
    openDialog()
    await screen.findByRole('dialog')

    // What the first opening handed out, kept past its own life.
    const staleCommit = photoBatchCallbacks[photoBatchCallbacks.length - 1]
    await closeDialogWithEscape()

    openDialog()
    await screen.findByRole('dialog')
    await act(async () => {
      staleCommit([])
    })

    // The parent's new dialog is still there: closing it was never this
    // callback's to do.
    expect(dialogBody()).toBeInTheDocument()
    expect(addDocCalls).toHaveLength(0)
    expect(onSnackMessage).not.toHaveBeenCalled()
  })

  it('an old opening’s callback writes nothing and closes nothing after the day moved', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    openDialog()
    await screen.findByRole('dialog')

    const staleCommit = photoBatchCallbacks[photoBatchCallbacks.length - 1]
    await closeDialogWithEscape()
    rerenderWith({ today: DAY_B })

    openDialog()
    await screen.findByRole('dialog')
    await act(async () => {
      staleCommit([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
    })

    expect(dialogBody()).toBeInTheDocument()
    // A retired opening is not a capture in flight: it has no photos of its
    // own any more, so it writes nothing rather than filing a second entry.
    expect(addDocCalls).toHaveLength(0)
    expect(onSnackMessage).not.toHaveBeenCalled()
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
  })

  it('the CURRENT opening still commits, closes itself and clears the form', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    openDialog()
    await screen.findByRole('dialog')

    // The positive control: a dialog opening owns nothing less than it did
    // before, and opening one is not an edit that makes the capture stale.
    fireEvent.click(screen.getByTestId('commit-batch'))
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    await waitFor(() => expect(dialogBody()).not.toBeInTheDocument())

    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      dayLogId: DAY_A,
      title: 'Lego build',
    })
    await waitFor(() => expect(nameField().value).toBe(''))
    expect(minutesField().value).toBe('')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })
})

describe('UnifiedCaptureCard — the latch and the failure paths still hold (FIX-262)', () => {
  it('writes once however many taps, with the draft guard in place', async () => {
    renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    await act(async () => {
      const button = saveButton()
      button.click()
      button.click()
      button.click()
    })
    expect(artifactWrites()).toHaveLength(1)

    releaseWrites()
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(1)
  })

  it('releases the latch on failure, keeps the draft, and names what failed', async () => {
    failing = new Set(['artifacts'])
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Read two chapters' } })

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.change(noteField(), { target: { value: 'Read two chapters and a poem' } })
    releaseWrites()

    await waitFor(() => expect(onSnackMessage).toHaveBeenCalled())
    // A stale error must not read as a verdict on what is in front of her.
    expect(lastSnack(onSnackMessage)).toEqual({
      text:
        'Failed to save note. That was the capture you submitted earlier; ' +
        'your newer edits are still here.',
      severity: 'error',
    })
    expect(noteField().value).toBe('Read two chapters and a poem')
    expect(hoursWrites()).toHaveLength(0)

    // Latch released: the retry writes.
    failing = new Set()
    await waitFor(() => expect(saveButton()).not.toBeDisabled())
    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))
    expect(artifactWrites()[1].data).toMatchObject({ content: 'Read two chapters and a poem' })
  })

  it('names the child and day on a failure the editor has moved past', async () => {
    failing = new Set(['artifacts'])
    const { onSnackMessage, rerenderWith } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Day A note' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ today: DAY_B })
    releaseWrites()

    await waitFor(() => expect(onSnackMessage).toHaveBeenCalled())
    expect(lastSnack(onSnackMessage)).toEqual({
      text: `Failed to save note. That was Lincoln's capture for ${DAY_A}; what is on screen now is untouched.`,
      severity: 'error',
    })
    expect(noteField().value).toBe('Day A note')
  })

  it('does not say a capture saved when only the hours were attempted and failed', async () => {
    failing = new Set(['hours'])
    const { onSnackMessage } = renderCard()
    // Minutes only: nothing but the hours write is attempted, and it refuses.
    tapLegoChip()

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.change(minutesField(), { target: { value: '60' } })
    releaseWrites()

    await waitFor(() => expect(onSnackMessage).toHaveBeenCalled())
    expect(lastSnack(onSnackMessage)).toEqual({
      text:
        "Couldn't log hours — try again from Records — that was the capture you " +
        'submitted earlier; your newer edits are still here.',
      severity: 'error',
    })
    // Nothing was written, so no wording here may claim a save.
    expect(lastSnack(onSnackMessage).text).not.toContain('capture saved')
    expect(minutesField().value).toBe('60')
    expect(nameField().value).toBe('Lego build')
  })

  it('does not imply the hours saved when the evidence landed and they did not', async () => {
    failing = new Set(['hours'])
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    rerenderWith({ today: DAY_B })
    releaseWrites()

    await waitFor(() => expect(onSnackMessage).toHaveBeenCalled())
    expect(lastSnack(onSnackMessage)).toEqual({
      text:
        "Captured (couldn't log hours — try again from Records) — that was Lincoln's " +
        `capture for ${DAY_A}; what is on screen now is untouched.`,
      severity: 'error',
    })
    // The note DID save; the suffix names the attempt without adding a claim.
    expect(artifactWrites()).toHaveLength(1)
    expect(noteField().value).toBe('Built a tower')
  })

  it('gives the plain error sentence when nothing moved', async () => {
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
    expect(noteField().value).toBe('Read two chapters')
  })
})

describe('captureDraftOwnership — the rule and its wording', () => {
  const claim: CaptureDraftClaim = {
    visit: 2,
    revision: 7,
    childName: 'Lincoln',
    day: DAY_A,
  }

  it('reads identity, and reports scope ahead of content', () => {
    expect(classifyDraftClaim(claim, { visit: 2, revision: 7 })).toBe('owned')
    expect(classifyDraftClaim(claim, { visit: 2, revision: 8 })).toBe('draft-changed')
    expect(classifyDraftClaim(claim, { visit: 3, revision: 7 })).toBe('scope-changed')
    // Both moved: the scope is the bigger statement about where she is.
    expect(classifyDraftClaim(claim, { visit: 3, revision: 9 })).toBe('scope-changed')
  })

  it('leaves the owned receipt exactly as it was', () => {
    expect(captureSuccessText('Captured', 'owned', claim)).toBe('Captured')
    expect(captureErrorText('Photo upload failed.', 'owned', claim)).toBe('Photo upload failed.')
    expect(captureUnsavedText("Couldn't log hours", 'owned', claim)).toBe("Couldn't log hours")
  })

  it('never says a capture saved over a completion that failed', () => {
    for (const verdict of ['owned', 'draft-changed', 'scope-changed'] as const) {
      expect(captureUnsavedText("Couldn't log hours", verdict, claim)).not.toContain(
        'capture saved',
      )
    }
    expect(captureUnsavedText("Couldn't log hours", 'draft-changed', claim)).toBe(
      "Couldn't log hours — that was the capture you submitted earlier; your newer edits are still here.",
    )
    expect(captureUnsavedText("Couldn't log hours", 'scope-changed', claim)).toBe(
      `Couldn't log hours — that was Lincoln's capture for ${DAY_A}; what is on screen now is untouched.`,
    )
  })

  it('names the capture that saved when the editor moved on', () => {
    expect(captureSuccessText('Logged 45 min', 'scope-changed', claim)).toBe(
      `Logged 45 min — saved for Lincoln on ${DAY_A}. What is on screen now is untouched.`,
    )
    expect(captureSuccessText('Captured', 'draft-changed', claim)).toBe(
      'Captured — that earlier capture saved. Your newer edits are still here, not saved yet.',
    )
  })
})
