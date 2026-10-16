/**
 * Capture draft protection, against the REAL media surfaces (G1/G2).
 *
 * `UnifiedCaptureCard.draftProtection.test` stubs `PhotoCapture` and
 * `AudioRecorder` so the card's own rule is what is under test. That stub cannot
 * see the thing those components actually do: they hold a draft of their own —
 * photos in a staging tray, a recorded take — that the card has no field for,
 * and they hold the card's commit callback across an `await` (compression,
 * `getUserMedia`). The real `PhotoCapture` also permits staging while an upload
 * is in flight, so the newer draft is a real one, not a hypothetical.
 *
 * So these mount the real components and check the two ends of the seam:
 *
 *   • an ordinary staged photo nobody touched still commits and still clears
 *     (the positive control — the `onDraftChange` notification must not make
 *     every media save look edited);
 *   • a photo staged DURING an upload survives the upload's completion, tray,
 *     tab and parent fields intact;
 *   • an uploaded audio file still clears the form;
 *   • `onDraftChange` reaches the host BEFORE the microphone is awaited.
 *
 * Synthetic services only: Firestore, the uploader and image compression are
 * local stubs, and the compression stub parks its resolver so a shot can be held
 * mid-flight.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AudioRecorder from '../../components/AudioRecorder'
import UnifiedCaptureCard from './UnifiedCaptureCard'
import type { Child } from '../../core/types'

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

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async (col: { __key: string }, data: Record<string, unknown>) => {
    addDocCalls.push({ collectionKey: col.__key, data })
    if (gate) await gate
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

// Controllable compression, as in `PhotoCapture.staging.test`: each call parks a
// resolver so a shot can be held between the tap and the staging tray.
const compressResolvers: Array<(b: Blob) => void> = []
vi.mock('../../core/utils/compressImage', () => ({
  compressIfNeeded: vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        compressResolvers.push(resolve)
      }),
  ),
}))

/** `compressToJpeg` awaits a dynamic import first, so wait for the resolver. */
async function resolveNextCompression() {
  await waitFor(() => expect(compressResolvers.length).toBeGreaterThan(0))
  compressResolvers.shift()?.(new Blob(['x'], { type: 'image/jpeg' }))
}

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

const DAY_A = '2026-05-17'

type CardProps = ComponentProps<typeof UnifiedCaptureCard>

function renderCard(overrides: Partial<CardProps> = {}) {
  const onSnackMessage = vi.fn()
  const props: CardProps = {
    familyId: 'fam-1',
    selectedChildId: 'lincoln',
    today: DAY_A,
    weekPlanId: 'week-1',
    selectableChildren: children,
    todayArtifacts: [],
    setTodayArtifacts: vi.fn(),
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
  return { onSnackMessage, container: view.container }
}

const nameField = () => screen.getByLabelText(/what is this\?/i) as HTMLInputElement
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const hoursWrites = () => addDocCalls.filter((c) => c.collectionKey === 'hours')
const artifactWrites = () => addDocCalls.filter((c) => c.collectionKey === 'artifacts')
const lastSnack = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as { text: string; severity: string }

/** Lego build: 45 minutes, PracticalArts. */
const tapLegoChip = () => fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))

function stageFile(input: HTMLInputElement, name: string) {
  fireEvent.change(input, {
    target: { files: [new File([name], name, { type: 'image/png' })] },
  })
}

/** The card's photo tab mounts the real staging `PhotoCapture`; first input is the camera. */
const cameraInput = (container: HTMLElement) =>
  container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement

beforeEach(() => {
  addDocCalls.length = 0
  compressResolvers.length = 0
  gate = null
  openGate = null
  let urlSeq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${urlSeq++}`),
    revokeObjectURL: vi.fn(),
  })
})

describe('UnifiedCaptureCard + real PhotoCapture — a staged photo is a draft too', () => {
  it('still commits and clears an untouched staged photo', async () => {
    const { onSnackMessage, container } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    stageFile(cameraInput(container), 'p1.png')
    await resolveNextCompression()
    fireEvent.click(await screen.findByRole('button', { name: /save 1 photo/i }))

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    // The positive control: staging notified the card of a draft change, and
    // the ordinary save that follows it must still own that draft.
    await waitFor(() => expect(minutesField().value).toBe(''))
    expect(nameField().value).toBe('')
    expect(screen.getByLabelText(/^note \(optional\)$/i)).toBeInTheDocument()
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })

  it('keeps a photo staged while the previous batch was uploading', async () => {
    const { onSnackMessage, container } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    stageFile(cameraInput(container), 'p1.png')
    await resolveNextCompression()

    holdWrites()
    fireEvent.click(await screen.findByRole('button', { name: /save 1 photo/i }))
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))

    // The real surface lets a shot be taken while the batch uploads. This one
    // is a NEW draft, and the card can only know through `onDraftChange`.
    stageFile(cameraInput(container), 'p2.png')
    await resolveNextCompression()
    await screen.findByAltText('Staged photo 1')

    releaseWrites()
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))

    // The completion must not clear: clearing resets the tab, which unmounts
    // this surface and takes the second photo with it.
    expect(screen.getByAltText('Staged photo 1')).toBeInTheDocument()
    // The tray's own Save comes back out of `Uploading...` once the latch is
    // released — the second photo is committable, not stranded.
    expect(await screen.findByRole('button', { name: /save 1 photo/i })).toBeEnabled()
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')
    expect(lastSnack(onSnackMessage).text).toContain('Your newer edits are still here')

    // The batch that saved is the one submitted: one artifact, one file.
    expect(artifactWrites()).toHaveLength(1)
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 45, date: DAY_A, childId: 'lincoln' })
  })
})

describe('UnifiedCaptureCard + real AudioRecorder', () => {
  it('clears the form after an uploaded audio file nobody edited', async () => {
    const { onSnackMessage, container } = renderCard()
    tapLegoChip()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))

    const audioInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement
    fireEvent.change(audioInput, {
      target: { files: [new File(['a'], 'take.webm', { type: 'audio/webm' })] },
    })

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    await waitFor(() => expect(minutesField().value).toBe(''))
    expect(nameField().value).toBe('')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })
})

describe('AudioRecorder — the draft notification beats the microphone', () => {
  it('tells the host a new draft exists before `getUserMedia` settles', () => {
    const onDraftChange = vi.fn()
    // A permission prompt that never answers: the notification must already
    // have happened, since a host save could finish while it hangs.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => new Promise(() => {})) },
      configurable: true,
    })

    render(<AudioRecorder onCapture={vi.fn()} onDraftChange={onDraftChange} />)
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))

    expect(onDraftChange).toHaveBeenCalledTimes(1)
  })

  it('works unchanged for a host that passes no notification', () => {
    const onCapture = vi.fn()
    const { container } = render(<AudioRecorder onCapture={onCapture} allowUpload />)
    const audioInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement
    fireEvent.change(audioInput, {
      target: { files: [new File(['a'], 'take.webm', { type: 'audio/webm' })] },
    })
    expect(onCapture).toHaveBeenCalledTimes(1)
  })
})
