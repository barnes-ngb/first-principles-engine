/**
 * One Dad Lab capture: the FILE first, then the RECORD, under one deadline
 * (FIX-269 / UX-461).
 *
 * Every Dad Lab handler used to run `addDoc(artifact)` → upload → `updateDoc({uri})`.
 * The record therefore existed before its file did, and a failed upload left an
 * artifact pointing at nothing. That is the export's `artifact-media-missing`
 * row (UX-387). This module reverses the order. The artifact's id is allocated
 * on the client with `doc(collection)`, which writes nothing, and the upload
 * goes to the path that id names (`artifactStoragePath`). Only after the bytes
 * and the download URL are both in hand is the record written, with its `uri`
 * already on it. A failed upload therefore writes no artifact at all.
 *
 * Today's two capture doors use the same old record-first order. They are
 * deliberately left alone by this run and are named in the ledger row.
 *
 * ── The deadline ─────────────────────────────────────────────────────────
 *
 * `DAD_LAB_UPLOAD_DEADLINE_MS` is two minutes, covering the bytes, the URL read
 * and the record write. Dad Lab uploads are a JPEG compressed by `PhotoCapture`
 * or a short `webm` voice clip, so roughly 0.2–2 MB. At 2 MB on a poor phone
 * uplink of about 256 kbps, that takes about a minute. Two minutes allows for
 * that twice over, and it is about as long as a parent will stand watching a
 * spinner before assuming it is broken. The old worst case was three nested
 * retry budgets of about ten minutes each.
 *
 * Firestore writes cannot be cancelled. A `setDoc` that misses the deadline
 * may still be queued and land later, once the device reconnects. For that
 * reason the uploaded file is deleted only when the record write was definitely
 * REJECTED, and never when it only ran out of time. A record that lands late
 * carries its `uri`, so it is complete rather than a file-less row. At worst it
 * is not attached to the report, and the report's attach warning already
 * covers that case.
 */
import { doc, setDoc } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import {
  BoundedUploadError,
  BoundedUploadStop,
  deleteArtifactFile,
  uploadArtifactFileWithDeadline,
} from '../../core/firebase/upload'

/** Overall time for one capture's bytes, URL and record. See the header. */
export const DAD_LAB_UPLOAD_DEADLINE_MS = 120_000

/**
 * Time allowed for the report's reference write after the artifact exists.
 * It is a separate, shorter budget because by then nothing can be lost. A
 * write that misses it is reported as "uploaded but not attached", and Save
 * attaches it.
 */
export const DAD_LAB_REFERENCE_DEADLINE_MS = 30_000

/** The smallest budget the record write ever gets, however late the upload finished. */
const MIN_RECORD_MS = 5_000

/**
 * Race a promise that cannot be cancelled (a Firestore write) against a
 * deadline and an abort signal. The underlying write is NOT stopped; the
 * caller simply stops waiting for it and is told why.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new BoundedUploadError(BoundedUploadStop.Cancelled))
      return
    }
    let settled = false
    const finish = () => {
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (settled) return
      finish()
      reject(new BoundedUploadError(BoundedUploadStop.Cancelled))
    }
    const timer = setTimeout(() => {
      if (settled) return
      finish()
      reject(new BoundedUploadError(BoundedUploadStop.Deadline))
    }, ms)
    signal?.addEventListener('abort', onAbort)
    work.then(
      (value) => {
        if (settled) return
        finish()
        resolve(value)
      },
      (err: unknown) => {
        if (settled) return
        finish()
        reject(err)
      },
    )
  })
}

export interface LabArtifactUpload {
  familyId: string
  /** The artifact record, without `uri`, which is added once the file exists. */
  artifact: Record<string, unknown>
  file: Blob | File
  filename: string
  signal?: AbortSignal
  deadlineMs?: number
  /** Injectable clock, for tests. */
  now?: () => number
}

/** Upload the file, then write the record. Resolves to the new artifact's id. */
export async function uploadLabArtifact({
  familyId,
  artifact,
  file,
  filename,
  signal,
  deadlineMs = DAD_LAB_UPLOAD_DEADLINE_MS,
  now = Date.now,
}: LabArtifactUpload): Promise<string> {
  const startedAt = now()
  // Allocates an id on the client and writes nothing.
  const artifactRef = doc(artifactsCollection(familyId))

  const { downloadUrl, storagePath } = await uploadArtifactFileWithDeadline(
    familyId,
    artifactRef.id,
    file,
    filename,
    { deadlineMs, signal },
  )

  const remaining = Math.max(deadlineMs - (now() - startedAt), MIN_RECORD_MS)
  try {
    await withDeadline(
      setDoc(artifactRef, { ...artifact, uri: downloadUrl } as never),
      remaining,
      signal,
    )
  } catch (err) {
    // Remove the file only when the write was REJECTED. A write that merely
    // missed the deadline (or was walked away from) may still be queued, and
    // deleting its file would turn a late-but-complete record into a broken one.
    if (!(err instanceof BoundedUploadError)) {
      void deleteArtifactFile(storagePath)
    }
    throw err
  }

  return artifactRef.id
}
