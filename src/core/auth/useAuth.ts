import { useContext } from 'react'
import { AuthContext } from './context'
import type { AuthState } from './context'

export type { AuthState }

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/** Returns the authenticated user's family ID (their UID). Throws if not yet authenticated. */
export function useFamilyId(): string {
  const { familyId } = useAuth()
  if (!familyId) throw new Error('useFamilyId: no authenticated user')
  return familyId
}
