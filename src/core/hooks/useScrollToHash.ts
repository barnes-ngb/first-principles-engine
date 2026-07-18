import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Scrolls to the element matching `location.hash` once it exists.
 *
 * Target sections (e.g. the conundrum / chapter cards on Today) render only
 * after async data resolves (weekFocus / bookProgress), so a one-shot
 * `scrollIntoView` on mount misses them. This polls `getElementById` every
 * 150ms (up to 20 attempts, ~3s) and scrolls the first match into view.
 *
 * @param ready gate the scroll until the caller signals it's worth trying
 *   (defaults to `true`); the poll still bails cleanly if nothing appears.
 */
export function useScrollToHash(ready = true) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!ready || !hash) return
    const id = hash.slice(1)
    if (!id) return

    let attempts = 0
    const interval = setInterval(() => {
      attempts += 1
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        clearInterval(interval)
      } else if (attempts >= 20) {
        clearInterval(interval)
      }
    }, 150)

    return () => clearInterval(interval)
  }, [hash, ready])
}
