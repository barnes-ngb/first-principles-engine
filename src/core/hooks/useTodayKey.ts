import { useEffect, useState } from 'react'

import { todayKey } from '../utils/dateKey'

/**
 * Return today's `YYYY-MM-DD` key, refreshing when the tab regains focus,
 * becomes visible again, or a minute ticks over.
 *
 * This exists because phone-first use means the Plan My Week tab is rarely
 * closed — a tab opened on one day is still open the next. A plain
 * `useMemo(() => …, [])` computed at mount freezes stale (FEAT-112: a tab
 * opened Saturday carried the past week's key into Sunday/Monday). Keying
 * date-derived memos on this value forces them to recompute the moment the
 * calendar day changes under an open tab.
 *
 * The returned identity is stable across renders within the same day (the
 * setter no-ops when the key is unchanged), so it is safe as a memo/effect
 * dependency.
 */
export function useTodayKey(): string {
  const [key, setKey] = useState<string>(() => todayKey())

  useEffect(() => {
    const refresh = () => {
      const next = todayKey()
      setKey((prev) => (prev === next ? prev : next))
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    // A foregrounded-but-unfocused tab still needs to roll over at midnight.
    const interval = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(interval)
    }
  }, [])

  return key
}
