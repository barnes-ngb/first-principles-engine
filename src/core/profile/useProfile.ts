import { useContext } from 'react'
import { ProfileContext } from './context'
import type { ProfileState } from './context'

export type { ProfileState }

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider')
  return ctx
}
