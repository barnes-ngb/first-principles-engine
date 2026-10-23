import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child, DadLabReport } from '../../core/types'

// ── Mocks ──

/** The artifact record write. Since FIX-269 it is a `setDoc` on a client-allocated id, AFTER the file. */
const setDocMock = vi.fn()
const updateDocMock = vi.fn()
/** `uploadBytesResumable` — returns a fake task (see `makeTask`). */
const uploadTaskMock = vi.fn()
const deleteObjectMock = vi.fn()

let artCounter = 0

// Refs are tagged with their collection path so the tests can tell the report-doc
// reference write apart from the artifact record write (UX-82). `doc(coll)` with
// no id allocates one, as the real SDK does.
vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  doc: vi.fn((coll: { path?: string }, id?: string) => ({
    path: coll?.path,
    id: id ?? `art-${++artCounter}`,
  })),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
}))

// The REAL bounded upload (`core/firebase/upload.ts`) runs over a mocked Storage
// SDK, so the deadline and Cancel below exercise the code that ships.
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: vi.fn(),
  uploadBytesResumable: (...args: unknown[]) => uploadTaskMock(...args),
  getDownloadURL: () => Promise.resolve('https://x/art'),
  deleteObject: (...args: unknown[]) => deleteObjectMock(...args),
}))

const reportErrorMock = vi.fn()
vi.mock('../../core/observability', () => ({
  ErrorSource: { Handled: 'handled' },
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}))

/**
 * A fake `UploadTask`: thenable, cancellable. `settle` decides how it ends;
 * `'hang'` never ends on its own, which is the owner's case.
 */
function makeTask(settle: 'ok' | 'hang' | Error = 'ok') {
  let rejectTask!: (e: unknown) => void
  let resolveTask!: () => void
  const p = new Promise<void>((resolve, reject) => {
    resolveTask = resolve
    rejectTask = reject
  })
  if (settle === 'ok') resolveTask()
  else if (settle instanceof Error) rejectTask(settle)
  p.catch(() => {})
  return {
    then: (f: () => unknown, r: (e: unknown) => unknown) => p.then(f, r),
    cancel: vi.fn(() => rejectTask(Object.assign(new Error('canceled'), { code: 'storage/canceled' }))),
    release: () => resolveTask(),
  }
}

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({ path: 'artifacts' }),
  dadLabReportsCollection: () => ({ path: 'dadLabReports' }),
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
import { DAD_LAB_UPLOAD_DEADLINE_MS } from './labArtifactUpload'

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

beforeEach(() => {
  artCounter = 0
  setDocMock.mockReset()
  setDocMock.mockResolvedValue(undefined)
  updateDocMock.mockReset()
  updateDocMock.mockResolvedValue(undefined)
  uploadTaskMock.mockReset()
  uploadTaskMock.mockImplementation(() => makeTask('ok'))
  deleteObjectMock.mockReset()
  deleteObjectMock.mockResolvedValue(undefined)
  reportErrorMock.mockReset()
})

const WRITING_PLACEHOLDER = 'want to write one word? totally optional'

describe('LabReportForm — three-beat capture (FEAT-56)', () => {
  it('round-trips a writing line + a photo tagged to its beat', async () => {
    const user = userEvent.setup({ delay: null })
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
    await waitFor(() => expect(setDocMock).toHaveBeenCalled())

    // The uploaded artifact carries the additive labBeat tag.
    const artifact = setDocMock.mock.calls[0][1] as { labBeat?: string; type?: string; uri?: string }
    // File before record (FIX-269): the record is written once, already carrying its file.
    expect(artifact.uri).toBe('https://x/art')
    expect(artifact.labBeat).toBe('predict')

    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0] as DadLabReport
    expect(saved.beats?.predict.text).toBe('it will roll fast')
    expect(saved.beats?.predict.items).toEqual([{ artifactId: 'art-1', child: 'both' }])
    // Untouched beats stay empty.
    expect(saved.beats?.saw.items).toEqual([])
  }, 20000)

  it('defaults a captured item to Both and lets a kid chip reassign it', async () => {
    const user = userEvent.setup({ delay: null })
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    // Record audio into the second beat (Try).
    await user.click(screen.getAllByText('capture-audio')[1])
    await waitFor(() => expect(setDocMock).toHaveBeenCalled())

    // The item's attribution toggle appears; reassign Both → Lincoln.
    await user.click(screen.getByRole('button', { name: 'Lincoln' }))
    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0] as DadLabReport
    expect(saved.beats?.try.items).toEqual([{ artifactId: 'art-1', child: 'c-lincoln' }])
  }, 20000)

  it('treats the writing line as optional — an empty-beat save is not blocked', async () => {
    const user = userEvent.setup({ delay: null })
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
  }, 20000)
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

// ── UX-82: an upload must never orphan ──────────────────────────
// The repro (Nathan, 2026-08-23): upload an image to a completed lab, tap
// "Use Photo", leave without Save — the artifact doc + storage file exist, the
// report doc never gains the reference. The fix: on a SAVED report (`report.id`
// exists) every upload writes its reference into the report doc immediately, as
// a narrow update touching only the reference field — KidLabView's own pattern.

/** updateDoc calls that hit the report doc (not the artifact `uri` write). */
const reportUpdates = () =>
  updateDocMock.mock.calls.filter(
    ([ref]) => (ref as { path?: string })?.path === 'dadLabReports',
  )

describe('LabReportForm — uploads to a saved report persist immediately (UX-82)', () => {
  it('writes a beat upload into the report doc with NO Save tapped', async () => {
    const user = userEvent.setup({ delay: null })
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    // Capture a photo into the first beat (Predict) — and stop there. No Save.
    await user.click(screen.getAllByText('capture-photo')[0])
    await waitFor(() => expect(reportUpdates().length).toBeGreaterThan(0))

    const [ref, payload] = reportUpdates()[0] as [
      { path: string; id: string },
      Record<string, unknown>,
    ]
    expect(ref.id).toBe('lab-2')
    expect(payload['beats.predict.items']).toEqual({
      __arrayUnion: [{ artifactId: 'art-1', child: 'both' }],
    })
    expect(onSave).not.toHaveBeenCalled()
  }, 20000)

  it('the reference write is narrow — only the reference field and updatedAt move', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    // Per-child capture lives behind "Show full framework".
    await user.click(screen.getByRole('button', { name: /Show full framework/i }))
    // Beats render 3 photo buttons first; the per-child sections follow.
    await user.click(screen.getAllByText('capture-photo')[3])
    await waitFor(() => expect(reportUpdates().length).toBeGreaterThan(0))

    const [, payload] = reportUpdates()[0] as [unknown, Record<string, unknown>]
    // Completed labs carry hours-audit data (subjectTags, totalMinutes, status…)
    // — nothing but the one reference field and the updatedAt stamp may move.
    expect(Object.keys(payload).sort()).toEqual([
      'childReports.lincoln.artifacts',
      'updatedAt',
    ])
    expect(payload['childReports.lincoln.artifacts']).toEqual({
      __arrayUnion: ['art-1'],
    })
  }, 20000)

  it('surfaces a failed reference write — the artifact is not silently lost', async () => {
    const user = userEvent.setup({ delay: null })
    // The artifact record write succeeds; the report reference write fails.
    updateDocMock.mockImplementation((ref: { path?: string }) =>
      ref?.path === 'dadLabReports'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(undefined),
    )
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    await user.click(screen.getAllByText('capture-photo')[0])

    // The failure is said out loud, and the upload survives in the beat card
    // (local state still carries it, so Save can attach it).
    expect(await screen.findByText(/couldn't be attached/i)).toBeInTheDocument()
    expect(screen.getByTestId('gallery')).toHaveTextContent('art-1')
  }, 20000)

  it('a never-saved report stays draft and warns that uploads are not attached', async () => {
    const user = userEvent.setup({ delay: null })
    // No `id`: there is no doc to reference — draft state is correct, but the
    // form must say so. (Unreachable via DadLabPage today — every report it
    // passes carries a doc id — asserted here so the branch stays honest.)
    const unsaved: DadLabReport = { ...ACTIVE_REPORT, id: undefined }
    render(
      <LabReportForm report={unsaved} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    await user.click(screen.getAllByText('capture-photo')[0])
    await waitFor(() => expect(setDocMock).toHaveBeenCalled())

    expect(reportUpdates()).toHaveLength(0)
    expect(
      await screen.findByText(/aren't attached yet — save the report/i),
    ).toBeInTheDocument()
  }, 20000)

  it('disables Save while an upload is in flight — the full-doc Save must never race a reference write (Codex P1)', async () => {
    const user = userEvent.setup({ delay: null })
    const task = makeTask('hang')
    uploadTaskMock.mockImplementation(() => task)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    await user.click(screen.getAllByText('capture-photo')[0])

    // Mid-upload: the commit button is disabled and says why. A Save here would
    // capture state from before the upload landed and its setDoc would clobber
    // the narrow reference write.
    const btn = await screen.findByRole('button', { name: 'Uploading...' })
    expect(btn).toBeDisabled()

    await act(async () => {
      task.release()
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled(),
    )
  }, 20000)

  it('the read-only completed view offers no upload affordance at all', () => {
    // The Step-0 decision, asserted: a disabled form must not render a
    // working-looking upload that quietly discards (the UX-33 class). Capture
    // lives only in the editable views, where it now persists immediately.
    render(
      <LabReportForm report={LEGACY_REPORT} children={KIDS} readOnly onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.queryByText('capture-photo')).toBeNull()
    expect(screen.queryByText('capture-audio')).toBeNull()
  })
})

// UX-83 — a Save that rejects used to leave the parent believing the lab was
// written: `useSaveState.withSave` catches, logs to the console, and flips to
// 'error', and nothing rendered that state. The form already survives a failure
// (the page only navigates on a resolved promise) — but silently, which is the
// same class of dishonesty UX-82's attach alert closed.
describe('LabReportForm — a failed Save says so (UX-83)', () => {
  it('surfaces the failure, keeps the form open, and clears nothing', async () => {
    const user = userEvent.setup({ delay: null })
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    // Type into the beat writing line so there is unsaved work to lose.
    const writingLines = screen.getAllByPlaceholderText(WRITING_PLACEHOLDER)
    await user.type(writingLines[0], 'it will roll fast')

    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())

    // Said out loud, right above Save — what failed, that nothing was lost.
    expect(await screen.findByText(/didn't save/i)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was lost/i)).toBeInTheDocument()

    // The form is still here, with every field the parent filled in.
    expect(screen.getByDisplayValue('Ramp Lab')).toBeInTheDocument()
    expect(screen.getByDisplayValue('it will roll fast')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled()
  }, 20000)

  it('a retry that succeeds saves the state that was held, and drops the alert', async () => {
    const user = userEvent.setup({ delay: null })
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    const writingLines = screen.getAllByPlaceholderText(WRITING_PLACEHOLDER)
    await user.type(writingLines[0], 'it will roll fast')

    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))
    expect(await screen.findByText(/didn't save/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))

    // The retry carried the same work — nothing was dropped by the failure.
    const saved = onSave.mock.calls[1][0] as DadLabReport
    expect(saved.beats?.predict.text).toBe('it will roll fast')
    await waitFor(() => expect(screen.queryByText(/didn't save/i)).toBeNull())
  }, 20000)

  it('a successful Save is unchanged — no alert, and the report is handed up once', async () => {
    const user = userEvent.setup({ delay: null })
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={onSave} onCancel={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: 'Complete Lab' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    expect(screen.queryByText(/didn't save/i)).toBeNull()
    expect((onSave.mock.calls[0][0] as DadLabReport).title).toBe('Ramp Lab')
  }, 20000)

  it('the read-only view never shows the Save-failure alert', () => {
    // Same `!disabled` gate as the attach alerts — a view with no Save button
    // must not carry a message about Save.
    render(
      <LabReportForm report={LEGACY_REPORT} children={KIDS} readOnly onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.queryByText(/didn't save/i)).toBeNull()
  })
})

// ── FIX-269 / UX-461: an upload ends, one way or the other ─────────────────
// Owner, 2026-10-23: the parent lab report "spun and never finished". One hung
// upload held Save disabled for as long as the SDK kept retrying (about half an
// hour), with no Cancel and no sentence. These run the REAL bounded upload over
// a Storage task that never ends.

/** Flush pending promise work under fake timers. */
const flush = () => act(async () => {})

describe('LabReportForm — every upload ends (FIX-269)', () => {
  it('a never-resolving upload ends at the deadline, says so, and releases Save', async () => {
    vi.useFakeTimers()
    try {
      const task = makeTask('hang')
      uploadTaskMock.mockImplementation(() => task)
      render(
        <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
      )
      act(() => {
        screen.getAllByText('capture-photo')[0].click()
      })
      await flush()

      expect(screen.getByRole('button', { name: 'Uploading...' })).toBeDisabled()
      expect(screen.getByText('Uploading the photo for Predict…')).toBeInTheDocument()

      // Positive control on the boundary: a second early, still held.
      await act(() => vi.advanceTimersByTimeAsync(DAD_LAB_UPLOAD_DEADLINE_MS - 1000))
      expect(screen.getByRole('button', { name: 'Uploading...' })).toBeDisabled()

      await act(() => vi.advanceTimersByTimeAsync(1000))
      await flush()

      expect(task.cancel).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled()
      expect(
        screen.getByText(/The photo for Predict ran out of time on a slow connection\. Nothing was saved\./),
      ).toBeInTheDocument()
      // File before record: no artifact document was written for a file that never arrived.
      expect(setDocMock).not.toHaveBeenCalled()
      expect(reportUpdates()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Cancel stops the upload itself and releases Save — and is not reported as an error', async () => {
    const user = userEvent.setup({ delay: null })
    const task = makeTask('hang')
    uploadTaskMock.mockImplementation(() => task)
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    await user.click(screen.getAllByText('capture-photo')[0])
    await user.click(await screen.findByRole('button', { name: 'Cancel upload' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled())
    expect(task.cancel).toHaveBeenCalledTimes(1)
    expect(screen.getByText('The photo for Predict was cancelled. Nothing was saved.')).toBeInTheDocument()
    expect(setDocMock).not.toHaveBeenCalled()
    expect(reportErrorMock).not.toHaveBeenCalled()
  }, 20000)

  it('a failed upload leaves no artifact, renders its sentence, and Try again re-sends the SAME file', async () => {
    const user = userEvent.setup({ delay: null })
    uploadTaskMock.mockImplementationOnce(() =>
      makeTask(Object.assign(new Error('nope'), { code: 'storage/retry-limit-exceeded' })),
    )
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    await user.click(screen.getAllByText('capture-photo')[0])

    expect(
      await screen.findByText("The photo for Predict didn't upload. Nothing was saved."),
    ).toBeInTheDocument()
    expect(setDocMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled()

    // The sink hears the SHAPE: handler, type, size, elapsed, code. Never the
    // lab's title or a child's name.
    expect(reportErrorMock).toHaveBeenCalledTimes(1)
    const reported = reportErrorMock.mock.calls[0][0] as { message: string; source: string }
    expect(reported.source).toBe('handled')
    expect(reported.message).toMatch(/^dad-lab upload failed handler=parent-beat /)
    expect(reported.message).toMatch(/code=storage\/retry-limit-exceeded$/)
    expect(reported.message).not.toMatch(/Ramp|Lincoln|London|p\.jpg/)

    const firstFile = uploadTaskMock.mock.calls[0][1]
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))
    expect(uploadTaskMock).toHaveBeenCalledTimes(2)
    expect(uploadTaskMock.mock.calls[1][1]).toBe(firstFile)
    expect(screen.queryByText(/didn't upload/)).toBeNull()
    // A retry is a fresh capture under a fresh id. The failed attempt's id
    // (art-1) was allocated on the client and never written.
    expect(screen.getByTestId('gallery')).toHaveTextContent('art-2')
  }, 20000)

  it('the in-flight count neither sticks above zero nor goes below it', async () => {
    const user = userEvent.setup({ delay: null })
    const tasks = [makeTask('hang'), makeTask('hang'), makeTask('hang')]
    let n = 0
    uploadTaskMock.mockImplementation(() => tasks[n++])
    render(
      <LabReportForm report={ACTIVE_REPORT} children={KIDS} completing onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    // Two uploads at once, to two beats.
    await user.click(screen.getAllByText('capture-photo')[0])
    await user.click(screen.getAllByText('capture-photo')[1])
    expect(await screen.findAllByRole('button', { name: 'Cancel upload' })).toHaveLength(2)

    // One cancelled: the other is still in the air, so Save stays held.
    await user.click(screen.getAllByRole('button', { name: 'Cancel upload' })[0])
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Cancel upload' })).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Uploading...' })).toBeDisabled()

    // The other lands: released exactly once.
    await act(async () => {
      tasks[1].release()
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled())

    // A later upload holds Save again — had the count gone negative, a single
    // upload would read as zero and Save would wrongly stay live.
    await user.click(screen.getAllByText('capture-photo')[2])
    expect(await screen.findByRole('button', { name: 'Uploading...' })).toBeDisabled()
    await act(async () => {
      tasks[2].release()
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete Lab' })).toBeEnabled())
  }, 20000)
})
