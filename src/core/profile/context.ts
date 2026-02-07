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
  /** Change the theme mode (persists to localStorage). */
  setThemeMode: (mode: ThemeMode) => void
  /** Log out of the current profile. */
  logout: () => void
}

export const ProfileContext = createContext<ProfileState | null>(null)
