import { createContext } from 'react'
import type { ThemeMode, UserProfile } from '../types/enums'

export interface ProfileState {
  /** The currently selected user profile. */
  profile: UserProfile | null
  /** The active theme mode. */
  themeMode: ThemeMode
  /** Whether the current profile has editing permissions. */
  canEdit: boolean
  /** Select a user profile (persists to localStorage). */
  selectProfile: (profile: UserProfile) => void
  /**
   * Register a veto for a profile change, and get back an unregister.
   *
   * Additive and **neutral**: with no guard registered, `selectProfile`
   * behaves exactly as it always has, so every surface without one is
   * untouched. A guard returns `false` to stop the change and take
   * responsibility for asking the person; returning `true` (or throwing)
   * lets it through.
   *
   * It exists because a profile change is immediate and irreversible from a
   * surface's point of view: `ProfileMenu` switches, the Build Studio unmounts,
   * and an edit the editor had not yet announced is gone. The guard is the only
   * moment at which that work is still intact.
   */
  registerProfileChangeGuard?: (
    guard: (next: UserProfile) => boolean,
  ) => () => void
  /** Change the theme mode (persists to localStorage). */
  setThemeMode: (mode: ThemeMode) => void
  /** Log out of the current profile. */
  logout: () => void
}

export const ProfileContext = createContext<ProfileState | null>(null)
