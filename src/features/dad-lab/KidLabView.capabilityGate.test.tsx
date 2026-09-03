import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Child, DadLabReport } from '../../core/types'

// FEAT-183 / ARCH-42 (B1 + B14) — the kid lab view picks its capture flow on
// the child's age group, and writes artifacts under the child's DOC ID.
//
// Before: `isLincoln = childName === 'Lincoln'` chose the scientific-method
// flow, and `childId: childKey` wrote the lowercase NAME onto every artifact.
// A third child got the younger flow because of his name; every kid's lab
// artifacts were invisible to `where('childId','==', child.id)` readers.

const getDocsMock = vi.fn()
/** Typed arity so the artifact payload can be read back off `mock.calls`. */
const addDocMock = vi.fn(
  async (col: unknown, data: unknown) => ({ id: 'artifact-1', col, data }),
)
const updateDocMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  addDoc: (col: unknown, data: unknown) => addDocMock(col, data),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({ __col: 'artifacts' }),
  dadLabReportsCollection: () => ({ __col: 'dadLabReports' }),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: () => 'f.jpg',
  uploadArtifactFile: vi.fn(async () => ({ downloadUrl: 'https://example/f.jpg' })),
}))

vi.mock('../../components/ArtifactGallery', () => ({ default: () => <div data-testid="gallery" /> }))
vi.mock('../../components/AudioRecorder', () => ({ default: () => <div data-testid="audio" /> }))
// A PhotoCapture stub that lets a test fire a real capture.
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onCapture }: { onCapture: (f: File) => void }) => (
    <button
      data-testid="photo"
      onClick={() => onCapture(new File(['x'], 'drawing.jpg', { type: 'image/jpeg' }))}
    >
      capture
    </button>
  ),
}))

import KidLabView from './KidLabView'

const NOW = new Date().toISOString()

/** Real birthdates, so the assertions don't lean on the canonical-name seed. */
const LINCOLN: Child = { id: 'c-lincoln', name: 'Lincoln', birthdate: '2015-09-30' }
const LONDON: Child = { id: 'c-london', name: 'London', birthdate: '2020-02-20' }
/** The third child the name key could never serve: older, differently named. */
const ROWAN: Child = { id: 'c-rowan', name: 'Rowan', birthdate: '2015-04-04' }
/** ...and his younger counterpart. */
const MAEVE: Child = { id: 'c-maeve', name: 'Maeve', birthdate: '2020-04-04' }

const FAMILY = [LINCOLN, LONDON, ROWAN, MAEVE]

const SCIENCE_LAB: DadLabReport = {
  id: 'lab-1',
  date: '2026-09-01',
  weekKey: '2026-W36',
  title: 'Volcano Lab',
  labType: 'science',
  question: 'Why does it erupt?',
  description: '',
  status: 'active',
  childReports: {},
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
    .mockResolvedValueOnce(snap(active ? [active] : []))
    .mockResolvedValueOnce(snap([]))
    .mockResolvedValueOnce(snap([]))
}

/** The framework flow's own heading — present only on the older branch. */
const FRAMEWORK_MARKER = 'Step 1: THE QUESTION'
/** The voice+draw flow's own heading — present only on the younger branch. */
const VOICE_DRAW_MARKER = 'What did you see?'

async function renderFor(child: Child) {
  mockLoad(SCIENCE_LAB)
  render(<KidLabView familyId="fam-1" child={child} children={FAMILY} />)
  await screen.findByText('Volcano Lab')
}

describe('KidLabView — the capture flow follows the age group, not the name (B1)', () => {
  it('gives an older, differently-named child the framework flow', async () => {
    await renderFor(ROWAN)
    expect(screen.getByText(FRAMEWORK_MARKER)).toBeInTheDocument()
    expect(screen.queryByText(VOICE_DRAW_MARKER)).toBeNull()
  })

  it('gives a younger, differently-named child the voice + draw flow', async () => {
    await renderFor(MAEVE)
    expect(screen.getByText(VOICE_DRAW_MARKER)).toBeInTheDocument()
    expect(screen.queryByText(FRAMEWORK_MARKER)).toBeNull()
  })

  it('leaves Lincoln on the framework flow he has today', async () => {
    await renderFor(LINCOLN)
    expect(screen.getByText(FRAMEWORK_MARKER)).toBeInTheDocument()
    expect(screen.queryByText(VOICE_DRAW_MARKER)).toBeNull()
  })

  it('leaves London on the voice + draw flow he has today', async () => {
    await renderFor(LONDON)
    expect(screen.getByText(VOICE_DRAW_MARKER)).toBeInTheDocument()
    expect(screen.queryByText(FRAMEWORK_MARKER)).toBeNull()
  })
})

describe('KidLabView — captures are keyed by child doc id (B14)', () => {
  it('writes the artifact with child.id, never the lowercase name', async () => {
    addDocMock.mockClear()
    await renderFor(LONDON)

    // The younger branch's PhotoCapture; the "Capture My Work" card renders
    // its own too, so fire the first one and read the artifact it wrote.
    fireEvent.click(screen.getAllByTestId('photo')[0]!)
    await vi.waitFor(() => expect(addDocMock).toHaveBeenCalled())

    const written = addDocMock.mock.calls[0]![1] as unknown as { childId: string }
    expect(written.childId).toBe('c-london')
    expect(written.childId).not.toBe('london')
  })
})
