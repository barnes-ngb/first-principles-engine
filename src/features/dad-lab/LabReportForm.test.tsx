import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child, DadLabReport } from '../../core/types'

// ── Mocks ──

const addDocMock = vi.fn()
const updateDocMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  doc: vi.fn(() => ({})),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({}),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: (ext: string) => `file.${ext}`,
  uploadArtifactFile: vi.fn(() => Promise.resolve({ downloadUrl: 'https://x/art' })),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

// No arcs — keeps the arc-linkage block out of the way.
vi.mock('./useConceptArcs', () => ({
  useConceptArcs: () => ({ arcs: [], completeStep: vi.fn() }),
}))

// Gallery stub echoes the artifact IDs it was handed so beat items are assertable.
vi.mock('../../components/ArtifactGallery', () => ({
  default: ({ artifactIds }: { artifactIds: string[] }) => (
    <div data-testid="gallery">{artifactIds.join(',')}</div>
  ),
}))

// Capture stubs fire onCapture with a fake file/blob when clicked.
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onCapture }: { onCapture?: (file: File) => void }) => (
    <button onClick={() => onCapture?.(new File(['x'], 'p.jpg'))}>capture-photo</button>
  ),
}))
vi.mock('../../components/AudioRecorder', () => ({
  default: ({ onCapture }: { onCapture: (blob: Blob) => void }) => (
    <button onClick={() => onCapture(new Blob(['x'], { type: 'audio/webm' }))}>capture-audio</button>
  ),
}))

import LabReportForm from './LabReportForm'

const NOW = '2026-07-04T00:00:00.000Z'
const LINCOLN: Child = { id: 'c-lincoln', name: 'Lincoln' }
const LONDON: Child = { id: 'c-london', name: 'London' }
const KIDS = [LINCOLN, LONDON]

/** An active lab ready to be completed — no beats, no legacy content. */
const ACTIVE_REPORT: DadLabReport = {
  id: 'lab-2',
  date: '2026-07-04',
  weekKey: '2026-W27',
  title: 'Ramp Lab',
  labType: 'science',
  question: 'Which ramp is faster?',
  description: '',
  status: 'active',
  childReports: {},
  subjectTags: ['Science'],
  totalMinutes: 60,
  createdAt: NOW,
  updatedAt: NOW,
}

/** A pre-FEAT-56 completed report: legacy per-child fields, no `beats`. */
const LEGACY_REPORT: DadLabReport = {
  id: 'lab-1',
  date: '2026-07-01',
  weekKey: '2026-W27',
  title: 'Volcano Lab',
  labType: 'science',
  question: 'Why does it erupt?',
  description: 'We mixed baking soda and vinegar',
  status: 'complete',
  childReports: {
    lincoln: { prediction: 'It will fizz over', artifacts: [] },
    london: { observation: 'It bubbled', artifacts: [] },
  },
  subjectTags: ['Science'],
  totalMinutes: 60,
  createdAt: NOW,
  updatedAt: NOW,
}

let artCounter = 0

beforeEach(() => {
  artCounter = 0
  addDocMock.mockReset()
  addDocMock.mockImplementation(() => Promise.resolve({ id: `art-${++artCounter}` }))
  updateDocMock.mockReset()
  updateDocMock.mockResolvedValue(undefined)
})

const WRITING_PLACEHOLDER = 'want to write one word? totally optional'

describe('LabReportForm — three-beat capture (FEAT-56)', () => {
  it('round-trips a writing line + a photo tagged to its beat', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    // Three beat cards render (Predict / Try / What we saw), each with a writing line.
    const writingLines = screen.getAllByPlaceholderText(WRITING_PLACEHOLDER)
    expect(writingLines).toHaveLength(3)
    await user.type(writingLines[0], 'it will roll fast')

    // Capture a photo into the first beat (Predict).
    await user.click(screen.getAllByText('capture-photo')[0])
    await waitFor(() => expect(addDocMock).toHaveBeenCalled())

    // The uploaded artifact carries the additive labBeat tag.
    const artifact = addDocMock.mock.calls[0][1] as { labBeat?: string; type?: string }
    expect(artifact.labBeat).toBe('predict')

    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0] as DadLabReport
    expect(saved.beats?.predict.text).toBe('it will roll fast')
    expect(saved.beats?.predict.items).toEqual([{ artifactId: 'art-1', child: 'both' }])
    // Untouched beats stay empty.
    expect(saved.beats?.saw.items).toEqual([])
  })

  it('defaults a captured item to Both and lets a kid chip reassign it', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    // Record audio into the second beat (Try).
    await user.click(screen.getAllByText('capture-audio')[1])
    await waitFor(() => expect(addDocMock).toHaveBeenCalled())

    // The item's attribution toggle appears; reassign Both → Lincoln.
    await user.click(screen.getByRole('button', { name: 'Lincoln' }))
    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0] as DadLabReport
    expect(saved.beats?.try.items).toEqual([{ artifactId: 'art-1', child: 'c-lincoln' }])
  })

  it('treats the writing line as optional — an empty-beat save is not blocked', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    // No writing, no capture — subjects are present (FEAT-55), so save proceeds.
    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0] as DadLabReport
    // Empty beats never write an object.
    expect(saved.beats).toBeUndefined()
    // The writing stretch is never validated — no warning about it, and the
    // FEAT-55 subject-tag warning stays silent because subjects are present.
    expect(screen.queryByText(/won't count toward hours/i)).toBeNull()
  })
})

describe('LabReportForm — legacy report renders unchanged (FEAT-56 additive)', () => {
  it('shows legacy per-child fields, auto-expands the framework, and injects no beat cards', () => {
    render(
      <LabReportForm report={LEGACY_REPORT} children={KIDS} readOnly onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    // Legacy content renders exactly as before (disabled fields).
    expect(screen.getByDisplayValue('It will fizz over')).toBeInTheDocument()
    expect(screen.getByDisplayValue('It bubbled')).toBeInTheDocument()

    // The full framework is auto-expanded for a legacy report (no beats).
    expect(screen.getByText('Scientific Method Framework')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hide full framework/i })).toBeInTheDocument()

    // No three-beat cards are injected on a report that has no beats.
    expect(screen.queryByText('What do we think will happen?')).toBeNull()
    expect(screen.queryByPlaceholderText(WRITING_PLACEHOLDER)).toBeNull()
  })

  it('renders a beat report organized by beat with the framework collapsed', () => {
    const beatReport: DadLabReport = {
      ...LEGACY_REPORT,
      id: 'lab-3',
      childReports: {},
      beats: {
        predict: { text: 'it will fizz', textChild: 'both', items: [{ artifactId: 'art-9', child: 'c-lincoln' }] },
        try: { items: [] },
        saw: { text: 'it erupted', items: [] },
      },
    }
    render(
      <LabReportForm report={beatReport} children={KIDS} readOnly onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    // Beat prompts + text render; the item's gallery shows its artifact id.
    expect(screen.getByText('What do we think will happen?')).toBeInTheDocument()
    expect(screen.getByText('it will fizz')).toBeInTheDocument()
    expect(screen.getByText('it erupted')).toBeInTheDocument()
    expect(screen.getByTestId('gallery')).toHaveTextContent('art-9')

    // Framework is collapsed by default on a beat report.
    expect(screen.getByRole('button', { name: /Show full framework/i })).toBeInTheDocument()
  })
})
