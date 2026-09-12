import type { DraftDayPlan } from '../../core/types'

/** Apply a manual edit to visible rows and the same IDs in a shaped day's restoration stash. */
export function editDraftDayItems(day: DraftDayPlan, items: DraftDayPlan['items']): DraftDayPlan {
  if (!day.setAsideItems) return { ...day, items }
  const before = new Set(day.items.map(item => item.id))
  const after = new Map(items.map(item => [item.id, item]))
  const stashed = new Set(day.setAsideItems.map(item => item.id))
  // Hidden Full-day rows survive unchanged. Visible rows follow deletion and field edits.
  const retained = day.setAsideItems.flatMap(item => {
    if (!before.has(item.id)) return [item]
    const edited = after.get(item.id)
    return edited ? [edited] : []
  })
  // Reorder the shared rows in their existing slots without moving hidden rows.
  const ordered = items.filter(item => before.has(item.id) && stashed.has(item.id))
  let slot = 0
  return {
    ...day,
    items,
    setAsideItems: [
      ...retained.map(item => before.has(item.id) ? ordered[slot++] : item),
      ...items.filter(item => !before.has(item.id) && !stashed.has(item.id)),
    ],
  }
}
