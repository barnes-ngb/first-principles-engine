/**
 * Lightweight performance measurement helpers using the browser Performance API.
 * Logs timing to console in all environments; warns on slow operations.
 */

const SLOW_THRESHOLD_MS = 2000

/**
 * Measure an async operation and log its duration.
 */
export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  const result = await fn()
  const duration = Math.round(performance.now() - start)
  logDuration(label, duration)
  return result
}

/**
 * Start a named sub-step timer. Returns a function to call when the step ends.
 */
export function startStep(label: string): () => number {
  const start = performance.now()
  return () => {
    const duration = Math.round(performance.now() - start)
    logDuration(label, duration)
    return duration
  }
}

function logDuration(label: string, duration: number): void {
  console.log(`[perf] ${label}: ${duration}ms`)
  if (duration > SLOW_THRESHOLD_MS) {
    console.warn(`[perf] ${label} took ${duration}ms — may cause UI jank`)
  }
}
