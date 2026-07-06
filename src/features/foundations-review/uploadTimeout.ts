// ── Upload extraction timeout (FEAT-61) ──────────────────────────────────
//
// The mid-chat photo upload sends the images to the shared `chat` CF for a vision
// extraction pass. That call had no client-side ceiling — it relied on the Firebase
// callable's 300s timeout, so a slow/stuck request left the "Reading your photo…"
// spinner running for minutes with no honest error. This wraps the extraction call
// in a hard 120s ceiling (well under the CF's 300s, so the client always gets the
// first say) and surfaces a specific timeout so the UI can say "try fewer photos".

/** Thrown by {@link withTimeout} when `work` does not settle before the ceiling. */
export class UploadTimeoutError extends Error {
  constructor(message = 'The upload took too long') {
    super(message)
    this.name = 'UploadTimeoutError'
  }
}

/**
 * Run `work` with a hard `ms` ceiling. On expiry the AbortController is aborted
 * (so a signal-aware `work` may bail early) and the returned promise rejects with
 * an {@link UploadTimeoutError}. A `work` that settles first clears the timer and
 * passes its result/rejection straight through.
 */
export function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new UploadTimeoutError())
    }, ms)
    work(controller.signal).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
