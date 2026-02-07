import { createContext } from 'react'
import type { User } from 'firebase/auth'

export interface AuthState {
  /** Current Firebase user (null while loading). */
  user: User | null
  /** The family ID derived from the user's UID. */
  familyId: string | null
  /** True until the initial auth state is resolved. */
  loading: boolean
  /** Upgrade an anonymous account to email + password. */
  upgradeToEmail: (email: string, password: string) => Promise<void>
  /** Sign in with an existing email + password account. */
  signIn: (email: string, password: string) => Promise<void>
  /** Sign out and re-create an anonymous session. */
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
