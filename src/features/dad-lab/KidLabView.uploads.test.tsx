import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child, DadLabReport } from '../../core/types'

// FIX-269 / UX-461 — the kid view, several photos at once.
//
// `PhotoCapture` with `multiple` fires `onCapture` once per file without
// awaiting, so the uploads run concurrently. The reference write used to be the
// WHOLE array built from the `activeLab` the callback closed over, so each one
// to finish overwrote the ones before it and only the last stayed on the
// report. A single `uploading` boolean was cleared by whichever finished first.

const getDocsMock = vi.fn()
const updateDocMock = vi.fn()
const uploadLabArtifactMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({ path: 'dadLabReports/lab-1' })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
}))
vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({}),
  dadLabReportsCollection: () => ({}),
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('./labArtifactUpload', () => ({
  DAD_LAB_REFERENCE_DEADLINE_MS: 30_000,
  uploadLabArtifact: (...args: unknown[]) => uploadLabArtifactMock(...args),
  withDeadline: <T,>(work: Promise<T>) => work,
}))
vi.mock('../../core/observability', () => ({
  ErrorSource: { Handled: 'handled' },
  reportError: vi.fn(),
}))
vi.mock('../../components/ArtifactGallery', () => ({
  default: ({ artifactIds }: { artifactIds: string[] }) => (
    <div data-testid="gallery">{artifactIds.join(',')}</div>
  ),
}))
vi.mock('../../components/AudioRecorder', () => ({ default: () => <div data-testid="audio" /> }))
/** Fires THREE files without awaiting, as `PhotoCapture` does for a multi-pick. */
const THREE_FILES = ['a.jpg', 'b.jpg', 'c.jpg'].map((n) => new File([n], n, { type: 'image/jpeg' }))
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onCapture, uploading }: { onCapture: (f: File) => void; uploading?: boolean }) => (
    <button
      data-testid="photo"
      data-uploading={uploading ? 'yes' : 'no'}
      onClick={() => {
        for (const f of THREE_FILES) onCapture(f)
      }}
    >
      capture
    </button>
  ),
}))

import KidLabView from './KidLabView'

const LONDON: Child = { id: 'c-london', name: 'London', birthdate: '2020-02-20' }
const NOW = '2026-10-23T00:00:00.000Z'
const LAB: DadLabReport = {
  id: 'lab-1',
  date: '2026-10-23',
  weekKey: '2026-W43',
  title: 'Ramp Lab',
  labType: 'science',
  question: 'Which ramp is faster?',
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

interface Deferred {
  resolve: (id: string) => void
  reject: (e: unknown) => void
}

/**
 * A tiny stand-in for the report document, applying Firestore's semantics to
 * the one field these writes touch: `arrayUnion` appends, a plain array replaces.
 */
function makeStore() {
  const fields: Record<string, string[]> = {}
  return {
    fields,
    apply(payload: Record<string, unknown>) {
      for (const [path, value] of Object.entries(payload)) {
        if (!path.endsWith('.artifacts')) continue
        if (value && typeof value === 'object' && '__arrayUnion' in value) {
          const add = (value as { __arrayUnion: string[] }).__arrayUnion
          fields[path] = [...(fields[path] ?? []), ...add.filter((v) => !(fields[path] ?? []).includes(v))]
        } else {
          fields[path] = value as string[]
        }
      }
    },
  }
}

let deferreds: Deferred[]

beforeEach(() => {
  getDocsMock.mockReset()
  getDocsMock
    .mockResolvedValueOnce(snap([LAB]))
    .mockResolvedValueOnce(snap([]))
    .mockResolvedValueOnce(snap([]))
  updateDocMock.mockReset().mockResolvedValue(undefined)
  deferreds = []
  uploadLabArtifactMock.mockReset().mockImplementation(
    () =>
      new Promise<string>((resolve, reject) => {
        deferreds.push({ resolve, reject })
      }),
  )
})

async function captureThree() {
  render(<KidLabView familyId="fam-1" child={LONDON} children={[LONDON]} />)
  await screen.findByText('Ramp Lab')
  // The younger flow renders its own PhotoCapture; fire the first.
  fireEvent.click(screen.getAllByTestId('photo')[0]!)
  await waitFor(() => expect(deferreds).toHaveLength(3))
}

describe('KidLabView — several photos at once all land (FIX-269)', () => {
  it('three concurrent photos all land on the report, whatever order they finish in', async () => {
    await captureThree()
    const store = makeStore()
    updateDocMock.mockImplementation(async (_ref: unknown, payload: Record<string, unknown>) => {
      store.apply(payload)
    })

    // They finish out of order, and the spinner holds until the LAST one.
    await act(async () => deferreds[2]!.resolve('art-c'))
    expect(screen.getAllByTestId('photo')[0]).toHaveAttribute('data-uploading', 'yes')
    await act(async () => deferreds[0]!.resolve('art-a'))
    expect(screen.getAllByTestId('photo')[0]).toHaveAttribute('data-uploading', 'yes')
    await act(async () => deferreds[1]!.resolve('art-b'))
    await waitFor(() =>
      expect(screen.getAllByTestId('photo')[0]).toHaveAttribute('data-uploading', 'no'),
    )

    expect(store.fields['childReports.london.artifacts']?.sort()).toEqual(['art-a', 'art-b', 'art-c'])
    // The page shows all three too: the local copy is appended, not rebuilt.
    const shown = screen.getByTestId('gallery').textContent?.split(',').sort()
    expect(shown).toEqual(['art-a', 'art-b', 'art-c'])
  })

  it('positive control: the old whole-array write, reinstated, loses two of the three', async () => {
    await captureThree()
    const store = makeStore()
    // Each upload's old payload: the closed-over (empty) list plus its own id,
    // written as a plain array. That is exactly what the removed code sent.
    const stale = LAB.childReports.london?.artifacts ?? []
    updateDocMock.mockImplementation(async (_ref: unknown, payload: Record<string, unknown>) => {
      const reinstated: Record<string, unknown> = {}
      for (const [path, value] of Object.entries(payload)) {
        reinstated[path] =
          value && typeof value === 'object' && '__arrayUnion' in value
            ? [...stale, ...(value as { __arrayUnion: string[] }).__arrayUnion]
            : value
      }
      store.apply(reinstated)
    })

    await act(async () => deferreds[2]!.resolve('art-c'))
    await act(async () => deferreds[0]!.resolve('art-a'))
    await act(async () => deferreds[1]!.resolve('art-b'))

    expect(store.fields['childReports.london.artifacts']).toEqual(['art-b'])
  })

  it('a failed photo says so in kid words, and Try again sends the same file', async () => {
    await captureThree()
    await act(async () => deferreds[0]!.reject(Object.assign(new Error('x'), { code: 'unavailable' })))
    expect(await screen.findByText('Your picture did not send.')).toBeInTheDocument()

    const firstFile = (uploadLabArtifactMock.mock.calls[0]![0] as { file: Blob }).file
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(uploadLabArtifactMock).toHaveBeenCalledTimes(4))
    expect((uploadLabArtifactMock.mock.calls[3]![0] as { file: Blob }).file).toBe(firstFile)
    expect(screen.queryByText('Your picture did not send.')).toBeNull()
  })
})
