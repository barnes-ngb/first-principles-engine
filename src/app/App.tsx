import { useMemo } from 'react'
import './App.css'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import ErrorBoundary from '../components/ErrorBoundary'
import { AuthProvider } from '../core/auth/AuthContext'
import { useAuth } from '../core/auth/useAuth'
import { ProfileProvider } from '../core/profile/ProfileProvider'
import { useProfile } from '../core/profile/useProfile'
import { buildTheme } from './theme'
import { AppRouter } from './router'
import LoginPage from '../features/auth/LoginPage'
import ProfileSelectPage from '../features/login/ProfileSelectPage'
import ErrorReporterSync from '../core/observability/ErrorReporterSync'
import {
  handoffScopeIdentity,
  useHandoffScopeWatch,
} from '../features/shelly-chat/useHandoffScopeWatch'
import { useLibraryReturnIdentityWatch } from '../features/avatar/stonebridge/useLibraryReturnScopeWatch'

/**
 * UX-273's scope observer, mounted ABOVE `AuthGate` and outside the error
 * boundary on purpose.
 *
 * The hand-off keeps two page-session slots (one staged question, one unsent
 * composer) that live in module scope, so the thing that drops them has to
 * outlive every screen that can fill them. Inside the gate — where it started,
 * in `AppShell` — a logout unmounted it and the slots survived: sign back into
 * the same account and Ask AI handed the previous session's private draft back.
 * Here nothing unmounts it, so logout and profile exit are observable.
 *
 * The identity it watches is the one the GATE grants, through
 * `handoffScopeIdentity` — `AuthGate` closes for an anonymous user and
 * `familyId` is the uid, which an anonymous user has, so the uid alone would
 * read a shut gate as an open one. It renders nothing, reads the scope, holds no
 * credential, and never sets a selection.
 */
function HandoffScopeObserver() {
  const { user, loading, familyId } = useAuth()
  const { profile } = useProfile()
  useHandoffScopeWatch(handoffScopeIdentity({ loading, user, familyId }), profile)
  return null
}

/**
 * The Stonebridge → My Books journey's identity observer, mounted here for the
 * same reason as the one above it: the journey is module memory, and the gates
 * below unmount the routed shell on loading, logout and profile exit, so a
 * watcher inside the shell cannot see the scope close. It reads the identity the
 * GATE grants (`handoffScopeIdentity` — `familyId` is a uid an anonymous user
 * also has), renders nothing, sets nothing and writes nothing.
 *
 * Separate from `HandoffScopeObserver` rather than folded into it: two features,
 * two slots, and neither should be able to break the other by changing what it
 * watches. Both contexts are already mounted, so a second reader costs nothing.
 */
function LibraryReturnScopeObserver() {
  const { user, loading, familyId } = useAuth()
  const { profile } = useProfile()
  useLibraryReturnIdentityWatch(handoffScopeIdentity({ loading, user, familyId }), profile)
  return null
}

function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  // If no user or anonymous, show login page
  if (!user || user.isAnonymous) {
    return <LoginPage />
  }

  return <ProfileGate />
}

function ProfileGate() {
  const { profile } = useProfile()

  // ARCH-11: keep the error reporter's context (active child + names to scrub) in
  // sync now that the user is authenticated. ErrorReporterSync renders nothing.
  return (
    <>
      <ErrorReporterSync />
      {!profile ? <ProfileSelectPage /> : <AppRouter />}
    </>
  )
}

function ThemedApp() {
  const { themeMode } = useProfile()
  const theme = useMemo(() => buildTheme(themeMode), [themeMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HandoffScopeObserver />
      <LibraryReturnScopeObserver />
      <ErrorBoundary>
        <AuthGate />
      </ErrorBoundary>
    </ThemeProvider>
  )
}

function App() {
  return (
    <ProfileProvider>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </ProfileProvider>
  )
}

export default App
