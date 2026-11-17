import { useCallback, useMemo, useRef, useState } from 'react'
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

  /**
   * Vetoes consulted before a profile change. Empty by default, so with no
   * guard registered `selectProfile` is byte-for-byte the behaviour it had.
   */
  const guardsRef = useRef<Array<(next: UserProfile) => boolean>>([])

  const registerProfileChangeGuard = useCallback(
    (guard: (next: UserProfile) => boolean) => {
      guardsRef.current = [...guardsRef.current, guard]
      return () => {
        guardsRef.current = guardsRef.current.filter((g) => g !== guard)
      }
    },
    [],
  )

  const selectProfile = useCallback((p: UserProfile) => {
    // A guard that throws must not be able to lock the app into one profile,
    // so a thrown guard is treated as "no objection".
    for (const guard of guardsRef.current) {
      let allowed = true
      try {
        allowed = guard(p) !== false
      } catch {
        allowed = true
      }
      if (!allowed) return
    }
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
    () => ({
      profile,
      themeMode,
      canEdit,
      selectProfile,
      setThemeMode,
      logout,
      registerProfileChangeGuard,
    }),
    [
      profile,
      themeMode,
      canEdit,
      selectProfile,
      setThemeMode,
      logout,
      registerProfileChangeGuard,
    ],
  )

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}
