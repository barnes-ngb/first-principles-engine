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
 * What these tests hold (unchanged properties, read against the FIX-267 form):
 *
 *   • a save whose draft is untouched still clears the form and still shows the
 *     receipt the card gives (the positive control: a card that never clears
 *     cannot pass);
 *   • a draft edited while the save was in flight keeps EVERY field — same day,
 *     text typed away and typed back, media included;
 *   • a scope change — child or day, by the shell or by this card's own picker,
 *     including day A → day B → day A — keeps the draft too;
 *   • the receipt names the capture that actually saved (whose, and which day)
 *     whenever the editor has moved on, success or failure;
 *   • what the fix must NOT change: one write per tap, the payloads and minutes
 *     of the capture as submitted, the latch released on every exit.
 *
 * Two adaptations, both deliberate and asserted elsewhere rather than dropped:
 * the receipt wording is the *Log work* form's (`logWorkDraft.test`), and the
 * card's second photo door is gone, so the dialog-identity describe went with
 * it — the stale-callback property it protected is covered here by the staged
 * media cases and in `.draftProtectionMedia.test` against the real component.
 *
 * Synthetic services only: the Firestore writers, the uploader and the two
 * media surfaces are local stubs.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

interface WriteCall {
  collectionKey: string
  id: string
  data: Record<string, unknown>
}
const writes: WriteCall[] = []
let generated = 0

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
    // The kid card's lane, kept so this file can render either variant.
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
 * Stages through the host's own seam, which is what the real component does in
 * direct-staging mode. `onCaptureBatch` is kept for the kid card's single
 * `onCapture` path and for the legacy shape.
 */
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onStageFiles,
    onCapture,
    onDraftChange,
    uploading,
  }: {
    onStageFiles?: (files: File[]) => void
    onCapture?: (file: File) => void
    onDraftChange?: () => void
    uploading?: boolean
  }) => (
    <div data-testid="photo-capture" data-uploading={uploading ? 'yes' : 'no'}>
      <button
        data-testid="stage-photo"
        onClick={() => {
          onDraftChange?.()
          if (onStageFiles) onStageFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
          else onCapture?.(new File(['a'], 'a.jpg', { type: 'image/jpeg' }))
        }}
      >
        choose a photo
      </button>
    </div>
  ),
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
        data-testid="stage-audio"
        onClick={() => {
          onDraftChange?.()
          onCapture(new Blob(['a'], { type: 'audio/webm' }))
        }}
      >
        finish a take
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

const saveButton = () => screen.getByRole('button', { name: /^save work$/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i) as HTMLTextAreaElement
const nameField = () => screen.getByLabelText(/what is this\?/i) as HTMLInputElement
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const artifactWrites = () => writes.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => writes.filter((c) => c.collectionKey === 'hours')
const unfinished = () => screen.getByTestId('log-work-unfinished')
const lastSnack = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as { text: string; severity: string }

/** Lego build: 45 minutes, PracticalArts — behind the folded quick fill. */
const tapLegoChip = () => {
  fireEvent.click(screen.getByRole('button', { name: /quick fill/i }))
  fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
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

describe('Log work — a completion clears only its own draft (G1)', () => {
  it('clears the form and gives the usual receipt when the draft is untouched', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))

    // The positive control for every preserve test below: this is the save that
    // still clears.
    await waitFor(() => expect(noteField().value).toBe(''))
    expect(nameField().value).toBe('')
    expect(minutesField().value).toBe('')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note — 45 min logged',
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
        'Saved your note — 45 min logged — that earlier capture saved. ' +
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

describe('Log work — a scope change ends the draft’s visit (G2)', () => {
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
      text: `Saved your note — 45 min logged — saved for Lincoln on ${DAY_A}. What is on screen now is untouched.`,
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
    // text" reasoning cleared it. The parent has been somewhere and come back.
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
    // leaves `childId` exactly where it is: ONLY `selectedChildId` moves.
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
      text: 'Saved your note — 45 min logged',
      severity: 'success',
    })
  })
})

describe('Log work — the media in the draft owns it too', () => {
  it('keeps a draft edited while a photo save was in flight', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-photo'))

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.change(nameField(), { target: { value: 'Lego build and paint' } })
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(nameField().value).toBe('Lego build and paint')
    expect(minutesField().value).toBe('45')
    // The artifact kept the title the save was submitted with.
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      title: 'Lego build',
      activityName: 'Lego build',
    })
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
  })

  it('clears the form after an untouched photo save', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-photo'))
    fireEvent.click(saveButton())

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    await waitFor(() => expect(nameField().value).toBe(''))
    expect(minutesField().value).toBe('')
    // The photo that saved is out of the tray, so it cannot be filed twice.
    expect(screen.queryByAltText('Attached photo 1')).toBeNull()
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved 1 photo — 45 min logged',
      severity: 'success',
    })
  })

  it('keeps the draft when the day moved on during an audio save', async () => {
    const { onSnackMessage, rerenderWith } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.click(screen.getByTestId('stage-audio'))

    holdWrites()
    fireEvent.click(saveButton())
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

  it('a staged photo added mid-save is a newer draft, and survives the completion', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-photo'))

    holdWrites()
    fireEvent.click(saveButton())
    // A second photo chosen while the first is uploading: a new draft the card
    // hears about through the same seam.
    fireEvent.click(screen.getByTestId('stage-photo'))
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // Only the submitted photo left the tray; the newer one is still there.
    expect(screen.getByText('1 photo attached — not saved yet.')).toBeInTheDocument()
    expect(nameField().value).toBe('Lego build')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
    expect(artifactWrites()).toHaveLength(1)
  })

  it('keeps the draft when only the attachment KIND changed during a save', async () => {
    const { onSnackMessage } = renderCard()
    tapLegoChip()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })

    holdWrites()
    fireEvent.click(saveButton())
    // Nothing is staged, so switching kind asks nothing and simply moves — and
    // moving unmounts the surface the parent had open, which a completion that
    // cleared here would do to her a second time.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
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
    // The take is handed straight to the card, so it is a newer draft the
    // completion must not clear over.
    fireEvent.click(screen.getByTestId('stage-audio'))
    releaseWrites()

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(screen.getByText('Recording attached — not saved yet.')).toBeInTheDocument()
    expect(nameField().value).toBe('Lego build')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')
    // The save that landed is the note it was submitted with, not the take.
    expect(artifactWrites()).toHaveLength(1)
    expect(artifactWrites()[0].data).toMatchObject({ type: EvidenceType.Note })
  })

  it('an empty draft cannot be saved at all, so nothing is written or cleared', () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(nameField(), { target: { value: 'Lego build' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    // No photo chosen and nothing else filled: a name on its own is not a log.
    expect(saveButton()).toBeDisabled()
    expect(writes).toHaveLength(0)
    expect(onSnackMessage).not.toHaveBeenCalled()
    expect(nameField().value).toBe('Lego build')
  })

  it('keeps the kid’s chip and minutes when the shell switched child mid-save', async () => {
    const { onSnackMessage, rerenderWith } = renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))

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

describe('Log work — the latch and the failure paths still hold (FIX-262)', () => {
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

  it('keeps the draft on a failure, says what is unconfirmed, and finishes on retry', async () => {
    failing = new Set(['artifacts'])
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Read two chapters' } })

    holdWrites()
    fireEvent.click(saveButton())
    fireEvent.change(noteField(), { target: { value: 'Read two chapters and a poem' } })
    releaseWrites()

    await waitFor(() => expect(onSnackMessage).toHaveBeenCalled())
    // A stale error must not read as a verdict on what is in front of her, and
    // an unanswered write is never reported as a write that did not happen.
    expect(lastSnack(onSnackMessage)).toEqual({
      text:
        'Couldn’t confirm your note saved. That was the capture you submitted earlier; ' +
        'your newer edits are still here.',
      severity: 'error',
    })
    expect(noteField().value).toBe('Read two chapters and a poem')
    expect(hoursWrites()).toHaveLength(0)

    // The latch is released and the retry goes to the SAME document, so the
    // newer edits are not what gets filed and nothing is written twice.
    failing = new Set()
    fireEvent.click(within(unfinished()).getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(artifactWrites()).toHaveLength(2))
    expect(new Set(artifactWrites().map((w) => w.id)).size).toBe(1)
    expect(artifactWrites()[1].data).toMatchObject({ content: 'Read two chapters' })
    // Her newer draft is hers: the retry did not clear it.
    expect(noteField().value).toBe('Read two chapters and a poem')
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
      text: `Couldn’t confirm your note saved. That was Lincoln's capture for ${DAY_A}; what is on screen now is untouched.`,
      severity: 'error',
    })
    expect(noteField().value).toBe('Day A note')
    // And the panel still names the identity it belongs to.
    expect(unfinished()).toHaveTextContent('Lincoln')
  })

  it('does not say a capture saved when only the hours were attempted', async () => {
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
        'Couldn’t confirm the 45 minutes saved. That was the capture you submitted ' +
        'earlier; your newer edits are still here.',
      severity: 'error',
    })
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
        'Your note saved. Couldn’t confirm the 45 minutes saved. ' +
        `That was Lincoln's capture for ${DAY_A}; what is on screen now is untouched.`,
      severity: 'error',
    })
    // The note DID save; the suffix names the attempt without adding a claim.
    expect(artifactWrites()).toHaveLength(1)
    expect(noteField().value).toBe('Built a tower')
  })

  it('gives the plain sentence when nothing moved', async () => {
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
