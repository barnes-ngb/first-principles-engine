/**
 * The capture card, both audiences, through the one entry point Today uses.
 *
 * ── Adapted for FIX-267 ────────────────────────────────────────────────────
 *
 * The parent half of this card is now the *Log work* form: one draft, media
 * staged until an explicit *Save work*, and the quick logs folded away as an
 * optional *Quick fill*. Every parent assertion below is the behaviour this
 * file already held, read against that form — the chips still pre-fill and
 * de-select, the clamp is still 240, a note alone still writes one artifact and
 * no `hours` row, a photo batch is still ONE artifact with `mediaUrls`, the
 * hours note still joins the activity name and the note, and the form still
 * resets after a save it owns.
 *
 * Two deliberately changed, with the change asserted rather than dropped:
 *
 *   • the card's own top *"Add photos of today's work"* dialog is GONE — it was
 *     a second photo door that inherited the form's fields without showing
 *     them, and the approved scope removes it. The test that opened it now
 *     asserts it is not there;
 *   • *Save Capture* is *Save work*, and a photo or audio selection no longer
 *     saves on its own, so the media tests stage and then save.
 *
 * The kid describes are untouched: the kid card is the same code it was.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from '../UnifiedCaptureCard'
import type { ActivityConfig, Child } from '../../../core/types'

type WriteCall = { collectionKey: string; data: Record<string, unknown> }
const writeCalls: WriteCall[] = []
const updateDocCalls: Record<string, unknown>[] = []
let generated = 0

// UX-184: the card reads the family's activity configs (read-only) so a
// flagged activity is offered here as well as on "⭐ I Did More!". Tests set
// this before rendering; `[]` is the shape every family has today.
let familyConfigs: ActivityConfig[] = []

vi.mock('firebase/firestore', () => ({
  // The kid card's writes.
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    writeCalls.push({ collectionKey: col.__key, data })
    return Promise.resolve({ id: `mock-${writeCalls.length}` })
  }),
  // The parent form's: a document id generated before the first write, so a
  // retry addresses the same record (FIX-267).
  doc: vi.fn((col: { __key: string }, id?: string) => ({
    __key: col.__key,
    id: id ?? `generated-${(generated += 1)}`,
  })),
  setDoc: vi.fn(async (ref: { __key: string }, data: Record<string, unknown>) => {
    writeCalls.push({ collectionKey: ref.__key, data })
  }),
  updateDoc: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
    updateDocCalls.push(data)
    return Promise.resolve()
  }),
  query: vi.fn(() => ({ __key: 'activityConfigs' })),
  where: vi.fn(() => ({})),
  onSnapshot: vi.fn((_q: unknown, next: (snap: unknown) => void) => {
    next({ docs: familyConfigs.map((c) => ({ id: c.id, data: () => c })) })
    return () => {}
  }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  hoursCollection: vi.fn(() => ({ __key: 'hours' })),
  activityConfigsCollection: vi.fn(() => ({ __key: 'activityConfigs' })),
}))

vi.mock('../../../core/firebase/upload', () => ({
  generateFilename: vi.fn((ext: string) => `file.${ext}`),
  // Echo the filename so each upload yields a distinct download URL.
  uploadArtifactFile: vi.fn((_fam: string, _id: string, _file: unknown, filename: string) =>
    Promise.resolve({ downloadUrl: `https://x/${filename}` }),
  ),
}))

// Interactive stub: the parent form takes its selection straight through
// `onStageFiles` (FIX-267); the kid card's single-photo `onCapture` path
// remains available.
vi.mock('../../../components/PhotoCapture', () => ({
  default: ({
    onStageFiles,
    onCapture,
  }: {
    onStageFiles?: (files: File[]) => void
    onCapture?: (file: File) => void
  }) => (
    <div data-testid="photo-capture">
      <button
        data-testid="stage-multi-photos"
        onClick={() =>
          onStageFiles?.([
            new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
            new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
            new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
          ])
        }
      >
        choose three photos
      </button>
      <button
        data-testid="commit-single-photo"
        onClick={() => onCapture?.(new File(['a'], 'a.jpg', { type: 'image/jpeg' }))}
      >
        commit single
      </button>
    </div>
  ),
}))
// Interactive stub: exposes an upload-file button that routes a File to onCapture.
vi.mock('../../../components/AudioRecorder', () => ({
  default: ({ onCapture }: { onCapture: (blob: Blob) => void }) => (
    <div data-testid="audio-recorder">
      <button
        data-testid="upload-audio-file"
        onClick={() => onCapture(new File(['x'], 'lesson.mp3', { type: 'audio/mpeg' }))}
      >
        upload file
      </button>
    </div>
  ),
}))

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

function renderCard(overrides: {
  selectedChildId?: string
  variant?: 'parent' | 'kid'
  activeChild?: Child
  familyConfigs?: ActivityConfig[]
} = {}) {
  writeCalls.length = 0
  updateDocCalls.length = 0
  generated = 0
  familyConfigs = overrides.familyConfigs ?? []
  const onSnackMessage = vi.fn()
  const setTodayArtifacts = vi.fn()
  const selectedChildId = overrides.selectedChildId ?? 'lincoln'
  const activeChild =
    overrides.activeChild ?? children.find((c) => c.id === selectedChildId)
  const utils = render(
    <MemoryRouter>
      <UnifiedCaptureCard
        familyId="fam-1"
        selectedChildId={selectedChildId}
        today="2026-05-17"
        weekPlanId="week-1"
        selectableChildren={children}
        todayArtifacts={[]}
        setTodayArtifacts={setTodayArtifacts}
        onSnackMessage={onSnackMessage}
        variant={overrides.variant}
        activeChild={activeChild}
      />
    </MemoryRouter>,
  )
  return { ...utils, onSnackMessage, setTodayArtifacts }
}

function getActivityNameInput(): HTMLInputElement {
  return screen.getByLabelText(/^what is this\?$/i) as HTMLInputElement
}
function getDurationInput(): HTMLInputElement {
  return screen.getByLabelText(/duration in minutes/i) as HTMLInputElement
}
/**
 * The Child selector's displayed value. The zero-minute caption used to name
 * the child and no longer does (FIX-266), so WHICH child the form is for is
 * read from the control that still says it.
 */
function getChildSelectorValue(): string {
  return screen.getByRole('combobox', { name: /^child$/i }).textContent ?? ''
}
/** The zero-minute caption, which promises nothing (FIX-266). */
const NO_MINUTES_CAPTION = 'Add minutes if you want to log time.'

const saveWork = () => screen.getByRole('button', { name: /^save work$/i })
const artifactWrites = () => writeCalls.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => writeCalls.filter((c) => c.collectionKey === 'hours')

/** The quick fill is folded away by design (FIX-267) — open it to tap a chip. */
function openQuickFill() {
  fireEvent.click(screen.getByRole('button', { name: /quick fill/i }))
}

beforeEach(() => {
  let seq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${(seq += 1)}`),
    revokeObjectURL: vi.fn(),
  })
})

describe('UnifiedCaptureCard (parent variant)', () => {
  it('renders the fields, the quick fill and both attachment kinds', () => {
    renderCard()
    expect(getActivityNameInput()).toBeInTheDocument()
    expect(getDurationInput()).toBeInTheDocument()
    expect(screen.getByLabelText(/^note \(optional\)$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📷 Photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /audio/i })).toBeInTheDocument()

    openQuickFill()
    expect(screen.getByRole('button', { name: /Lego build/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zoo \/ museum trip/i })).toBeInTheDocument()
  })

  it('renders Creative and Active group captions with their chips', () => {
    renderCard()
    openQuickFill()
    expect(screen.getByText(/^Creative$/)).toBeInTheDocument()
    expect(screen.getByText(/^Active$/)).toBeInTheDocument()

    // Creative chips
    expect(screen.getByRole('button', { name: /Lego build/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Baking \/ cooking/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Drawing \/ art/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Music practice/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reading session/i })).toBeInTheDocument()

    // Active chips
    expect(screen.getByRole('button', { name: /Nature \/ park/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sports \/ PE/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zoo \/ museum trip/i })).toBeInTheDocument()
  })

  it('asks for minutes with no duration, and is for the active child', () => {
    renderCard()
    expect(screen.getByText(NO_MINUTES_CAPTION)).toBeInTheDocument()
    expect(screen.queryByText(/counts toward/i)).toBeNull()
    expect(getChildSelectorValue()).toBe('Lincoln')
  })

  it('seeds the Child selector with London when London is the active child', () => {
    renderCard({ selectedChildId: 'london' })
    expect(getChildSelectorValue()).toBe('London')
    expect(screen.getByText(NO_MINUTES_CAPTION)).toBeInTheDocument()
  })

  it('tapping a quick fill pre-fills activity name, category, and duration', () => {
    renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    expect(getActivityNameInput().value).toBe('Lego build')
    expect(getDurationInput().value).toBe('45')
    expect(screen.getByText(/Will log 45 minutes to Practical Arts/i)).toBeInTheDocument()
  })

  it('tapping the same quick fill again de-selects and clears the three fields', () => {
    renderCard()
    openQuickFill()
    const lego = screen.getByRole('button', { name: /Lego build/i })
    fireEvent.click(lego)
    fireEvent.click(lego)
    expect(getActivityNameInput().value).toBe('')
    expect(getDurationInput().value).toBe('')
    // Cleared back to no minutes, so the caption goes back to asking.
    expect(screen.getByText(NO_MINUTES_CAPTION)).toBeInTheDocument()
    expect(getChildSelectorValue()).toBe('Lincoln')
  })

  it('Zoo trip quick fill suggests 120 minutes', () => {
    renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    expect(getDurationInput().value).toBe('120')
    expect(screen.getByText(/Will log 120 minutes to Science/i)).toBeInTheDocument()
  })

  it('clamps duration > 240 to 240', () => {
    renderCard()
    fireEvent.change(getDurationInput(), { target: { value: '500' } })
    expect(getDurationInput().value).toBe('240')
  })

  it('typing in "What is this?" does not change the quick-fill selection', () => {
    renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(getActivityNameInput(), { target: { value: 'Big castle build' } })
    expect(getActivityNameInput().value).toBe('Big castle build')
    // Duration still 45 (chip stayed selected)
    expect(getDurationInput().value).toBe('45')
  })

  it('saves artifact only when note is filled and duration is empty', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), {
      target: { value: 'Lincoln drew a castle' },
    })
    fireEvent.click(saveWork())

    await waitFor(() => expect(writeCalls.length).toBe(1))
    expect(writeCalls[0].collectionKey).toBe('artifacts')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note — no time logged',
      severity: 'success',
    })
  })

  it('saves hours only when duration is filled and no media', async () => {
    const { onSnackMessage } = renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    fireEvent.click(saveWork())

    await waitFor(() => expect(writeCalls.length).toBe(1))
    expect(writeCalls[0].collectionKey).toBe('hours')
    expect(writeCalls[0].data).toMatchObject({
      childId: 'lincoln',
      date: '2026-05-17',
      minutes: 120,
      subjectBucket: 'Science',
      source: 'unified-capture',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Logged 120 min — no evidence saved',
      severity: 'success',
    })
  })

  it('saves both artifact + hours when a note and duration are both filled', async () => {
    const { onSnackMessage } = renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), {
      target: { value: 'Built a giant tower' },
    })
    fireEvent.click(saveWork())

    await waitFor(() => expect(writeCalls.length).toBe(2))
    expect(writeCalls[0].collectionKey).toBe('artifacts')
    expect(writeCalls[1].collectionKey).toBe('hours')
    expect(writeCalls[1].data).toMatchObject({
      minutes: 45,
      subjectBucket: 'PracticalArts',
      source: 'unified-capture',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your note — 45 min logged',
      severity: 'success',
    })
  })

  it('Save work is disabled when nothing is filled, and says why on screen', () => {
    renderCard()
    expect(saveWork()).toBeDisabled()
    expect(
      screen.getByText('Add a note, some minutes, a photo or a recording.'),
    ).toHaveAttribute('role', 'status')
  })

  it('resets the form after a save it owns', async () => {
    renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(saveWork())

    await waitFor(() => {
      expect(writeCalls.length).toBe(1)
      expect(getActivityNameInput().value).toBe('')
      expect(getDurationInput().value).toBe('')
    })
    expect(saveWork()).toBeDisabled()
  })

  it('switching child updates the Child selector', () => {
    const { rerender } = renderCard()
    expect(getChildSelectorValue()).toBe('Lincoln')
    rerender(
      <MemoryRouter>
        <UnifiedCaptureCard
          familyId="fam-1"
          selectedChildId="london"
          today="2026-05-17"
          weekPlanId="week-1"
          selectableChildren={children}
          todayArtifacts={[]}
          setTodayArtifacts={vi.fn()}
          onSnackMessage={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(getChildSelectorValue()).toBe('London')
    expect(screen.getByText(NO_MINUTES_CAPTION)).toBeInTheDocument()
  })

  it('renders the evidence section with its empty state', () => {
    renderCard()
    expect(screen.getByText(/Nothing captured yet today/i)).toBeInTheDocument()
  })

  it('renders the photo capture component when Photo is chosen', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    expect(screen.getByTestId('photo-capture')).toBeInTheDocument()
  })

  it('renders the audio recorder when Audio is chosen', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /audio/i }))
    expect(screen.getByTestId('audio-recorder')).toBeInTheDocument()
  })

  it('multi-photo commits ONE artifact with mediaUrls[] and uri === mediaUrls[0]', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    fireEvent.click(screen.getByTestId('stage-multi-photos'))
    // Staging writes nothing — the save is the explicit tap (FIX-267).
    expect(writeCalls).toHaveLength(0)
    fireEvent.click(saveWork())

    await waitFor(() => expect(updateDocCalls.length).toBe(1))
    // Exactly ONE artifact doc for the whole batch.
    expect(artifactWrites()).toHaveLength(1)

    const data = updateDocCalls[0] as { uri: string; mediaUrls: string[] }
    expect(Array.isArray(data.mediaUrls)).toBe(true)
    expect(data.mediaUrls.length).toBeGreaterThan(1)
    expect(data.mediaUrls).toHaveLength(3)
    // Distinct URLs (index-prefixed filenames) and cover === first.
    expect(new Set(data.mediaUrls).size).toBe(3)
    expect(data.uri).toBe(data.mediaUrls[0])
  })

  it('an audio file creates one audio artifact with uri set', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /audio/i }))
    fireEvent.click(screen.getByTestId('upload-audio-file'))
    expect(writeCalls).toHaveLength(0)
    fireEvent.click(saveWork())

    await waitFor(() => expect(updateDocCalls.length).toBe(1))
    expect(artifactWrites()).toHaveLength(1)

    const data = updateDocCalls[0] as { uri: string; mediaUrls?: string[] }
    // Extension derived from the uploaded file name (.mp3).
    expect(data.uri).toBe('https://x/0-file.mp3')
    expect(data.mediaUrls).toEqual(['https://x/0-file.mp3'])
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Saved your recording — no time logged',
      severity: 'success',
    })
  })

  it('hours notes combine activity name and note text', async () => {
    renderCard()
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Reading session/i }))
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), {
      target: { value: 'page 12 of Narnia' },
    })
    fireEvent.click(saveWork())

    await waitFor(() => expect(writeCalls.length).toBe(2))
    const hoursCall = hoursWrites()[0]
    expect(hoursCall?.data).toMatchObject({
      notes: 'Reading session: page 12 of Narnia',
      subjectBucket: 'Reading',
    })
  })

  it('no longer offers a SECOND photo door above the form (FIX-267)', () => {
    renderCard()
    // The dialog this card used to open from the top of the panel inherited the
    // form's child, category and minutes without showing any of them, so the
    // same photos carried different metadata depending on which door the thumb
    // found. One door now, inside the draft.
    expect(
      screen.queryByRole('button', { name: /add photos of today's work/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Log work' })).toBeInTheDocument()
  })
})

describe('UnifiedCaptureCard (kid variant)', () => {
  function getKidDuration(): HTMLElement {
    return screen.getByTestId('kid-duration-display')
  }

  it('hides the free-form text field and the parent note', () => {
    renderCard({ variant: 'kid' })
    expect(screen.queryByLabelText(/^what is this\?$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^note \(optional\)$/i)).not.toBeInTheDocument()
    // Photo + Audio remain
    expect(screen.getByRole('button', { name: '📷 Photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /audio/i })).toBeInTheDocument()
  })

  it('hides the child select and category dropdowns', () => {
    renderCard({ variant: 'kid' })
    expect(screen.queryByLabelText(/^child$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^category$/i)).not.toBeInTheDocument()
  })

  it('renders +/- duration stepper showing 0 by default', () => {
    renderCard({ variant: 'kid' })
    expect(getKidDuration().textContent).toBe('0')
    expect(screen.getByLabelText(/increase duration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/decrease duration/i)).toBeInTheDocument()
  })

  it('tapping a chip pre-fills the stepper with suggested minutes', () => {
    renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    expect(getKidDuration().textContent).toBe('45')
  })

  it('+ steps duration by 5 minutes', () => {
    renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByLabelText(/increase duration/i))
    expect(getKidDuration().textContent).toBe('50')
    fireEvent.click(screen.getByLabelText(/decrease duration/i))
    fireEvent.click(screen.getByLabelText(/decrease duration/i))
    expect(getKidDuration().textContent).toBe('40')
  })

  // UX-74: the kid button logs minutes only (`artifactSaved: false`), so it is
  // named "Save my time". Safety string: the one big button on the kid capture
  // card must not promise a capture it never makes.
  it('names the kid button for what it writes — minutes, not a capture', async () => {
    const { onSnackMessage } = renderCard({ variant: 'kid' })
    expect(screen.getByRole('button', { name: /save my time/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save work/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByRole('button', { name: /save my time/i }))

    // One write, and it is an hours row — no artifact, exactly as the label says.
    await waitFor(() => expect(writeCalls.length).toBe(1))
    expect(writeCalls[0].collectionKey).toBe('hours')
    expect(onSnackMessage).toHaveBeenCalledWith({ text: 'Logged 45 min', severity: 'success' })
  })

  it('disables the kid save button when no chip is selected', () => {
    renderCard({ variant: 'kid' })
    const saveBtn = screen.getByRole('button', { name: /save my time/i })
    expect(saveBtn).toBeDisabled()
    expect(screen.getByText(/tap a chip above/i)).toBeInTheDocument()
  })

  it('saves hours with chip label as activity name and proper subject bucket', async () => {
    const { onSnackMessage } = renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByRole('button', { name: /save my time/i }))

    await waitFor(() => expect(writeCalls.length).toBe(1))
    expect(writeCalls[0].collectionKey).toBe('hours')
    expect(writeCalls[0].data).toMatchObject({
      childId: 'lincoln',
      date: '2026-05-17',
      minutes: 45,
      subjectBucket: 'PracticalArts',
      source: 'unified-capture',
      notes: 'Lego build',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Logged 45 min',
      severity: 'success',
    })
  })

  it('resets stepper and chip selection after save', async () => {
    renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByRole('button', { name: /save my time/i }))

    await waitFor(() => {
      expect(writeCalls.length).toBe(1)
      expect(getKidDuration().textContent).toBe('0')
    })
    // No media tab should be selected after reset
    const photoBtn = screen.getByRole('button', { name: '📷 Photo' })
    expect(photoBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('does not render the parent evidence section', () => {
    renderCard({ variant: 'kid' })
    expect(screen.queryByText(/Nothing captured yet today/i)).not.toBeInTheDocument()
  })

  it('applies the Lincoln (Minecraft) accent on chips', () => {
    renderCard({ variant: 'kid', activeChild: { id: 'lincoln', name: 'Lincoln' } as Child })
    const lego = screen.getByRole('button', { name: /Lego build/i })
    const styles = window.getComputedStyle(lego)
    // Lincoln accent #7EFC20 → border rgb(126, 252, 32)
    expect(styles.borderColor).toMatch(/rgb\(126,\s*252,\s*32\)/)
  })

  it('applies the London (story) accent on chips', () => {
    renderCard({
      variant: 'kid',
      selectedChildId: 'london',
      activeChild: { id: 'london', name: 'London' } as Child,
    })
    const lego = screen.getByRole('button', { name: /Lego build/i })
    const styles = window.getComputedStyle(lego)
    // London accent #9DC183 → border rgb(157, 193, 131)
    expect(styles.borderColor).toMatch(/rgb\(157,\s*193,\s*131\)/)
  })

  it('+ button stops at MAX_DURATION 240', () => {
    renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    // starts at 120, click + 25 times = 245 capped to 240
    const plus = screen.getByLabelText(/increase duration/i)
    for (let i = 0; i < 25; i++) fireEvent.click(plus)
    expect(getKidDuration().textContent).toBe('240')
  })

  it('- button stops at 0', () => {
    renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    const minus = screen.getByLabelText(/decrease duration/i)
    // 45 → -5 ten times = -5, clamped to 0
    for (let i = 0; i < 10; i++) fireEvent.click(minus)
    expect(getKidDuration().textContent).toBe('0')
  })
})

// ── UX-184 ───────────────────────────────────────────────────────────────────
//
// The owner flagged two activities for the kids' quick log, opened his son's
// Today page, read the FIRST quick-log panel he came to — this one — and
// reported them missing. The pure resolver is covered in `quickLogChips.test`;
// these assert the panel actually renders it, which is the half that was broken.
describe('UnifiedCaptureCard — the family’s quick-log activities (UX-184)', () => {
  const packing = {
    id: 'pack',
    name: 'Packing',
    type: 'routine',
    subjectBucket: 'PracticalArts',
    defaultMinutes: 30,
    frequency: 'daily',
    childId: 'both',
    sortOrder: 1,
    completed: false,
    scannable: false,
    quickLog: true,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  } as ActivityConfig

  it('offers a flagged activity on the kid’s capture panel, in the family’s words', () => {
    renderCard({ variant: 'kid', familyConfigs: [packing] })
    expect(screen.getByRole('button', { name: /^Packing$/ })).toBeInTheDocument()
    // Under its own heading, ahead of the built-in groups.
    expect(screen.getByText('Yours')).toBeInTheDocument()
  })

  it('offers it on the parent’s quick fill too', () => {
    renderCard({ familyConfigs: [packing] })
    openQuickFill()
    expect(screen.getByRole('button', { name: /^Packing$/ })).toBeInTheDocument()
  })

  it('shows only the eight built-ins when the family has flagged nothing', () => {
    renderCard({ familyConfigs: [] })
    openQuickFill()
    expect(screen.getByRole('button', { name: /Lego build/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zoo \/ museum trip/i })).toBeInTheDocument()
    expect(screen.queryByText('Yours')).not.toBeInTheDocument()
  })

  it('logs the config’s own subject bucket and minutes — not a guess from its name', () => {
    renderCard({ variant: 'kid', familyConfigs: [packing] })
    fireEvent.click(screen.getByRole('button', { name: /^Packing$/ }))
    fireEvent.click(screen.getByRole('button', { name: /save my time/i }))

    return waitFor(() => {
      expect(writeCalls.length).toBe(1)
      expect(writeCalls[0].collectionKey).toBe('hours')
      expect(writeCalls[0].data).toMatchObject({
        childId: 'lincoln',
        minutes: 30,
        // "Packing" guessed from its letters would be Other, which is exactly
        // what a season of real practical work used to read back as.
        subjectBucket: 'PracticalArts',
        source: 'unified-capture',
        notes: 'Packing',
      })
    })
  })

  // Codex round 1, P2 on PR #1779. A family preset is child-scoped, so changing
  // the Child field replaces the chip row while its name / subject / minutes
  // stay in the fields — and a save would then write one child's activity onto
  // the other child's hours with no chip on screen to explain it.
  it('clears a family quick fill’s fields when the parent changes child', async () => {
    renderCard({ familyConfigs: [packing] })
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /^Packing$/ }))
    expect(getActivityNameInput().value).toBe('Packing')
    expect(getDurationInput().value).toBe('30')

    fireEvent.mouseDown(screen.getByLabelText(/^child$/i))
    fireEvent.click(await screen.findByRole('option', { name: 'London' }))

    await waitFor(() => {
      expect(getActivityNameInput().value).toBe('')
      expect(getDurationInput().value).toBe('')
    })
  })

  it('does not carry one child’s activity onto the other child’s hours', async () => {
    renderCard({ familyConfigs: [packing] })
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /^Packing$/ }))
    fireEvent.mouseDown(screen.getByLabelText(/^child$/i))
    fireEvent.click(await screen.findByRole('option', { name: 'London' }))

    // Nothing to save: the preset's minutes went with it, so the form refuses
    // rather than writing 30 minutes of "Packing" against London.
    await waitFor(() => expect(getDurationInput().value).toBe(''))
    expect(saveWork()).toBeDisabled()
    expect(hoursWrites()).toHaveLength(0)
  })

  it('keeps a BUILT-IN quick fill across a child change — it is valid for any child', async () => {
    renderCard({ familyConfigs: [packing] })
    openQuickFill()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    expect(getActivityNameInput().value).toBe('Lego build')

    fireEvent.mouseDown(screen.getByLabelText(/^child$/i))
    fireEvent.click(await screen.findByRole('option', { name: 'London' }))

    await waitFor(() => expect(getActivityNameInput().value).toBe('Lego build'))
    expect(getDurationInput().value).toBe('45')
  })

  it('leaves the built-in presets writing exactly what they always wrote', () => {
    renderCard({ variant: 'kid', familyConfigs: [packing] })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByRole('button', { name: /save my time/i }))

    return waitFor(() => {
      expect(writeCalls[0].data).toMatchObject({
        minutes: 45,
        subjectBucket: 'PracticalArts',
        notes: 'Lego build',
      })
    })
  })
})
