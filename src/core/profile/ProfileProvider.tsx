import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeMode, UserProfile } from '../types/enums'
import { ProfileContext } from './context'

const PROFILE_KEY = 'fpe_user_profile'
const THEME_KEY = 'fpe_theme_mode'

function readProfile(): UserProfile | null {
  const stored = localStorage.getItem(PROFILE_KEY)
  if (stored === UserProfile.Lincoln || stored === UserProfile.London || stored === UserProfile.Parents) {
    return stored
  }
  return null
}

function readThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === ThemeMode.Family || stored === ThemeMode.Lincoln || stored === ThemeMode.London) {
    return stored
  }
  return ThemeMode.Family
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(readProfile)
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readThemeMode)

  const selectProfile = useCallback((p: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, p)
    setProfile(p)
    // Auto-set theme based on profile
    const autoTheme = p === UserProfile.Lincoln
      ? ThemeMode.Lincoln
      : p === UserProfile.London
        ? ThemeMode.London
        : ThemeMode.Family
    localStorage.setItem(THEME_KEY, autoTheme)
    setThemeModeState(autoTheme)
  }, [])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    localStorage.setItem(THEME_KEY, mode)
    setThemeModeState(mode)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(PROFILE_KEY)
    localStorage.setItem(THEME_KEY, ThemeMode.Family)
    setProfile(null)
    setThemeModeState(ThemeMode.Family)
  }, [])

  const canEdit = profile === UserProfile.Parents

  const value = useMemo(
    () => ({ profile, themeMode, canEdit, selectProfile, setThemeMode, logout }),
    [profile, themeMode, canEdit, selectProfile, setThemeMode, logout],
  )

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}
