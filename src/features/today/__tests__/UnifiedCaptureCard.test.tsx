import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import UnifiedCaptureCard from '../UnifiedCaptureCard'
import type { Child } from '../../../core/types'

type AddDocCall = { collectionKey: string; data: Record<string, unknown> }
const addDocCalls: AddDocCall[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    addDocCalls.push({ collectionKey: col.__key, data })
    return Promise.resolve({ id: `mock-${addDocCalls.length}` })
  }),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  hoursCollection: vi.fn(() => ({ __key: 'hours' })),
}))

vi.mock('../../../core/firebase/upload', () => ({
  generateFilename: vi.fn(() => 'file.webm'),
  uploadArtifactFile: vi.fn(() => Promise.resolve({ downloadUrl: 'https://x/y' })),
}))

vi.mock('../../../components/PhotoCapture', () => ({
  default: () => <div data-testid="photo-capture" />,
}))
vi.mock('../../../components/AudioRecorder', () => ({
  default: () => <div data-testid="audio-recorder" />,
}))

const children: Child[] = [
  { id: 'lincoln', name: 'Lincoln' } as Child,
  { id: 'london', name: 'London' } as Child,
]

function renderCard(overrides: { selectedChildId?: string } = {}) {
  addDocCalls.length = 0
  const onSnackMessage = vi.fn()
  const setTodayArtifacts = vi.fn()
  const utils = render(
    <UnifiedCaptureCard
      familyId="fam-1"
      selectedChildId={overrides.selectedChildId ?? 'lincoln'}
      today="2026-05-17"
      weekPlanId="week-1"
      selectableChildren={children}
      todayArtifacts={[]}
      setTodayArtifacts={setTodayArtifacts}
      onSnackMessage={onSnackMessage}
    />,
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

describe('UnifiedCaptureCard', () => {
  it('renders preset chips, free-form fields, and media tabs', () => {
    renderCard()
    expect(screen.getByText(/Quick logs/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lego build/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zoo \/ museum trip/i })).toBeInTheDocument()
    expect(getActivityNameInput()).toBeInTheDocument()
    expect(getDurationInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^note$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^photo$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^audio$/i })).toBeInTheDocument()
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

    await waitFor(() => expect(addDocCalls.length).toBe(1))
    expect(getActivityNameInput().value).toBe('')
    expect(getDurationInput().value).toBe('')
    const noteBtn = screen.getByRole('button', { name: /^note$/i })
    expect(noteBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('switching child updates helper text', () => {
    const { rerender } = renderCard()
    expect(screen.getByText(/Counts toward Lincoln's school hours/i)).toBeInTheDocument()
    rerender(
      <UnifiedCaptureCard
        familyId="fam-1"
        selectedChildId="london"
        today="2026-05-17"
        weekPlanId="week-1"
        selectableChildren={children}
        todayArtifacts={[]}
        setTodayArtifacts={vi.fn()}
        onSnackMessage={vi.fn()}
      />,
    )
    expect(screen.getByText(/Counts toward London's school hours/i)).toBeInTheDocument()
  })

  it('renders the artifacts section with empty state', () => {
    renderCard()
    expect(screen.getByText(/No artifacts logged yet today/i)).toBeInTheDocument()
  })

  it('renders the photo capture component when Photo tab is selected', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /^photo$/i }))
    expect(screen.getByTestId('photo-capture')).toBeInTheDocument()
  })

  it('renders the audio recorder when Audio tab is selected', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /^audio$/i }))
    expect(screen.getByTestId('audio-recorder')).toBeInTheDocument()
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
