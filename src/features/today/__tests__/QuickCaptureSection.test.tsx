import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import QuickCaptureSection from '../QuickCaptureSection'
import type { Child } from '../../../core/types'

type AddDocCall = { collectionKey: string; data: Record<string, unknown> }
const addDocCalls: AddDocCall[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(
    (col: { __key: string }, data: Record<string, unknown>) => {
      addDocCalls.push({ collectionKey: col.__key, data })
      return Promise.resolve({ id: `mock-${addDocCalls.length}` })
    },
  ),
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

function renderSection(overrides: { selectedChildId?: string } = {}) {
  addDocCalls.length = 0
  const onSnackMessage = vi.fn()
  const utils = render(
    <QuickCaptureSection
      familyId="fam-1"
      selectedChildId={overrides.selectedChildId ?? 'lincoln'}
      today="2026-05-17"
      weekPlanId="week-1"
      selectableChildren={children}
      todayArtifacts={[]}
      setTodayArtifacts={vi.fn()}
      onSnackMessage={onSnackMessage}
    />,
  )
  return { ...utils, onSnackMessage }
}

describe('QuickCaptureSection — duration field', () => {
  it('renders the duration field with helper text using the active child name', () => {
    renderSection()
    expect(
      screen.getByLabelText(/duration in minutes/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Counts toward Lincoln's school hours/i),
    ).toBeInTheDocument()
  })

  it("substitutes London's name when London is the active child", () => {
    renderSection({ selectedChildId: 'london' })
    expect(
      screen.getByText(/Counts toward London's school hours/i),
    ).toBeInTheDocument()
  })

  it('updates helper text live to "Will log N minutes to {bucket}"', () => {
    renderSection()
    const input = screen.getByLabelText(/duration in minutes/i)
    fireEvent.change(input, { target: { value: '20' } })
    expect(screen.getByText(/Will log 20 minutes to Reading/i)).toBeInTheDocument()
  })

  it('clamps values > 240 to 240', () => {
    renderSection()
    const input = screen.getByLabelText(/duration in minutes/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '300' } })
    expect(input.value).toBe('240')
    expect(screen.getByText(/Will log 240 minutes to Reading/i)).toBeInTheDocument()
  })

  it('saves artifact only when duration is empty (Note tab)', async () => {
    const { onSnackMessage } = renderSection()
    fireEvent.change(screen.getByLabelText(/^content$/i), {
      target: { value: 'Lincoln drew a castle' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => {
      expect(addDocCalls.length).toBe(1)
    })
    expect(addDocCalls[0].collectionKey).toBe('artifacts')
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured',
      severity: 'success',
    })
  })

  it('writes both artifact and hours entry when duration > 0', async () => {
    const { onSnackMessage } = renderSection()
    fireEvent.change(screen.getByLabelText(/^content$/i), {
      target: { value: 'Reading session' },
    })
    fireEvent.change(screen.getByLabelText(/duration in minutes/i), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save capture/i }))

    await waitFor(() => {
      expect(addDocCalls.length).toBe(2)
    })
    expect(addDocCalls[0].collectionKey).toBe('artifacts')
    expect(addDocCalls[1].collectionKey).toBe('hours')
    expect(addDocCalls[1].data).toMatchObject({
      childId: 'lincoln',
      date: '2026-05-17',
      minutes: 30,
      subjectBucket: 'Reading',
      source: 'quick-capture',
    })
    expect(onSnackMessage).toHaveBeenCalledWith({
      text: 'Captured + 30 min logged',
      severity: 'success',
    })
  })

  it('disables Save Capture when duration is filled but child is unset', () => {
    renderSection({ selectedChildId: '' })
    fireEvent.change(screen.getByLabelText(/duration in minutes/i), {
      target: { value: '15' },
    })
    const btn = screen.getByRole('button', { name: /save capture/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Pick a child and subject first')
  })
})
