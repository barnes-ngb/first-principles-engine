import { useCallback, useRef, useState } from 'react'
import { addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

import { useAI, TaskType } from '../ai/useAI'
import { compressIfNeeded, compressImage } from '../utils/compressImage'
import { isScanMediaType, unsupportedFormatMessage } from '../utils/scanImageFormat'
import type { ScanMediaType } from '../utils/scanImageFormat'
import { scansCollection } from '../firebase/firestore'
import { storage } from '../firebase/storage'
import { ErrorSource, reportError } from '../observability'
import { ScanDoor, scanFailureNote } from './scanFailureNote'
import type { ScanFailureShape } from './scanFailureNote'
import { readScanAnalysis, ScanFailureKind, SCAN_FAILURE_MESSAGE } from './scanAnalysis'
import { deriveScanContentNote } from '../utils/contentNote'
import type { CaptureContext } from '../utils/contentNote'
import type { ScanRecord, ScanResult } from '../types'

export interface UseScanResult {
  /**
   * Trigger a scan: upload image, call AI, save record.
   *
   * `captureContext` (FEAT-141, optional) is what the app already knows about
   * this photo — the checklist item it was taken against, its subject. It rides
   * along on the SAME analysis call to ground the one-line content note; a
   * caller that has none behaves exactly as before.
   */
  scan: (
    file: File,
    familyId: string,
    childId: string,
    captureContext?: CaptureContext,
  ) => Promise<ScanRecord | null>
  /** Save the user's action (added/skipped) to the scan record. */
  recordAction: (
    familyId: string,
    scanRecord: ScanRecord,
    action: 'added' | 'skipped',
  ) => Promise<void>
  /** Current scan result (latest). */
  scanResult: ScanRecord | null
  /** True while scanning in progress. */
  scanning: boolean
  /** Error from the most recent scan attempt. */
  error: string | null
  /**
   * The most recent failure's message, readable synchronously right after
   * `scan()` resolves (UX-275).
   *
   * `scan` reports a failure by returning `null` and setting `error` — but
   * `error` is React state, so a caller awaiting `scan` in a loop still sees the
   * previous render's value and cannot tell WHY a page failed. The multi-page
   * batch read that stale value and reported "Scan failed" for everything. This
   * is the same message, from a ref, available immediately.
   */
  lastError: () => string | null
  /** Clear the current scan result. */
  clearScan: () => void
}

/*
 * What a parent reads when the analysis did not come back is `scanAnalysis.ts`'s
 * `SCAN_FAILURE_MESSAGE` — one sentence per failure since UX-311, where there
 * used to be one sentence for all four. Deliberately still the app's OWN words:
 * the model's raw text is unbounded and may echo the child's page, so it stays
 * on the scan record and reaches neither the screen nor the error log.
 */

/** Convert a File to a base64-encoded string (data portion only). */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:image/...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Resolve the bytes we will actually send, and the type we will declare for
 * them (UX-278).
 *
 * The old `inferMediaType` guessed `image/jpeg` for anything it did not
 * recognise, so an unreadable format was relabelled and sent. Now: a supported
 * type passes straight through; an unsupported one gets ONE honest conversion
 * attempt — the canvas re-encodes it to JPEG, which is how a small AVIF, or a
 * file the picker handed over with no type at all, still works — and if the
 * browser cannot decode it either (HEIC in Chrome), it is refused BY NAME
 * before any upload or paid API call.
 *
 * `compressImage` resolves with the ORIGINAL blob when the decode fails, so the
 * "still unsupported" branch is a real answer, not a swallowed error.
 */
async function resolveScanUpload(
  file: File,
  compressed: Blob,
): Promise<{ uploadFile: File; mediaType: ScanMediaType; converted: boolean }> {
  // UX-277: `compressImage` renders to a canvas and re-encodes — the bytes that
  // come back are JPEG whatever went in. Read the type off the RETURNED blob,
  // never off the input file. (When nothing was compressed, `compressIfNeeded`
  // returns the original File, so that branch already carries the right type.)
  const asFile = (blob: Blob, type: string): File =>
    blob instanceof File && blob.type === type ? blob : new File([blob], file.name, { type })

  // `converted` means "the bytes we send are not the bytes that were picked" —
  // whichever step re-encoded them. `compressIfNeeded` returns the file ITSELF
  // when it does nothing (under the threshold, or an undecodable image), so
  // identity is the exact test. Reporting only the unsupported-format re-encode
  // here would have a diagnostic read `in=image/png converted=no
  // sent=image/jpeg` — internally inconsistent, on the one path this
  // instrumentation exists to explain (Codex round 1, P2).
  const compressedHere = (compressed as Blob) !== (file as Blob)

  const initialType = compressed.type || file.type
  if (isScanMediaType(initialType)) {
    return {
      uploadFile: asFile(compressed, initialType),
      mediaType: initialType,
      converted: compressedHere,
    }
  }

  const reencoded = await compressImage(compressed, {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 0.85,
  })
  const reencodedType = reencoded.type
  if (isScanMediaType(reencodedType)) {
    return { uploadFile: asFile(reencoded, reencodedType), mediaType: reencodedType, converted: true }
  }

  throw new Error(unsupportedFormatMessage(initialType, file.name))
}

/**
 * @param door which scan surface this hook instance belongs to. Used only to
 *   label a reported failure in Diagnostics (UX-276); it changes no behaviour.
 */
export function useScan(door: ScanDoor = ScanDoor.Unknown): UseScanResult {
  const { chat } = useAI()
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanRecord | null>(null)
  const errorRef = useRef<string | null>(null)

  const scan = useCallback(
    async (
      file: File,
      familyId: string,
      childId: string,
      captureContext?: CaptureContext,
    ): Promise<ScanRecord | null> => {
      setScanning(true)
      setError(null)
      setScanResult(null)
      errorRef.current = null

      // UX-276: what a reported failure will carry about the picture — its
      // shape only. Filled in as we learn it, so a failure at any step reports
      // how far it got. No bytes, no file name, no path.
      const shape: ScanFailureShape = { inputType: file.type, sizeBytes: file.size }

      /**
       * The one path from a caught scan failure to the error log. Every message
       * that reaches it is either the app's own sentence or an exception's, and
       * `reportError` scrubs it again — the model's own text is never passed in.
       */
      const report = (name: string, message: string, stack: string | null): void => {
        void reportError({
          name,
          message: `${scanFailureNote(door, shape)} ${message}`,
          stack,
          route: typeof window !== 'undefined' ? window.location.pathname : null,
          section: door,
          source: ErrorSource.Handled,
        })
      }

      try {
        // 1. Compress large images to stay within CF payload limits (~10MB)
        const compressed = await compressIfNeeded(file, 1_000_000, {
          maxWidth: 2048,
          maxHeight: 2048,
          quality: 0.85,
        })
        // 1b. Resolve the bytes we will send and the type we will declare for
        //     them — converting an unsupported format where we can, refusing it
        //     by name where we can't (UX-277 / UX-278). Before any upload.
        const { uploadFile, mediaType, converted } = await resolveScanUpload(file, compressed)
        shape.converted = converted
        shape.sentType = mediaType

        // 2. Upload the exact bytes we are about to analyse
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const ext = file.name.split('.').pop() ?? 'jpg'
        const storagePath = `families/${familyId}/scans/${ts}.${ext}`
        const storageRef = ref(storage, storagePath)
        await uploadBytes(storageRef, uploadFile)
        const imageUrl = await getDownloadURL(storageRef)

        // 3. Convert compressed image to base64 for the vision API
        const imageBase64 = await fileToBase64(uploadFile)

        // 4. Call the scan Cloud Function
        let response
        try {
          response = await chat({
            familyId,
            childId,
            taskType: TaskType.Scan,
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  imageBase64,
                  mediaType,
                  // FEAT-141: additive; omitted entirely when the caller has none.
                  ...(captureContext && (captureContext.itemLabel || captureContext.subjectBucket)
                    ? { captureContext }
                    : {}),
                }),
              },
            ],
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          throw new Error(`Scan failed — ${msg}`)
        }

        if (!response) {
          throw new Error(
            'Scan failed — no response from AI. The image may be too large or the AI service is temporarily unavailable.',
          )
        }

        // 5. Read the AI response (UX-311).
        //
        // Tolerant about wrapping, strict about shape: the shared
        // `sanitizeAndParseJson` forgives the fences and preamble the prompt
        // asks the model not to use, and a reply is an analysis only if it
        // carries a real `pageType`. See `scanAnalysis.ts` for why "try that
        // page again" was the wrong advice for three of the four failures.
        const outcome = readScanAnalysis(response.message, response.stopReason)
        const results: ScanResult | null = outcome.results
        // The record keeps the model's own text when we could not use it —
        // that is the family's own scan document, and it is the only place the
        // raw reply is ever kept.
        const parseError = results ? undefined : response.message

        // 6. Save to Firestore
        //
        // FEAT-141: the content note is DERIVED from the analysis we already
        // have — no second AI call, no extra latency. Absent stays absent: a
        // scan whose analysis identified nothing writes no field.
        const contentNote = deriveScanContentNote(results)

        const record: ScanRecord = {
          childId,
          imageUrl,
          storagePath,
          results,
          action: 'pending',
          error: parseError,
          createdAt: new Date().toISOString(),
          ...(contentNote ? { contentNote } : {}),
        }

        const docRef = await addDoc(scansCollection(familyId), {
          childId: record.childId,
          imageUrl: record.imageUrl,
          storagePath: record.storagePath,
          results: record.results ?? null,
          action: record.action,
          ...(record.error ? { error: record.error } : {}),
          ...(contentNote ? { contentNote } : {}),
          createdAt: serverTimestamp(),
        } as unknown as ScanRecord)
        record.id = docRef.id

        setScanResult(record)

        // A scan whose analysis could not be parsed is a FAILURE that throws
        // nothing: the record is saved and returned with `results: null`, so it
        // reached neither the error state nor the sink — the certificate door
        // rendered nothing at all and Diagnostics never heard about it. That is
        // "spinner then nothing" arriving by a second route (Codex round 2, P2).
        // The model's own text is NOT what we report or show: it is unbounded
        // free text that may echo the child's page. The record keeps it (that is
        // the family's own scan document); the log and the screen get the app's
        // own sentence.
        if (!results) {
          const message = outcome.message ?? SCAN_FAILURE_MESSAGE[ScanFailureKind.Unreadable]
          errorRef.current = message
          setError(message)
          // UX-311: the log line names WHICH failure it was, from the app's own
          // vocabulary. `outcome.detail` is written by `scanAnalysis` and never
          // carries the model's text.
          report(
            `ScanAnalysis:${outcome.kind ?? ScanFailureKind.Unreadable}`,
            outcome.detail ?? 'analysis response was not usable',
            null,
          )
        }
        return record
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errorRef.current = msg
        setError(msg)
        // UX-276: a caught failure reached no sink — the reporter was wired to
        // uncaught errors only, which is why there was nothing to grab. Send it
        // through the SAME scrubbing path as everything else, carrying the
        // picture's shape and never the picture.
        report(
          err instanceof Error ? err.name : 'Error',
          msg,
          err instanceof Error ? (err.stack ?? null) : null,
        )
        return null
      } finally {
        setScanning(false)
      }
    },
    [chat, door],
  )

  const recordAction = useCallback(
    async (familyId: string, record: ScanRecord, action: 'added' | 'skipped') => {
      if (!record.id) return
      // Update the scan record with the action
      const { doc, updateDoc } = await import('firebase/firestore')
      const docRef = doc(scansCollection(familyId), record.id)
      await updateDoc(docRef, { action })
      setScanResult((prev) => (prev ? { ...prev, action } : prev))
    },
    [],
  )

  const clearScan = useCallback(() => {
    setScanResult(null)
    setError(null)
    errorRef.current = null
  }, [])

  const lastError = useCallback(() => errorRef.current, [])

  return { scan, recordAction, scanResult, scanning, error, lastError, clearScan }
}
