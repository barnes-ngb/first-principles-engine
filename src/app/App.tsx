import { useMemo } from 'react'
import './App.css'
import CssBaseline from '@mui/material/CssBaseline'
import Typography from '@mui/material/Typography'
import { ThemeProvider } from '@mui/material/styles'
import { AuthProvider } from '../core/auth/AuthContext'
import { useAuth } from '../core/auth/useAuth'
import { ProfileProvider } from '../core/profile/ProfileProvider'
import { useProfile } from '../core/profile/useProfile'
import { buildTheme } from './theme'
import { AppRouter } from './router'
import ProfileSelectPage from '../features/login/ProfileSelectPage'

function AuthGate() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <Typography sx={{ p: 4 }} color="text.secondary">
        Loading...
      </Typography>
    )
  }

  return <ProfileGate />
}

function ProfileGate() {
  const { profile } = useProfile()

  if (!profile) {
    return <ProfileSelectPage />
  }

  return <AppRouter />
}

function ThemedApp() {
  const { themeMode } = useProfile()
  const theme = useMemo(() => buildTheme(themeMode), [themeMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthGate />
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
