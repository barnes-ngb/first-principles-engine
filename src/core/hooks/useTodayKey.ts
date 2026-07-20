import { useCallback, useEffect, useState } from 'react'

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
 * The first tuple element (the key) is stable across renders within the same
 * day (the setter no-ops when the key is unchanged), so it is safe as a
 * memo/effect dependency. The second element is a stable manual `refresh()` —
 * used to force an immediate re-read after an action that must catch the live
 * day up right away (FEAT-112: a forward-shifted apply advances the live week so
 * the whole page re-keys to the week it just wrote to, instead of waiting for
 * the next focus/tick).
 */
export function useTodayKey(): readonly [string, () => void] {
  const [key, setKey] = useState<string>(() => todayKey())

  const refresh = useCallback(() => {
    const next = todayKey()
    setKey((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    // A foregrounded-but-unfocused tab still needs to roll over at midnight.
    const interval = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(interval)
    }
  }, [refresh])

  return [key, refresh]
}
