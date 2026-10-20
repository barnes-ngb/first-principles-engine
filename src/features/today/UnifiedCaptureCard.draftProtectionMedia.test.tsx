/**
 * *Log work* against the REAL shared media components (FIX-267).
 *
 * The mocked suites assert the card's own rules; they cannot see the thing that
 * actually broke in a browser, which is the state the CHILD component holds.
 * Independent Chrome exploration found two defects neither a stub nor the
 * card's own unit tests could reach:
 *
 *   • a photo chosen but not yet *attached* stayed inside `PhotoCapture`, so
 *     the main *Save work* wrote the log without it — and a child switch left
 *     that same selection mounted for the NEW child to attach;
 *   • a recording stopped but not yet *attached* was the same shape, with a
 *     `MediaRecorder.onstop` that could fire after the switch.
 *
 * The repair is one tray: both components are mounted in their opt-in
 * direct-staging mode, keyed on the scope, and their late callbacks carry the
 * visit they were made in. So these mount the real components and check the
 * seam from both ends — including the two positive controls that matter most,
 * that a legacy caller still gets the old behaviour.
 *
 * Synthetic services only: Firestore, the uploader, image compression and the
 * microphone are local stubs, and the compression stub parks its resolver so a
 * selection can be held mid-flight.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode, type ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import LogWorkCard from './LogWorkCard'
import type { Child } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'

interface WriteCall {
  collectionKey: string
  id: string
  data: Record<string, unknown>
}
const writes: WriteCall[] = []
const uploads: string[] = []
let generated = 0

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((col: { __key: string }, id?: string) => ({
    __key: col.__key,
    id: id ?? `generated-${(generated += 1)}`,
  })),
  setDoc: vi.fn(async (ref: { __key: string; id: string }, data: Record<string, unknown>) => {
    writes.push({ collectionKey: ref.__key, id: ref.id, data })
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
  generateFilename: vi.fn((ext: string) => `stamp.${ext}`),
  uploadArtifactFile: vi.fn(
    async (_fam: string, _id: string, _file: unknown, filename: string) => {
      uploads.push(filename)
      return { downloadUrl: `https://x/${filename}` }
    },
  ),
}))

/** Controllable compression: each call parks a resolver AND a rejecter. */
const compressResolvers: Array<(b: Blob) => void> = []
const compressRejecters: Array<(e: Error) => void> = []
vi.mock('../../core/utils/compressImage', () => ({
  compressIfNeeded: vi.fn(
    () =>
      new Promise<Blob>((resolve, reject) => {
        compressResolvers.push(resolve)
        compressRejecters.push(reject)
      }),
  ),
}))

/** `compressToJpeg` awaits a dynamic import first, so wait for the resolver. */
async function resolveNextCompression() {
  await waitFor(() => expect(compressResolvers.length).toBeGreaterThan(0))
  compressRejecters.shift()
  await act(async () => {
    compressResolvers.shift()?.(new Blob(['x'], { type: 'image/jpeg' }))
  })
}

/** The processing failure a `canvas.toBlob(null)` produces in a browser. */
async function failNextCompression() {
  await waitFor(() => expect(compressRejecters.length).toBeGreaterThan(0))
  compressResolvers.shift()
  await act(async () => {
    compressRejecters.shift()?.(new Error('synthetic canvas failure'))
  })
}

// ── A microphone that answers ────────────────────────────────────────────────
const stoppedTracks: string[] = []
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  state = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  // Declared and assigned rather than a constructor parameter property, which
  // `erasableSyntaxOnly` rejects (TS1294).
  stream: { getTracks: () => { stop: () => void }[] }
  constructor(stream: { getTracks: () => { stop: () => void }[] }) {
    this.stream = stream
    FakeMediaRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['take'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

function fakeStream() {
  return {
    getTracks: () => [
      {
        stop: () => {
          stoppedTracks.push('audio')
        },
      },
    ],
  }
}

function installMicrophone() {
  FakeMediaRecorder.instances.length = 0
  stoppedTracks.length = 0
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => fakeStream()) },
  })
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder
}

/** A permission prompt the test answers by hand, as a parent would. */
function installPendingMicrophone() {
  FakeMediaRecorder.instances.length = 0
  stoppedTracks.length = 0
  let grant: (() => void) | null = null
  let deny: (() => void) | null = null
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(
        () =>
          new Promise((resolve, reject) => {
            grant = () => resolve(fakeStream())
            deny = () => reject(new Error('synthetic permission refusal'))
          }),
      ),
    },
  })
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder
  return {
    grant: async () => {
      await act(async () => {
        grant?.()
      })
    },
    deny: async () => {
      await act(async () => {
        deny?.()
      })
    },
  }
}

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

const DAY_A = '2026-10-20'

type CardProps = ComponentProps<typeof LogWorkCard>

/**
 * Rendered inside `StrictMode` by default, because the app is: StrictMode runs
 * every effect setup → cleanup → setup, and that is exactly what broke
 * recording in the browser while a non-StrictMode test suite stayed green.
 */
function renderCard(overrides: Partial<CardProps> = {}, strict = true) {
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
    activeChild: children[0],
    ...overrides,
  }
  const tree = (extra: Partial<CardProps> = {}) => {
    const card = (
      <MemoryRouter>
        <LogWorkCard {...props} {...extra} />
      </MemoryRouter>
    )
    return strict ? <StrictMode>{card}</StrictMode> : card
  }
  const view = render(tree())
  const rerenderWith = (next: Partial<CardProps>) => view.rerender(tree(next))
  return { onSnackMessage, container: view.container, rerenderWith }
}

const saveButton = () => screen.getByRole('button', { name: /^save work$/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i) as HTMLTextAreaElement
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const artifactWrites = () => writes.filter((w) => w.collectionKey === 'artifacts')
const hoursWrites = () => writes.filter((w) => w.collectionKey === 'hours')

/** The card's photo surface mounts the real component; input 0 is the camera. */
const cameraInput = (container: HTMLElement) =>
  container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement

function selectPhoto(input: HTMLInputElement, name: string) {
  fireEvent.change(input, {
    target: { files: [new File([name], name, { type: 'image/png' })] },
  })
}

beforeEach(() => {
  writes.length = 0
  uploads.length = 0
  compressResolvers.length = 0
  generated = 0
  let seq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${(seq += 1)}`),
    revokeObjectURL: vi.fn(),
  })
  installMicrophone()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Log work + real PhotoCapture — one tray, and the main Save holds it', () => {
  it('a chosen photo is in the parent draft at once, and writes nothing on its own', async () => {
    const { container } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    selectPhoto(cameraInput(container), 'p1.png')
    await resolveNextCompression()

    // In the ONE tray, with no Attach step in between.
    expect(await screen.findByText('1 photo attached — not saved yet.')).toBeInTheDocument()
    expect(screen.getByAltText('Attached photo 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save 1 photo/i })).not.toBeInTheDocument()
    // Selecting a file is not a save.
    expect(writes).toHaveLength(0)
    expect(uploads).toHaveLength(0)
  })

  it('saves the typed note AND the chosen photo on one tap', async () => {
    const { container, onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'p1.png')
    await resolveNextCompression()

    fireEvent.click(saveButton())

    await waitFor(() => expect(uploads).toHaveLength(1))
    // The defect: this used to write a Note artifact and silently drop the
    // photo that was visible on screen.
    expect(artifactWrites()).toHaveLength(1)
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      content: 'Rome day',
      childId: 'lincoln',
      dayLogId: DAY_A,
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note and 1 photo — no time logged',
      severity: 'success',
    })
  })

  it('refuses to save while a photo is still being processed, and says why', async () => {
    const { container } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'p1.png')

    // Mid-compression: the draft is incomplete, so the one Save waits rather
    // than filing the log without the photo that is arriving.
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(
      screen.getByText('Wait for the photo or recording to finish.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Processing photo…')).toBeInTheDocument()

    await resolveNextCompression()
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(screen.getByAltText('Attached photo 1')).toBeInTheDocument()
  })

  it('does not carry a chosen photo to another child, and says it was dropped', async () => {
    const { container, rerenderWith } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'p1.png')
    await resolveNextCompression()
    expect(screen.getByAltText('Attached photo 1')).toBeInTheDocument()

    rerenderWith({ selectedChildId: 'london', activeChild: children[1] })

    // Gone from the parent tray AND from the child component, which is
    // remounted on the scope key — the shape where Lincoln's photo was saved
    // under London's id.
    await waitFor(() => expect(screen.queryByAltText('Attached photo 1')).toBeNull())
    expect(
      screen.getByText(/the media attached here was removed — nothing was saved/i),
    ).toBeInTheDocument()

    fireEvent.change(noteField(), { target: { value: 'London’s own note' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Note,
      childId: 'london',
    })
    expect(uploads).toHaveLength(0)
  })

  it('a cancelled chooser changes nothing — no draft edit, no write', async () => {
    const { container } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))

    // Dismissing the file chooser fires `change` with an empty list.
    fireEvent.change(cameraInput(container), { target: { files: [] } })

    expect(compressResolvers).toHaveLength(0)
    expect(screen.queryByText(/photo attached — not saved yet/)).toBeNull()
    expect(noteField().value).toBe('Rome day')
    expect(writes).toHaveLength(0)
    expect(saveButton()).toBeEnabled()
  })

  it('a photo discarded mid-processing cannot reattach itself', async () => {
    const { container } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'p1.png')

    // Same child, same day: only the DRAFT was thrown away, which a visit
    // guard alone cannot see.
    fireEvent.click(screen.getByRole('button', { name: /discard this draft/i }))
    await resolveNextCompression()

    expect(screen.queryByText(/photo attached — not saved yet/)).toBeNull()
    expect(noteField().value).toBe('')
    expect(saveButton()).toBeDisabled()
    expect(writes).toHaveLength(0)
  })

  it('a photo still processing when Audio is chosen cannot reattach or hold the save', async () => {
    const { container } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'p1.png')

    // Nothing staged yet, so the kind change needs no confirmation.
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await resolveNextCompression()

    expect(screen.queryByAltText('Attached photo 1')).toBeNull()
    expect(screen.getByRole('button', { name: /^start recording$/i })).toBeInTheDocument()
    // The old instance's busy report may not free — or freeze — the new one.
    expect(saveButton()).toBeEnabled()
    expect(screen.queryByText('Wait for the photo or recording to finish.')).toBeNull()

    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({ type: EvidenceType.Note })
    expect(uploads).toHaveLength(0)
  })

  it('says so when a photo cannot be processed, and keeps the rest of the draft', async () => {
    const { container } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'broken.png')

    await failNextCompression()

    // Visible, named, and not a picture that simply vanished.
    const surfaceError = await screen.findByTestId('photo-processing-error')
    expect(surfaceError).toHaveTextContent('Couldn’t process broken.png')
    expect(screen.getByTestId('log-work-media-error')).toHaveTextContent(
      'broken.png couldn’t be processed',
    )
    // Busy is released and the rest of the draft is still saveable.
    expect(screen.queryByText('Processing photo…')).toBeNull()
    expect(noteField().value).toBe('Rome day')
    expect(saveButton()).toBeEnabled()

    // Both deliberate choices are offered.
    expect(within(surfaceError).getByRole('button', { name: /choose again/i })).toBeInTheDocument()
    fireEvent.click(within(surfaceError).getByRole('button', { name: /leave it out/i }))
    expect(screen.queryByTestId('photo-processing-error')).toBeNull()

    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Note,
      content: 'Rome day',
    })
    expect(uploads).toHaveLength(0)
  })

  it('keeps the photos that DID process when one of a batch fails', async () => {
    const { container } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.change(cameraInput(container), {
      target: {
        files: [
          new File(['a'], 'good.png', { type: 'image/png' }),
          new File(['b'], 'bad.png', { type: 'image/png' }),
        ],
      },
    })

    await resolveNextCompression()
    await failNextCompression()

    expect(await screen.findByText('1 photo attached — not saved yet.')).toBeInTheDocument()
    expect(screen.getByTestId('log-work-media-error')).toHaveTextContent('bad.png')
  })

  it('refuses a selection that finishes compressing AFTER the child changed', async () => {
    const { container, rerenderWith } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    selectPhoto(cameraInput(container), 'p1.png')

    // The switch happens while the file is still being compressed.
    rerenderWith({ selectedChildId: 'london', activeChild: children[1] })
    await resolveNextCompression()

    // The late file belongs to the child it was chosen for, who is no longer on
    // screen, so it is refused rather than re-bound.
    expect(screen.queryByAltText('Attached photo 1')).toBeNull()
    expect(screen.queryByText(/photo attached — not saved yet/)).toBeNull()
    expect(writes).toHaveLength(0)
  })
})

describe('Log work + real AudioRecorder — a stopped take is in the draft', () => {
  async function startRecording() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
  }

  function stopRecording() {
    act(() => {
      FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1].stop()
    })
  }

  it('stages the take with no Attach step, and saves it with the note', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Lincoln narrating' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))

    await startRecording()
    stopRecording()

    // The recorder's own *Use Recording* step is not in this flow at all.
    expect(await screen.findByText('Recording attached — not saved yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /use recording/i })).toBeNull()
    expect(writes).toHaveLength(0)

    fireEvent.click(saveButton())
    await waitFor(() => expect(uploads).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Audio,
      content: 'Lincoln narrating',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note and your recording — no time logged',
      severity: 'success',
    })
    expect(hoursWrites()).toHaveLength(0)
  })

  it('blocks the save while the microphone is running, and says why', async () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Lincoln narrating' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))

    await startRecording()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Wait for the photo or recording to finish.')).toBeInTheDocument()

    stopRecording()
    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('releases the microphone on a scope change and stages nothing afterwards', async () => {
    const { rerenderWith } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await startRecording()

    const recorder = FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1]
    rerenderWith({ today: '2026-10-21' })

    // Unmounting stopped the stream, and the `onstop` that follows may not hand
    // the take to the day now on screen.
    expect(stoppedTracks.length).toBeGreaterThan(0)
    act(() => recorder.stop())
    expect(screen.queryByText('Recording attached — not saved yet.')).toBeNull()
    expect(writes).toHaveLength(0)
  })

  it('blocks the save from the moment the microphone is ASKED for', async () => {
    const mic = installPendingMicrophone()
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Lincoln narrating' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))

    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))

    // Busy begins at the request, not when permission is granted — otherwise
    // the save lands during the prompt and the take is lost.
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.getByText('Wait for the photo or recording to finish.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /waiting for the microphone/i }),
    ).toBeDisabled()

    await mic.grant()
    await waitFor(() => expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument())
    expect(saveButton()).toBeDisabled()
  })

  it('releases a permission granted after the surface was replaced', async () => {
    const mic = installPendingMicrophone()
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Lincoln narrating' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    await waitFor(() => expect(saveButton()).toBeDisabled())

    // The parent gives up on audio while the prompt is still open.
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    await mic.grant()

    // No hidden recording with no Stop, no recorder at all, and the stream the
    // late grant handed over is already released.
    expect(FakeMediaRecorder.instances).toHaveLength(0)
    expect(stoppedTracks.length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /stop recording/i })).toBeNull()
    // And the save is free again: a request that is over cannot hold it.
    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('releases the save when permission is refused, and says so', async () => {
    const mic = installPendingMicrophone()
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Lincoln narrating' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    await mic.deny()

    expect(await screen.findByText(/could not access microphone/i)).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(screen.getByRole('button', { name: /start recording/i })).toBeEnabled()
  })

  it('records under StrictMode, where a cleanup-only liveness flag refused everything', async () => {
    // The browser defect: StrictMode's setup → cleanup → setup left the
    // recorder permanently refusing takes, on both the parent and kid paths.
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await startRecording()
    stopRecording()

    expect(await screen.findByText('Recording attached — not saved yet.')).toBeInTheDocument()
  })

  /**
   * FIX-268 — a second take has nowhere to land while one is attached.
   *
   * The recorder and the *Upload audio file* control are the two doors that
   * used to overwrite the staged blob and revoke the URL its preview was
   * playing, with nothing asked. Neither is mounted while audio is attached.
   */
  const audioFileInput = (container: HTMLElement) =>
    container.querySelector('input[accept="audio/*"]') as HTMLInputElement | null

  it('takes the recorder and the upload control away while a take is attached', async () => {
    const { container } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await startRecording()
    stopRecording()

    expect(await screen.findByText('Recording attached — not saved yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start recording/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /upload audio file/i })).toBeNull()
    expect(audioFileInput(container)).toBeNull()
    expect(
      screen.getByText('Remove this recording first to record or upload another.'),
    ).toBeInTheDocument()
  })

  it('does the same for a chosen audio file, and saves the blob that was staged', async () => {
    const { container } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.change(audioFileInput(container) as HTMLInputElement, {
      target: { files: [new File(['a'], 'lesson.mp3', { type: 'audio/mpeg' })] },
    })

    expect(await screen.findByText('Recording attached — not saved yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start recording/i })).toBeNull()
    expect(audioFileInput(container)).toBeNull()

    fireEvent.click(saveButton())
    // The chosen file itself, uploaded once.
    await waitFor(() => expect(uploads).toEqual(['0-stamp.mp3']))
    expect(artifactWrites()).toHaveLength(1)
  })

  it('removing the take is the way back to the recorder, and the next take stages', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await startRecording()
    stopRecording()
    fireEvent.click(await screen.findByRole('button', { name: /remove recording/i }))

    // An explicit discard, so the recorder is back with nothing in it.
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    await startRecording()
    stopRecording()
    expect(await screen.findByText('Recording attached — not saved yet.')).toBeInTheDocument()

    fireEvent.click(saveButton())
    await waitFor(() => expect(uploads).toEqual(['0-stamp.webm']))
  })

  it('releases the attached take when the day changes, and stages nothing after', async () => {
    const { container, rerenderWith } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await startRecording()
    stopRecording()
    const staged = (await screen.findByText('Recording attached — not saved yet.'))
      .parentElement?.querySelector('audio')
      ?.getAttribute('src') as string

    rerenderWith({ today: '2026-10-21' })

    await waitFor(() =>
      expect(screen.queryByText('Recording attached — not saved yet.')).toBeNull(),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(staged)
    expect(
      screen.getByText(/the media attached here was removed — nothing was saved/i),
    ).toBeInTheDocument()
    expect(audioFileInput(container)).toBeNull()
    expect(writes).toHaveLength(0)
  })

  it('a staged take can be removed, and the save then has nothing to upload', async () => {
    renderCard()
    fireEvent.change(minutesField(), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    await startRecording()
    stopRecording()

    fireEvent.click(await screen.findByRole('button', { name: /remove recording/i }))
    expect(screen.queryByText('Recording attached — not saved yet.')).toBeNull()

    fireEvent.click(saveButton())
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(0)
    expect(uploads).toHaveLength(0)
  })
})

describe('the shared components’ existing modes are untouched', () => {
  it('a staging caller still gets its own tray and its own Save, under StrictMode', async () => {
    const onCaptureBatch = vi.fn()
    const { container } = render(
      <StrictMode>
        <PhotoCapture multiple onCaptureBatch={onCaptureBatch} />
      </StrictMode>,
    )
    selectPhoto(cameraInput(container), 'legacy.png')
    await resolveNextCompression()

    // The old words, the old tray, the old commit: `Log work` opts into direct
    // staging, and every other caller is where it was.
    const commit = await screen.findByRole('button', { name: /save 1 photo/i })
    expect(screen.getByAltText('Staged photo 1')).toBeInTheDocument()
    fireEvent.click(commit)
    expect(onCaptureBatch).toHaveBeenCalledTimes(1)
  })

  it('a recorder caller without direct staging still confirms its take, under StrictMode', async () => {
    // The kid card's default path, in the mode the app actually runs.
    const onCapture = vi.fn()
    render(
      <StrictMode>
        <AudioRecorder onCapture={onCapture} />
      </StrictMode>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    act(() => {
      FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1].stop()
    })

    // Still a preview and still a confirm step — nothing is handed over until
    // the caller's own button is tapped.
    expect(onCapture).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /use recording/i }))
    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('tells a host a new draft exists before the microphone answers', () => {
    const onDraftChange = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => new Promise(() => {})) },
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
