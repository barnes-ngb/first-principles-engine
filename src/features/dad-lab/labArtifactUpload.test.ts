import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// FIX-269 / UX-461 — one Dad Lab capture, file before record, under one deadline.
// The REAL `uploadArtifactFileWithDeadline` runs here over a mocked Storage SDK.

const uploadTaskMock = vi.fn()
const deleteObjectMock = vi.fn()
const getDownloadURLMock = vi.fn()
const setDocMock = vi.fn()

vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: vi.fn(),
  uploadBytesResumable: (...args: unknown[]) => uploadTaskMock(...args),
  getDownloadURL: (...args: unknown[]) => getDownloadURLMock(...args),
  deleteObject: (...args: unknown[]) => deleteObjectMock(...args),
}))
vi.mock('firebase/firestore', () => ({
  doc: (_c: unknown, id?: string) => ({ id: id ?? 'art-new' }),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))
vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({ path: 'artifacts' }),
}))

import {
  BoundedUploadError,
  BoundedUploadStop,
  uploadArtifactFileWithDeadline,
} from '../../core/firebase/upload'
import { DAD_LAB_UPLOAD_DEADLINE_MS, uploadLabArtifact, withDeadline } from './labArtifactUpload'

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

const FILE = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
const PATH = 'families/fam/artifacts/art-new/f.jpg'

beforeEach(() => {
  uploadTaskMock.mockReset()
  deleteObjectMock.mockReset().mockResolvedValue(undefined)
  getDownloadURLMock.mockReset().mockResolvedValue('https://x/f.jpg')
  setDocMock.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('uploadArtifactFileWithDeadline — one deadline, and it really cancels', () => {
  it('a never-resolving upload ends AT the deadline, and the task is cancelled, not abandoned', async () => {
    vi.useFakeTimers()
    const task = makeTask('hang')
    uploadTaskMock.mockReturnValue(task)
    const outcome = uploadArtifactFileWithDeadline('fam', 'a1', FILE, 'f.jpg', { deadlineMs: 1000 }).then(
      () => 'resolved',
      (e: unknown) => e,
    )

    // Positive control on the boundary: one millisecond early, still running.
    await vi.advanceTimersByTimeAsync(999)
    expect(task.cancel).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    const err = await outcome
    expect(err).toBeInstanceOf(BoundedUploadError)
    expect((err as BoundedUploadError).code).toBe(BoundedUploadStop.Deadline)
    expect(task.cancel).toHaveBeenCalledTimes(1)
  })

  it('an abort cancels the task and rejects as Cancelled', async () => {
    const task = makeTask('hang')
    uploadTaskMock.mockReturnValue(task)
    const controller = new AbortController()
    const outcome = uploadArtifactFileWithDeadline('fam', 'a1', FILE, 'f.jpg', {
      deadlineMs: 60_000,
      signal: controller.signal,
    }).catch((e: unknown) => e)
    controller.abort()
    const err = (await outcome) as BoundedUploadError
    expect(err.code).toBe(BoundedUploadStop.Cancelled)
    expect(task.cancel).toHaveBeenCalledTimes(1)
  })

  it('bytes that landed but whose URL missed the deadline are removed, so no file is left unclaimed', async () => {
    vi.useFakeTimers()
    uploadTaskMock.mockReturnValue(makeTask('ok'))
    getDownloadURLMock.mockReturnValue(new Promise(() => {}))
    const outcome = uploadArtifactFileWithDeadline('fam', 'a1', FILE, 'f.jpg', { deadlineMs: 500 }).catch(
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(500)
    expect(((await outcome) as BoundedUploadError).code).toBe(BoundedUploadStop.Deadline)
    expect(deleteObjectMock).toHaveBeenCalledWith({ fullPath: 'families/fam/artifacts/a1/f.jpg' })
  })

  it('a successful upload resolves with its URL and path, and leaves nothing armed', async () => {
    vi.useFakeTimers()
    const task = makeTask('ok')
    uploadTaskMock.mockReturnValue(task)
    const result = await uploadArtifactFileWithDeadline('fam', 'a1', FILE, 'f.jpg', { deadlineMs: 500 })
    expect(result).toEqual({ downloadUrl: 'https://x/f.jpg', storagePath: 'families/fam/artifacts/a1/f.jpg' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(task.cancel).not.toHaveBeenCalled()
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })
})

describe('uploadLabArtifact — the file first, then the record', () => {
  it('writes ONE record, after the file, already carrying its uri', async () => {
    uploadTaskMock.mockReturnValue(makeTask('ok'))
    const id = await uploadLabArtifact({
      familyId: 'fam',
      artifact: { childId: 'c-1', type: 'Photo' },
      file: FILE,
      filename: 'f.jpg',
    })
    expect(id).toBe('art-new')
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(setDocMock.mock.calls[0][1]).toEqual({ childId: 'c-1', type: 'Photo', uri: 'https://x/f.jpg' })
    // The upload went to the path the pre-allocated id names.
    expect(uploadTaskMock.mock.calls[0][0]).toEqual({ fullPath: PATH })
  })

  it('a failed upload writes NO artifact document', async () => {
    uploadTaskMock.mockReturnValue(makeTask(Object.assign(new Error('nope'), { code: 'storage/unauthorized' })))
    await expect(
      uploadLabArtifact({ familyId: 'fam', artifact: {}, file: FILE, filename: 'f.jpg' }),
    ).rejects.toMatchObject({ code: 'storage/unauthorized' })
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('a timed-out upload writes NO artifact document either', async () => {
    vi.useFakeTimers()
    uploadTaskMock.mockReturnValue(makeTask('hang'))
    const outcome = uploadLabArtifact({ familyId: 'fam', artifact: {}, file: FILE, filename: 'f.jpg' }).catch(
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(DAD_LAB_UPLOAD_DEADLINE_MS)
    expect(((await outcome) as BoundedUploadError).code).toBe(BoundedUploadStop.Deadline)
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('a REJECTED record write removes the uploaded file (best effort)', async () => {
    uploadTaskMock.mockReturnValue(makeTask('ok'))
    setDocMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    await expect(
      uploadLabArtifact({ familyId: 'fam', artifact: {}, file: FILE, filename: 'f.jpg' }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
    expect(deleteObjectMock).toHaveBeenCalledWith({ fullPath: PATH })
  })

  it('a record write that only RAN OUT OF TIME keeps the file, since it may still land', async () => {
    vi.useFakeTimers()
    uploadTaskMock.mockReturnValue(makeTask('ok'))
    setDocMock.mockReturnValue(new Promise(() => {}))
    const outcome = uploadLabArtifact({
      familyId: 'fam',
      artifact: {},
      file: FILE,
      filename: 'f.jpg',
      deadlineMs: 10_000,
    }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(((await outcome) as BoundedUploadError).code).toBe(BoundedUploadStop.Deadline)
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })
})

describe('withDeadline', () => {
  it('passes a value through, and an abort rejects as Cancelled', async () => {
    await expect(withDeadline(Promise.resolve(3), 100)).resolves.toBe(3)
    const c = new AbortController()
    const p = withDeadline(new Promise(() => {}), 10_000, c.signal)
    c.abort()
    await expect(p).rejects.toMatchObject({ code: BoundedUploadStop.Cancelled })
  })
})
