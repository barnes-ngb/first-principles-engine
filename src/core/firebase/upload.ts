import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from 'firebase/storage'
import { storage } from './storage'

/** Maximum number of upload attempts before giving up. */
const MAX_RETRIES = 3

/** Base delay between retries in milliseconds (doubles each attempt). */
const BASE_DELAY_MS = 1000

/** Firebase Storage error codes that will never succeed on retry. */
const NON_RETRYABLE_CODES = new Set([
  'storage/unauthorized',
  'storage/unauthenticated',
  'storage/bucket-not-found',
  'storage/invalid-argument',
  'storage/invalid-checksum',
  'storage/canceled',
])

function isRetryable(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return !NON_RETRYABLE_CODES.has((error as { code: string }).code)
  }
  return true
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface UploadResult {
  downloadUrl: string
  storagePath: string
}

/**
 * Upload a file (Blob/File) to Firebase Storage with exponential-backoff retries.
 *
 * Storage path: `families/{familyId}/artifacts/{artifactId}/{filename}`
 *
 * Returns the download URL and the storage path.
 * Non-retryable errors (permissions, bad arguments) are thrown immediately.
 */
/**
 * Where an artifact's file lands. Deterministic, and exported so a caller can
 * know the path BEFORE the upload resolves (Codex round 3).
 *
 * `uploadArtifactFile` does `uploadBytes` and then `getDownloadURL`: if the
 * bytes land and the URL lookup then fails, an object exists at this path while
 * the caller holds nothing to clean up. A rollback that can only register paths
 * it was handed back would leave that object behind and still report a clean
 * failure.
 */
export function artifactStoragePath(
  familyId: string,
  artifactId: string,
  filename: string,
): string {
  return `families/${familyId}/artifacts/${artifactId}/${filename}`
}

export async function uploadArtifactFile(
  familyId: string,
  artifactId: string,
  file: Blob | File,
  filename: string,
): Promise<UploadResult> {
  const storagePath = artifactStoragePath(familyId, artifactId, filename)
  const storageRef = ref(storage, storagePath)

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)
      return { downloadUrl, storagePath }
    } catch (error) {
      if (!isRetryable(error)) {
        throw error
      }
      lastError = error
      if (attempt < MAX_RETRIES - 1) {
        await wait(BASE_DELAY_MS * 2 ** attempt)
      }
    }
  }

  throw lastError
}

// ── Bounded upload (FIX-269 / UX-461, opt-in) ─────────────────────────────
//
// `uploadArtifactFile` above has no deadline of its own. `uploadBytes` hands a
// stalled upload to the SDK, which keeps retrying it for its default
// `maxUploadRetryTime` (10 minutes in `@firebase/storage` 0.14.2, and nothing in
// `src/` changes it), and the loop above then makes up to three such attempts.
// On a weak connection that is about half an hour of spinner, and the caller
// has nothing it can cancel.
//
// The function below is the bounded alternative, and it is OPT-IN: Dad Lab
// is its only caller. Today's capture, strands, books, the planner, the avatar
// page and the conundrum response keep calling `uploadArtifactFile` and behave
// exactly as before. Changing their behaviour is a decision for each of those
// surfaces, and each one has its own failure handling to update.

/** Why a bounded upload stopped without a file. Codes are ours, not the SDK's. */
export const BoundedUploadStop = {
  /** The deadline passed first. On a phone that means a slow connection. */
  Deadline: 'upload/deadline',
  /** The caller's signal aborted: a person tapped Cancel. */
  Cancelled: 'upload/cancelled',
} as const
export type BoundedUploadStop = (typeof BoundedUploadStop)[keyof typeof BoundedUploadStop]

/** The rejection a bounded upload uses when it stops on its own terms. */
export class BoundedUploadError extends Error {
  readonly code: BoundedUploadStop
  constructor(code: BoundedUploadStop) {
    super(code === BoundedUploadStop.Deadline ? 'Upload ran out of time' : 'Upload cancelled')
    this.name = 'BoundedUploadError'
    this.code = code
  }
}

export interface BoundedUploadOptions {
  /** Total time for the bytes AND the download-URL read, in milliseconds. */
  deadlineMs: number
  /** Aborting this cancels the upload task itself rather than abandoning it. */
  signal?: AbortSignal
}

/**
 * Best-effort removal of an uploaded object. It never throws, because it only
 * ever runs on a path that is already reporting another failure.
 */
export async function deleteArtifactFile(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath))
  } catch (err) {
    console.warn('[upload] could not remove an abandoned upload', err)
  }
}

/**
 * Upload one artifact file under ONE overall deadline, cancellable.
 *
 * It uses `uploadBytesResumable` because that returns a task that can be
 * cancelled. Racing a `setTimeout` against `uploadBytes` would report a
 * timeout while the bytes kept uploading in the background, and could still
 * create the object after the caller had said nothing was saved. There is one
 * attempt, and the SDK's own retries happen inside it. When the deadline passes
 * or the signal aborts, the task is cancelled and the promise rejects with a
 * `BoundedUploadError`.
 *
 * If the bytes land and the download-URL read then misses the deadline or the
 * abort, the object is deleted best-effort before rejecting. Otherwise a file
 * would exist that no record points to.
 */
export function uploadArtifactFileWithDeadline(
  familyId: string,
  artifactId: string,
  file: Blob | File,
  filename: string,
  { deadlineMs, signal }: BoundedUploadOptions,
): Promise<UploadResult> {
  const storagePath = artifactStoragePath(familyId, artifactId, filename)
  const storageRef = ref(storage, storagePath)

  return new Promise<UploadResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new BoundedUploadError(BoundedUploadStop.Cancelled))
      return
    }

    let settled = false
    let bytesLanded = false
    const task = uploadBytesResumable(storageRef, file)

    const stop = (code: BoundedUploadStop) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (bytesLanded) {
        void deleteArtifactFile(storagePath)
      } else {
        task.cancel()
      }
      reject(new BoundedUploadError(code))
    }
    const onAbort = () => stop(BoundedUploadStop.Cancelled)
    const timer = setTimeout(() => stop(BoundedUploadStop.Deadline), deadlineMs)
    signal?.addEventListener('abort', onAbort)

    task.then(
      async () => {
        if (settled) return
        bytesLanded = true
        try {
          const downloadUrl = await getDownloadURL(storageRef)
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          resolve({ downloadUrl, storagePath })
        } catch (err) {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          void deleteArtifactFile(storagePath)
          reject(err)
        }
      },
      (err: unknown) => {
        // A cancel we asked for has already settled the promise.
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

/**
 * Generate a safe filename from a timestamp and extension.
 */
export function generateFilename(extension: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `${ts}.${extension}`
}
