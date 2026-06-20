import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from '../UnifiedCaptureCard'
import type { Child } from '../../../core/types'

type AddDocCall = { collectionKey: string; data: Record<string, unknown> }
const addDocCalls: AddDocCall[] = []
const updateDocCalls: Record<string, unknown>[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    addDocCalls.push({ collectionKey: col.__key, data })
    return Promise.resolve({ id: `mock-${addDocCalls.length}` })
  }),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
    updateDocCalls.push(data)
    return Promise.resolve()
  }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  hoursCollection: vi.fn(() => ({ __key: 'hours' })),
}))

vi.mock('../../../core/firebase/upload', () => ({
  generateFilename: vi.fn((ext: string) => `file.${ext}`),
  // Echo the filename so each upload yields a distinct download URL.
  uploadArtifactFile: vi.fn((_fam: string, _id: string, _file: unknown, filename: string) =>
    Promise.resolve({ downloadUrl: `https://x/${filename}` }),
  ),
}))

// Interactive stub: parent staging exposes a button that commits a batch of
// photos via onCaptureBatch; the single onCapture path remains available.
vi.mock('../../../components/PhotoCapture', () => ({
  default: ({
    onCaptureBatch,
    onCapture,
  }: {
    onCaptureBatch?: (files: File[]) => void
    onCapture?: (file: File) => void
  }) => (
    <div data-testid="photo-capture">
      <button
        data-testid="commit-multi-photos"
        onClick={() =>
          onCaptureBatch?.([
            new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
            new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
            new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
          ])
        }
      >
        commit batch
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
} = {}) {
  addDocCalls.length = 0
  updateDocCalls.length = 0
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

// MUI renders a hidden select input plus a clickable button. Read the
// visible value off the hidden input by name.
function getActivityNameInput(): HTMLInputElement {
  return screen.getByLabelText(/^what is this\?$/i) as HTMLInputElement
}
function getDurationInput(): HTMLInputElement {
  return screen.getByLabelText(/duration in minutes/i) as HTMLInputElement
}

describe('UnifiedCaptureCard (parent variant)', () => {
  it('renders preset chips, free-form fields, and media tabs', () => {
    renderCard()
    expect(screen.getByText(/Quick logs/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lego build/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zoo \/ museum trip/i })).toBeInTheDocument()
    expect(getActivityNameInput()).toBeInTheDocument()
    expect(getDurationInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^note$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /photo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /audio/i })).toBeInTheDocument()
  })

  it('renders Creative and Active group captions with their chips', () => {
    renderCard()
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

  it('helper text uses the active child name with no duration', () => {
    renderCard()
    expect(
      screen.getByText(/Counts toward Lincoln's school hours/i),
    ).toBeInTheDocument()
  })

  it("substitutes London's name when London is the active child", () => {
    renderCard({ selectedChildId: 'london' })
    expect(
      screen.getByText(/Counts toward London's school hours/i),
    ).toBeInTheDocument()
  })

  it('tapping a preset pre-fills activity name, category, and duration', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    expect(getActivityNameInput().value).toBe('Lego build')
    expect(getDurationInput().value).toBe('45')
    expect(screen.getByText(/Will log 45 minutes to Practical Arts/i)).toBeInTheDocument()
  })

  it('tapping the same preset again de-selects and clears the three fields', () => {
    renderCard()
    const lego = screen.getByRole('button', { name: /Lego build/i })
    fireEvent.click(lego)
    fireEvent.click(lego)
    expect(getActivityNameInput().value).toBe('')
    expect(getDurationInput().value).toBe('')
    expect(
      screen.getByText(/Counts toward Lincoln's school hours/i),
    ).toBeInTheDocument()
  })

  it('Zoo trip preset suggests 120 minutes', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    expect(getDurationInput().value).toBe('120')
    expect(screen.getByText(/Will log 120 minutes to Science/i)).toBeInTheDocument()
  })

  it('clamps duration > 240 to 240', () => {
    renderCard()
    fireEvent.change(getDurationInput(), { target: { value: '500' } })
    expect(getDurationInput().value).toBe('240')
  })

  it('typing in "What is this?" does not change preset selection', () => {
    renderCard()
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
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => expect(addDocCalls.length).toBe(1))
    expect(addDocCalls[0].collectionKey).toBe('artifacts')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured',
      severity: 'success',
    })
  })

  it('saves hours only when duration is filled and no media', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Zoo \/ museum trip/i }))
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => expect(addDocCalls.length).toBe(1))
    expect(addDocCalls[0].collectionKey).toBe('hours')
    expect(addDocCalls[0].data).toMatchObject({
      childId: 'lincoln',
      date: '2026-05-17',
      minutes: 120,
      subjectBucket: 'Science',
      source: 'unified-capture',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Logged 120 min',
      severity: 'success',
    })
  })

  it('saves both artifact + hours when media and duration are both filled', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), {
      target: { value: 'Built a giant tower' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => expect(addDocCalls.length).toBe(2))
    expect(addDocCalls[0].collectionKey).toBe('artifacts')
    expect(addDocCalls[1].collectionKey).toBe('hours')
    expect(addDocCalls[1].data).toMatchObject({
      minutes: 45,
      subjectBucket: 'PracticalArts',
      source: 'unified-capture',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 45 min logged',
      severity: 'success',
    })
  })

  it('Save Capture is disabled when nothing is filled', () => {
    renderCard()
    const btn = screen.getByRole('button', { name: /save capture/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Add a photo, audio, note, or duration')
  })

  it('resets form (clears chip, fields, returns to Note tab) after save', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => {
      expect(addDocCalls.length).toBe(1)
      expect(getActivityNameInput().value).toBe('')
      expect(getDurationInput().value).toBe('')
    })
    const noteBtn = screen.getByRole('button', { name: /^note$/i })
    expect(noteBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('switching child updates helper text', () => {
    const { rerender } = renderCard()
    expect(screen.getByText(/Counts toward Lincoln's school hours/i)).toBeInTheDocument()
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
    expect(screen.getByText(/Counts toward London's school hours/i)).toBeInTheDocument()
  })

  it('renders the artifacts section with empty state', () => {
    renderCard()
    expect(screen.getByText(/No artifacts logged yet today/i)).toBeInTheDocument()
  })

  it('renders the photo capture component when Photo tab is selected', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /photo/i }))
    expect(screen.getByTestId('photo-capture')).toBeInTheDocument()
  })

  it('renders the audio recorder when Audio tab is selected', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /audio/i }))
    expect(screen.getByTestId('audio-recorder')).toBeInTheDocument()
  })

  it('multi-photo commits ONE artifact with mediaUrls[] and uri === mediaUrls[0]', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /photo/i }))
    fireEvent.click(screen.getByTestId('commit-multi-photos'))

    await waitFor(() => expect(updateDocCalls.length).toBe(1))
    // Exactly ONE artifact doc for the whole batch.
    expect(addDocCalls.filter((c) => c.collectionKey === 'artifacts')).toHaveLength(1)

    const data = updateDocCalls[0] as { uri: string; mediaUrls: string[] }
    expect(Array.isArray(data.mediaUrls)).toBe(true)
    expect(data.mediaUrls.length).toBeGreaterThan(1)
    expect(data.mediaUrls).toHaveLength(3)
    // Distinct URLs (index-prefixed filenames) and cover === first.
    expect(new Set(data.mediaUrls).size).toBe(3)
    expect(data.uri).toBe(data.mediaUrls[0])
  })

  it('audio file upload creates one audio artifact with uri set', async () => {
    const { onSnackMessage } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /audio/i }))
    fireEvent.click(screen.getByTestId('upload-audio-file'))

    await waitFor(() => expect(updateDocCalls.length).toBe(1))
    expect(addDocCalls.filter((c) => c.collectionKey === 'artifacts')).toHaveLength(1)

    const data = updateDocCalls[0] as { uri: string; mediaUrls?: string[] }
    // Extension derived from the uploaded file name (.mp3).
    expect(data.uri).toBe('https://x/file.mp3')
    expect(data.mediaUrls).toEqual(['https://x/file.mp3'])
    expect(onSnackMessage).toHaveBeenCalledWith({ text: 'Captured', severity: 'success' })
  })

  it('hours notes combine activity name and note text', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Reading session/i }))
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), {
      target: { value: 'page 12 of Narnia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => expect(addDocCalls.length).toBe(2))
    const hoursCall = addDocCalls.find((c) => c.collectionKey === 'hours')
    expect(hoursCall?.data).toMatchObject({
      notes: 'Reading session: page 12 of Narnia',
      subjectBucket: 'Reading',
    })
  })

  // Suppress unused import warning
  void within
})

describe('UnifiedCaptureCard (kid variant)', () => {
  function getKidDuration(): HTMLElement {
    return screen.getByTestId('kid-duration-display')
  }

  it('hides the free-form text field and Note tab', () => {
    renderCard({ variant: 'kid' })
    expect(screen.queryByLabelText(/^what is this\?$/i)).not.toBeInTheDocument()
    // Note media tab gone
    expect(screen.queryByRole('button', { name: /^note$/i })).not.toBeInTheDocument()
    // Photo + Audio remain
    expect(screen.getByRole('button', { name: /photo/i })).toBeInTheDocument()
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

  it('disables Save Capture when no chip is selected', () => {
    renderCard({ variant: 'kid' })
    const saveBtn = screen.getByRole('button', { name: /save capture/i })
    expect(saveBtn).toBeDisabled()
    expect(screen.getByText(/tap a chip above/i)).toBeInTheDocument()
  })

  it('saves hours with chip label as activity name and proper subject bucket', async () => {
    const { onSnackMessage } = renderCard({ variant: 'kid' })
    fireEvent.click(screen.getByRole('button', { name: /Lego build/i }))
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => expect(addDocCalls.length).toBe(1))
    expect(addDocCalls[0].collectionKey).toBe('hours')
    expect(addDocCalls[0].data).toMatchObject({
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
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => {
      expect(addDocCalls.length).toBe(1)
      expect(getKidDuration().textContent).toBe('0')
    })
    // No media tab should be selected after reset
    const photoBtn = screen.getByRole('button', { name: /photo/i })
    expect(photoBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('does not render the parent Artifacts section', () => {
    renderCard({ variant: 'kid' })
    expect(screen.queryByText(/No artifacts logged yet today/i)).not.toBeInTheDocument()
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
