import { useCallback, useState } from 'react'
import type { SaveState } from '../../components/SaveIndicator'

/**
 * Shared hook for tracking save-state transitions (idle → saving → saved | error).
 *
 * Usage:
 *   const { saveState, setSaveState, withSave } = useSaveState()
 *   await withSave(() => setDoc(ref, data))
 */
export function useSaveState() {
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const withSave = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSaveState('saving')
    try {
      const result = await fn()
      setSaveState('saved')
      return result
    } catch (err) {
      console.error('Save failed', err)
      setSaveState('error')
      return undefined
    }
  }, [])

  return { saveState, setSaveState, withSave } as const
}
