import { useCallback, useEffect, useMemo, useRef } from 'react'

/**
 * Returns a debounced version of `fn`.
 * The returned function resets the timer on each call; `fn` is only
 * invoked once the caller stops calling for `delay` ms.
 */
export function useDebounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)

  // Keep fnRef up-to-date without triggering the lint rule about
  // assigning .current during render — use an effect instead.
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const debounced = useCallback(
    (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        fnRef.current(...args)
        timerRef.current = null
      }, delay)
    },
    [delay],
  )

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useMemo(() => debounced, [debounced])
}
