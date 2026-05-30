import type { ChatContext } from '../../core/types'
import type { ReflectionSuggestion } from './useShellyChatState'

/**
 * Minimal shape of a `days` doc the reflection heuristics read. Mirrors the
 * fields the effect in {@link useShellyChatFlows} pulled off each day document.
 */
export interface ReflectionDay {
  date: string
  checklist?: Array<{
    completed?: boolean
    engagement?: string
    skipped?: boolean
  }>
}

/**
 * Pure heuristics that turn the last ~14 days of checklist data into up to three
 * data-driven conversation starters. Extracted verbatim from the
 * `loadReflectionData` effect (ARCH-09) so the real branches — frustration,
 * late-week dropoff, high engagement — are unit-testable without Firestore.
 *
 * `chatContext` only ever drives the child's display name; the caller guarantees
 * this runs for `lincoln`/`london` (general has no child, so the effect returns
 * before calling this).
 */
export function computeReflectionSuggestions(
  days: ReflectionDay[],
  chatContext: ChatContext,
): ReflectionSuggestion[] {
  const suggestions: ReflectionSuggestion[] = []
  let totalItems = 0
  let frustrationCount = 0
  let engagedCount = 0
  const dayCompletionMap: Record<string, { total: number; done: number }> = {}

  for (const data of days) {
    const checklist = data.checklist ?? []
    const dayOfWeek = new Date(data.date + 'T12:00:00').getDay()
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]

    if (!dayCompletionMap[dayName]) dayCompletionMap[dayName] = { total: 0, done: 0 }

    for (const item of checklist) {
      totalItems++
      dayCompletionMap[dayName].total++
      if (item.completed) {
        dayCompletionMap[dayName].done++
      }
      if (item.engagement === 'struggled' || item.engagement === 'refused') frustrationCount++
      if (item.engagement === 'engaged') engagedCount++
    }
  }

  // Check for frustration pattern
  if (frustrationCount > 0 && totalItems > 0 && frustrationCount / totalItems > 0.15) {
    const childName = chatContext === 'lincoln' ? 'Lincoln' : 'London'
    suggestions.push({
      label: `${childName} seemed frustrated this week`,
      message: `${childName} seemed frustrated with some activities this week. Based on the engagement data, what should I adjust or try differently?`,
    })
  }

  // Check for late-week completion dropoff
  const thFri = (dayCompletionMap['Thu']?.total ?? 0) + (dayCompletionMap['Fri']?.total ?? 0)
  const thFriDone = (dayCompletionMap['Thu']?.done ?? 0) + (dayCompletionMap['Fri']?.done ?? 0)
  const monTue = (dayCompletionMap['Mon']?.total ?? 0) + (dayCompletionMap['Tue']?.total ?? 0)
  const monTueDone = (dayCompletionMap['Mon']?.done ?? 0) + (dayCompletionMap['Tue']?.done ?? 0)
  if (thFri > 3 && monTue > 3) {
    const lateRate = thFriDone / thFri
    const earlyRate = monTueDone / monTue
    if (earlyRate - lateRate > 0.2) {
      suggestions.push({
        label: 'Completion drops late in the week',
        message: 'I notice completion drops on Thursdays and Fridays. Should I lighten those days or restructure the week?',
      })
    }
  }

  // High engagement note
  if (engagedCount > 0 && totalItems > 0 && engagedCount / totalItems > 0.6) {
    const childName = chatContext === 'lincoln' ? 'Lincoln' : 'London'
    suggestions.push({
      label: `${childName} is doing great this week`,
      message: `${childName} has been really engaged this week! What should I build on? Are there areas to push or stretch?`,
    })
  }

  return suggestions.slice(0, 3)
}
