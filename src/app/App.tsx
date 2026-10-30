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
import { useHandoffScopeWatch } from '../features/shelly-chat/useHandoffScopeWatch'

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
 * It renders nothing, reads the scope, and never sets a selection.
 */
function HandoffScopeObserver() {
  const { familyId } = useAuth()
  const { profile } = useProfile()
  useHandoffScopeWatch(familyId ?? '', profile)
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
