import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Child, DadLabReport } from '../../core/types'

// ── Mocks ──

// Return the legacy active report for the first getDocs (active query), then
// empty for the planned/completed queries.
const getDocsMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({}),
  dadLabReportsCollection: () => ({}),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: () => 'f.jpg',
  uploadArtifactFile: vi.fn(),
}))

// Stub heavy capture/gallery children — irrelevant to the role/report render.
vi.mock('../../components/ArtifactGallery', () => ({ default: () => <div data-testid="gallery" /> }))
vi.mock('../../components/PhotoCapture', () => ({ default: () => <div data-testid="photo" /> }))
vi.mock('../../components/AudioRecorder', () => ({ default: () => <div data-testid="audio" /> }))

import KidLabView from './KidLabView'

const NOW = new Date().toISOString()

const LINCOLN: Child = { id: 'c-lincoln', name: 'Lincoln' }
const LONDON: Child = { id: 'c-london', name: 'London' }

/** A report in the pre-ARCH-40 shape: legacy role fields + name-keyed childReports. */
const LEGACY_REPORT: DadLabReport = {
  id: 'lab-1',
  date: '2026-07-01',
  weekKey: '2026-W27',
  title: 'Volcano Lab',
  labType: 'science',
  question: 'Why does it erupt?',
  description: '',
  status: 'active',
  lincolnRole: 'Predicts and runs it, then explains to London',
  londonRole: 'Watches and draws the eruption',
  childReports: {
    lincoln: { prediction: 'It will fizz over', artifacts: [] },
    london: { observation: 'It bubbled', artifacts: [] },
  },
  subjectTags: ['Science'],
  createdAt: NOW,
  updatedAt: NOW,
}

function snap(docs: DadLabReport[]) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d })) }
}

function mockLoad(active: DadLabReport | null) {
  getDocsMock.mockReset()
  getDocsMock
    .mockResolvedValueOnce(snap(active ? [active] : [])) // active query
    .mockResolvedValueOnce(snap([])) // planned query
    .mockResolvedValueOnce(snap([])) // completed query
}

describe('KidLabView — legacy-shaped report still renders (ARCH-40)', () => {
  it("renders Lincoln's legacy lincolnRole via normalizeChildRoles", async () => {
    mockLoad(LEGACY_REPORT)
    render(<KidLabView familyId="fam-1" child={LINCOLN} children={[LINCOLN, LONDON]} />)

    // Legacy lincolnRole surfaces even though the doc has no childRoles map.
    expect(
      await screen.findByText('Predicts and runs it, then explains to London'),
    ).toBeInTheDocument()
    // Legacy name-keyed childReports resolves this child's prediction.
    expect(screen.getByDisplayValue('It will fizz over')).toBeInTheDocument()
    // London's role must NOT leak into Lincoln's view.
    expect(screen.queryByText('Watches and draws the eruption')).toBeNull()
  })

  it("renders London's legacy londonRole for the London view", async () => {
    mockLoad(LEGACY_REPORT)
    render(<KidLabView familyId="fam-1" child={LONDON} children={[LINCOLN, LONDON]} />)

    expect(await screen.findByText('Watches and draws the eruption')).toBeInTheDocument()
    // Legacy name-keyed childReports resolves London's observation.
    expect(screen.getByDisplayValue('It bubbled')).toBeInTheDocument()
  })
})
