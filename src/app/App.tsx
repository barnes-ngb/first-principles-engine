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
