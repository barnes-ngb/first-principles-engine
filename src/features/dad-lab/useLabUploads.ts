/**
 * Keeps track of a Dad Lab surface's uploads so that each one ends visibly
 * (FIX-269 / UX-461).
 *
 * A surface hands this hook a `runner`, its own "upload this and attach it"
 * function, and calls `start(job)` for each capture. The hook does what the
 * five handlers used to leave undone:
 *
 * - **It counts in-flight uploads as a LIST, not a number.** `pending` is the
 *   list's length, and an entry is removed in `finally` whatever happens, so
 *   the count can never go below zero or stay above it. A success, a failure,
 *   a timeout and a Cancel all release it the same way.
 * - **Every upload can be cancelled.** Each one gets its own `AbortController`,
 *   and `cancel(id)` aborts it. The bounded upload cancels the Storage task
 *   itself rather than abandoning it in the background.
 * - **A failure is kept, together with the file.** It stays on screen until
 *   dismissed, and `retry(id)` runs the SAME job again (the same `Blob`), so a
 *   parent never has to pick the photo again.
 * - **A handled failure reaches the sink as its shape only** (handler, type,
 *   size, elapsed, code; see `labUploadFailureNote`). A Cancel is not reported,
 *   because it is a person's choice and not an error.
 *
 * Retry calls the latest `runner`, which is held in a ref, so a retry writes
 * under the form's current title and keys rather than the ones from the
 * failed attempt.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { ErrorSource, reportError } from '../../core/observability'
import {
  classifyLabUploadFailure,
  errorCode,
  LabUploadFailure,
  labUploadFailureNote,
  type LabUploadHandler,
  type LabUploadSubject,
} from './labUploadCopy'

export interface LabUploadJob<T> {
  subject: LabUploadSubject
  handler: LabUploadHandler
  /** The bytes, held so that Try again re-sends this exact file. */
  file: Blob
  /** Whatever the runner needs to know where the upload belongs. */
  target: T
}

export interface LabUploadInFlight<T> {
  id: number
  job: LabUploadJob<T>
}

export interface LabUploadFailed<T> {
  id: number
  job: LabUploadJob<T>
  failure: LabUploadFailure
}

export type LabUploadRunner<T> = (job: LabUploadJob<T>, signal: AbortSignal) => Promise<void>

export function useLabUploads<T>(runner: LabUploadRunner<T>) {
  const [inFlight, setInFlight] = useState<LabUploadInFlight<T>[]>([])
  const [failures, setFailures] = useState<LabUploadFailed<T>[]>([])
  const seq = useRef(0)
  const controllers = useRef(new Map<number, AbortController>())
  const runnerRef = useRef(runner)
  useEffect(() => {
    runnerRef.current = runner
  }, [runner])

  const start = useCallback(async (job: LabUploadJob<T>): Promise<void> => {
    const id = ++seq.current
    const controller = new AbortController()
    controllers.current.set(id, controller)
    setInFlight((prev) => [...prev, { id, job }])
    const startedAt = Date.now()
    try {
      await runnerRef.current(job, controller.signal)
    } catch (err) {
      const failure = classifyLabUploadFailure(err)
      if (failure !== LabUploadFailure.Cancelled) {
        console.error('[dad-lab] upload did not finish', err)
        void reportError({
          name: 'DadLabUploadFailed',
          message: labUploadFailureNote({
            handler: job.handler,
            failure,
            type: job.file.type,
            sizeBytes: job.file.size,
            elapsedMs: Date.now() - startedAt,
            code: errorCode(err),
          }),
          stack: null,
          route: typeof window !== 'undefined' ? window.location.pathname : null,
          section: 'dad-lab-upload',
          source: ErrorSource.Handled,
        })
      }
      setFailures((prev) => [...prev, { id, job, failure }])
    } finally {
      controllers.current.delete(id)
      setInFlight((prev) => prev.filter((u) => u.id !== id))
    }
  }, [])

  const cancel = useCallback((id: number) => {
    controllers.current.get(id)?.abort()
  }, [])

  const dismiss = useCallback((id: number) => {
    setFailures((prev) => prev.filter((f) => f.id !== id))
  }, [])

  /** Clear the failure and send the same job, and the same bytes, again. */
  const retry = useCallback(
    (failed: LabUploadFailed<T>) => {
      setFailures((prev) => prev.filter((f) => f.id !== failed.id))
      void start(failed.job)
    },
    [start],
  )

  return { inFlight, failures, pending: inFlight.length, start, cancel, dismiss, retry }
}
