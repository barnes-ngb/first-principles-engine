import { useCallback, useSyncExternalStore } from 'react'

// ── Flag keys ────────────────────────────────────────────────────

export const AIFeatureFlag = {
  AiPlanning: 'ai_planning',
} as const
export type AIFeatureFlag = (typeof AIFeatureFlag)[keyof typeof AIFeatureFlag]

export const AIFeatureFlagLabel: Record<AIFeatureFlag, string> = {
  [AIFeatureFlag.AiPlanning]: 'AI-Powered Planning',
}

export const AIFeatureFlagDescription: Record<AIFeatureFlag, string> = {
  [AIFeatureFlag.AiPlanning]:
    'Route planner-chat through the Cloud Function for AI-generated plans instead of local logic.',
}

// ── Storage ──────────────────────────────────────────────────────

const STORAGE_PREFIX = 'fpe_ai_flag_'

function storageKey(flag: AIFeatureFlag): string {
  return `${STORAGE_PREFIX}${flag}`
}

export function getAIFeatureFlag(flag: AIFeatureFlag): boolean {
  return localStorage.getItem(storageKey(flag)) === 'true'
}

export function setAIFeatureFlag(flag: AIFeatureFlag, enabled: boolean): void {
  localStorage.setItem(storageKey(flag), String(enabled))
  // Notify any listeners (useSyncExternalStore subscribers)
  window.dispatchEvent(new StorageEvent('storage', { key: storageKey(flag) }))
}

// ── React hook ───────────────────────────────────────────────────

function subscribe(callback: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === null || e.key?.startsWith(STORAGE_PREFIX)) {
      callback()
    }
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

function getSnapshot(): string {
  return Object.values(AIFeatureFlag)
    .map((flag) => `${flag}:${localStorage.getItem(storageKey(flag)) ?? 'false'}`)
    .join(',')
}

export function useAIFeatureFlags() {
  useSyncExternalStore(subscribe, getSnapshot)

  const isEnabled = useCallback(
    (flag: AIFeatureFlag): boolean => getAIFeatureFlag(flag),
    [],
  )

  const setEnabled = useCallback(
    (flag: AIFeatureFlag, enabled: boolean): void => setAIFeatureFlag(flag, enabled),
    [],
  )

  const aiPlanningEnabled = getAIFeatureFlag(AIFeatureFlag.AiPlanning)

  return { isEnabled, setEnabled, aiPlanningEnabled } as const
}
