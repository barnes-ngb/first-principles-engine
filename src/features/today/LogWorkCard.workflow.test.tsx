/**
 * `FIX-267` — the *Log work* form, end to end.
 *
 * The four defects this form replaces, each asserted here rather than
 * described:
 *
 *   • **a typed note survives a photo and a recording** — the old media
 *     pathways built their own artifact and never read the note field, which
 *     the photo tab had also unmounted;
 *   • **choosing a photo or an audio file saves NOTHING** until *Save work* is
 *     tapped, with a preview and a remove in between (audio used to commit
 *     itself on selection);
 *   • **one save** — one `artifacts` document, one `hours` row, one button, and
 *     a summary above it that states what both will be;
 *   • **a name on its own is not a log**, and the button says why on screen.
 *
 * Synthetic services only: Firestore, the uploader and the two media surfaces
 * are local stubs. The stubs stage through the same seams the real components
 * use (`onCaptureBatch` / `onCapture` / `onDraftChange`), and the real ones are
 * exercised against this card in `LogWorkCard.realMedia.test`.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LogWorkCard, { type LogWorkCardProps } from './LogWorkCard'
import type { Child } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'

interface WriteCall {
  collectionKey: string
  id: string
  data: Record<string, unknown>
}
const writes: WriteCall[] = []
const updates: { id: string; data: Record<string, unknown> }[] = []
const uploads: string[] = []
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

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((col: { __key: string }, id?: string) => ({
    __key: col.__key,
    id: id ?? `generated-${(generated += 1)}`,
  })),
  setDoc: vi.fn(
    async (ref: { __key: string; id: string }, data: Record<string, unknown>) => {
      // Recorded before it waits, so a write that should never have been
      // attempted is still counted.
      writes.push({ collectionKey: ref.__key, id: ref.id, data })
      if (gate) await gate
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

/**
 * Stages through `onStageFiles` — the same direct-staging seam the real
 * component uses — and reports the props the card must pass for the one-tray
 * flow to hold. The real components are driven in
 * `UnifiedCaptureCard.draftProtectionMedia.test`.
 */
vi.mock('../../components/PhotoCapture', () => ({
  default: ({
    onStageFiles,
    onCaptureBatch,
    onDraftChange,
    onBusyChange,
    uploading,
  }: {
    onStageFiles?: (files: File[]) => void
    onCaptureBatch?: (files: File[]) => void
    onDraftChange?: () => void
    onBusyChange?: (busy: boolean) => void
    uploading?: boolean
  }) => (
    <div
      data-testid="photo-capture"
      data-uploading={uploading ? 'yes' : 'no'}
      data-direct={onStageFiles ? 'yes' : 'no'}
      data-has-commit-step={onCaptureBatch ? 'yes' : 'no'}
    >
      <button
        data-testid="stage-one-photo"
        onClick={() => {
          onDraftChange?.()
          onStageFiles?.([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
        }}
      >
        choose one
      </button>
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
      <button data-testid="photo-busy" onClick={() => onBusyChange?.(true)}>
        start processing
      </button>
    </div>
  ),
}))

vi.mock('../../components/AudioRecorder', () => ({
  default: ({
    onCapture,
    onBusyChange,
    uploading,
    stageDirect,
    allowUpload,
  }: {
    onCapture: (blob: Blob) => void
    onBusyChange?: (busy: boolean) => void
    uploading?: boolean
    stageDirect?: boolean
    allowUpload?: boolean
  }) => (
    <div
      data-testid="audio-recorder"
      data-uploading={uploading ? 'yes' : 'no'}
      data-stage-direct={stageDirect ? 'yes' : 'no'}
      data-allow-upload={allowUpload ? 'yes' : 'no'}
    >
      <button
        data-testid="stage-recording"
        onClick={() => onCapture(new Blob(['x'], { type: 'audio/webm' }))}
      >
        finish a take
      </button>
      <button
        data-testid="stage-audio-file"
        onClick={() => onCapture(new File(['x'], 'lesson.mp3', { type: 'audio/mpeg' }))}
      >
        choose a file
      </button>
      <button data-testid="audio-busy" onClick={() => onBusyChange?.(true)}>
        start recording
      </button>
    </div>
  ),
}))

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

const TODAY = '2026-10-20'

function renderCard(overrides: Partial<LogWorkCardProps> = {}) {
  const onSnackMessage = vi.fn()
  const setTodayArtifacts = vi.fn()
  const props: LogWorkCardProps = {
    familyId: 'fam-1',
    selectedChildId: 'lincoln',
    today: TODAY,
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
  return { onSnackMessage, setTodayArtifacts, view, props }
}

const saveButton = () => screen.getByRole('button', { name: /^save work$/i })
const noteField = () => screen.getByLabelText(/^note \(optional\)$/i)
const nameField = () => screen.getByLabelText(/what is this\?/i) as HTMLInputElement
const minutesField = () => screen.getByLabelText('Duration in minutes') as HTMLInputElement
const artifactWrites = () => writes.filter((w) => w.collectionKey === 'artifacts')
const hoursWrites = () => writes.filter((w) => w.collectionKey === 'hours')
const lastSnack = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0] as { text: string; severity: string }

function openQuickFill() {
  fireEvent.click(screen.getByRole('button', { name: /quick fill/i }))
}

beforeEach(() => {
  writes.length = 0
  updates.length = 0
  uploads.length = 0
  generated = 0
  gate = null
  openGate = null
  let seq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${(seq += 1)}`),
    revokeObjectURL: vi.fn(),
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T15:00:00.000Z`))
})

describe('LogWorkCard — the form says what it is and what it will do', () => {
  it('is one form called Log work, for a named child on a named day', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Log work' })).toBeInTheDocument()
    expect(screen.getByTestId('log-work-scope')).toHaveTextContent('For Lincoln · Tue, Oct 20')
    // No second photo door at the top of the card — the duplicate modal is gone.
    expect(
      screen.queryByRole('button', { name: /add photos of today's work/i }),
    ).not.toBeInTheDocument()
  })

  it('summarises the save before the tap, and keeps the summary true', () => {
    renderCard()
    // An empty draft is nothing yet — not a "time only" log with no time.
    expect(screen.getByText('Nothing to save yet.')).toBeInTheDocument()
    expect(screen.getByText('No time is recorded.')).toBeInTheDocument()

    fireEvent.change(minutesField(), { target: { value: '20' } })
    expect(screen.getByText('Saves no evidence — time only.')).toBeInTheDocument()
    fireEvent.change(minutesField(), { target: { value: '' } })

    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.change(minutesField(), { target: { value: '45' } })
    expect(screen.getByText('Saves your note.')).toBeInTheDocument()
    expect(screen.getByText('Records 45 minutes to Other.')).toBeInTheDocument()
  })

  it('refuses a name on its own and says why ON SCREEN', () => {
    renderCard()
    expect(saveButton()).toBeDisabled()
    fireEvent.change(nameField(), { target: { value: 'dentist visit' } })
    expect(saveButton()).toBeDisabled()
    const reason = screen.getByText(
      'A name on its own isn’t saved. Add a note, some minutes, a photo or a recording.',
    )
    // Readable without a hover, which a phone cannot do.
    expect(reason).toHaveAttribute('role', 'status')
  })

  it('says nothing about the day when the day IS today', () => {
    renderCard()
    expect(screen.queryByText(/past day/i)).toBeNull()
    expect(screen.queryByText(/hasn’t happened yet/i)).toBeNull()
  })

  it('does not call a day AHEAD of today a past day', async () => {
    const { onSnackMessage } = renderCard({ today: '2026-10-27' })
    expect(screen.getByText(/hasn’t happened yet/)).toHaveTextContent('2026-10-27')
    expect(screen.queryByText(/past day/i)).toBeNull()

    fireEvent.change(noteField(), { target: { value: 'Planned museum trip' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    // The stored day is the one chosen, unchanged.
    expect(artifactWrites()[0].data).toMatchObject({ dayLogId: '2026-10-27' })
    expect(lastSnack(onSnackMessage).severity).toBe('success')
  })

  it('says a past day is a past day, and files the log under it', async () => {
    const { onSnackMessage } = renderCard({ today: '2026-10-13' })
    expect(screen.getByText(/This is a past day/)).toHaveTextContent('2026-10-13')
    fireEvent.change(noteField(), { target: { value: 'Last Tuesday’s museum trip' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({ dayLogId: '2026-10-13' })
    expect(lastSnack(onSnackMessage).severity).toBe('success')
  })
})

describe('LogWorkCard — one save, and what it writes', () => {
  it('a note alone files evidence and no hours', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Visited the dentist' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(hoursWrites()).toHaveLength(0)
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Note,
      content: 'Visited the dentist',
      childId: 'lincoln',
      dayLogId: TODAY,
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note — no time logged',
      severity: 'success',
    })
  })

  it('minutes alone file hours and no artifact', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(minutesField(), { target: { value: '30' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(0)
    expect(hoursWrites()[0].data).toMatchObject({ minutes: 30, date: TODAY, childId: 'lincoln' })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Logged 30 min — no evidence saved',
      severity: 'success',
    })
  })

  it('a note with minutes files both, and the receipt states both', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(nameField(), { target: { value: 'Museum trip' } })
    fireEvent.change(noteField(), { target: { value: 'Saw the dinosaurs' } })
    fireEvent.change(minutesField(), { target: { value: '90' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(writes.map((w) => w.collectionKey)).toEqual(['artifacts', 'hours'])
    expect(hoursWrites()[0].data).toMatchObject({
      minutes: 90,
      notes: 'Museum trip: Saw the dinosaurs',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note — 90 min logged',
      severity: 'success',
    })
  })

  it('clears the form after a save it owns, and keeps nothing staged', async () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '45' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    await waitFor(() => expect((noteField() as HTMLTextAreaElement).value).toBe(''))
    expect(minutesField().value).toBe('')
    expect(saveButton()).toBeDisabled()
  })

  it('writes once however many times the parent taps', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Built a tower' } })
    fireEvent.change(minutesField(), { target: { value: '45' } })

    holdWrites()
    await act(async () => {
      const button = saveButton()
      button.click()
      button.click()
      button.click()
    })
    expect(artifactWrites()).toHaveLength(1)
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    releaseWrites()
    await waitFor(() => expect(hoursWrites()).toHaveLength(1))
    expect(artifactWrites()).toHaveLength(1)
    expect(onSnackMessage).toHaveBeenCalledTimes(1)
  })
})

describe('LogWorkCard — media is staged, never committed on selection', () => {
  it('stages photos with a preview and writes nothing until Save work', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-two-photos'))

    // Nothing has been written, and the card says so.
    expect(writes).toHaveLength(0)
    expect(uploads).toHaveLength(0)
    expect(screen.getByText('2 photos attached — not saved yet.')).toBeInTheDocument()
    expect(screen.getByAltText('Attached photo 1')).toBeInTheDocument()
    expect(screen.getByAltText('Attached photo 2')).toBeInTheDocument()
    expect(screen.getByText('Saves 2 photos.')).toBeInTheDocument()

    fireEvent.click(saveButton())
    await waitFor(() => expect(updates).toHaveLength(1))
    // ONE artifact for the batch, both files under it, cover first.
    expect(artifactWrites()).toHaveLength(1)
    expect(uploads).toEqual(['0-stamp.jpg', '1-stamp.jpg'])
    expect(updates[0].data).toEqual({
      uri: 'https://x/0-stamp.jpg',
      mediaUrls: ['https://x/0-stamp.jpg', 'https://x/1-stamp.jpg'],
    })
  })

  it('mounts the media surfaces in direct-staging mode — no second tray', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    const photo = screen.getByTestId('photo-capture')
    expect(photo).toHaveAttribute('data-direct', 'yes')
    // No `onCaptureBatch`: there is no Attach-then-Save pair to lose a visible
    // selection between.
    expect(photo).toHaveAttribute('data-has-commit-step', 'no')

    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    expect(screen.getByTestId('audio-recorder')).toHaveAttribute('data-stage-direct', 'yes')
    expect(screen.getByTestId('audio-recorder')).toHaveAttribute('data-allow-upload', 'yes')
  })

  it('waits for a surface that is still working, and says so', () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    expect(saveButton()).toBeEnabled()

    fireEvent.click(screen.getByTestId('photo-busy'))
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Wait for the photo or recording to finish.')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('keeps the typed note WITH the photos', async () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Rome day' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-one-photo'))

    // The note field is still there beside the attachment — the defect was that
    // moving to the photo tab unmounted it and the save never read it.
    expect((noteField() as HTMLTextAreaElement).value).toBe('Rome day')
    expect(screen.getByText('Saves your note and 1 photo.')).toBeInTheDocument()

    fireEvent.click(saveButton())
    await waitFor(() => expect(artifactWrites()).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      content: 'Rome day',
    })
  })

  it('stages a recording rather than uploading it, and keeps the note too', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(noteField(), { target: { value: 'Lincoln narrating' } })
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.click(screen.getByTestId('stage-audio-file'))
    expect(writes).toHaveLength(0)
    expect(uploads).toHaveLength(0)
    expect(screen.getByText('Recording attached — not saved yet.')).toBeInTheDocument()

    fireEvent.click(saveButton())
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Audio,
      content: 'Lincoln narrating',
    })
    expect(lastSnack(onSnackMessage).text).toBe('Saved your note and your recording — no time logged')
  })

  it('removes a staged photo on request, and writes what is left', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-two-photos'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove attached photo 1' }))

    expect(screen.getByText('1 photo attached — not saved yet.')).toBeInTheDocument()
    fireEvent.click(saveButton())
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(uploads).toHaveLength(1)
  })

  it('discards the whole draft without writing anything', async () => {
    renderCard()
    fireEvent.change(noteField(), { target: { value: 'Never mind' } })
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-one-photo'))

    fireEvent.click(screen.getByRole('button', { name: /discard this draft/i }))

    expect(writes).toHaveLength(0)
    expect(uploads).toHaveLength(0)
    expect((noteField() as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByAltText('Attached photo 1')).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('asks before replacing one kind of attachment with the other', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-two-photos'))

    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(
      'Remove the 2 photos you attached and record audio instead? Nothing has been saved yet.',
    )

    // Declining keeps the photos AND the photo surface.
    fireEvent.click(within(dialog).getByRole('button', { name: /keep it/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('2 photos attached — not saved yet.')).toBeInTheDocument()
    expect(screen.getByTestId('photo-capture')).toBeInTheDocument()

    // Accepting removes them and switches.
    fireEvent.click(screen.getByRole('button', { name: '🎤 Audio' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /remove it/i }),
    )
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument())
    expect(screen.queryByAltText('Attached photo 1')).not.toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })
})

describe('LogWorkCard — quick fill is a shortcut, and never takes a parent’s words', () => {
  it('is folded away, and says it saves nothing', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /Lego build/i })).not.toBeInTheDocument()
    openQuickFill()
    expect(screen.getByRole('button', { name: /Lego build/i })).toBeInTheDocument()
    expect(screen.getByText(/never save anything on their own/i)).toBeInTheDocument()
  })

  it('fills the three fields, and de-selecting takes back only its own', () => {
    renderCard()
    openQuickFill()
    const lego = screen.getByRole('button', { name: /Lego build/i })
    fireEvent.click(lego)
    expect(nameField().value).toBe('Lego build')
    expect(minutesField().value).toBe('45')

    fireEvent.click(lego)
    expect(nameField().value).toBe('')
    expect(minutesField().value).toBe('')
  })

  it('asks before overwriting a field the parent typed, and can be declined', async () => {
    renderCard()
    openQuickFill()
    fireEvent.change(minutesField(), { target: { value: '20' } })

    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Use “Lego build” and replace the minutes you typed?')

    fireEvent.click(within(dialog).getByRole('button', { name: /keep mine/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(minutesField().value).toBe('20')
    expect(nameField().value).toBe('')

    // And accepting really does apply it.
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /use the quick fill/i,
      }),
    )
    await waitFor(() => expect(minutesField().value).toBe('45'))
    expect(nameField().value).toBe('Lego build')
  })

  it('keeps a hand-typed value when the quick fill is de-selected, and says so', () => {
    renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(nameField(), { target: { value: 'Big castle build' } })

    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    expect(nameField().value).toBe('Big castle build')
    expect(minutesField().value).toBe('')
    expect(
      screen.getByText('Quick fill cleared. What you typed yourself is still here.'),
    ).toBeInTheDocument()
  })
})
