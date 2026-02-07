import './App.css'
import Typography from '@mui/material/Typography'
import { AuthProvider } from '../core/auth/AuthContext'
import { useAuth } from '../core/auth/useAuth'
import { AppRouter } from './router'

function AuthGate() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <Typography sx={{ p: 4 }} color="text.secondary">
        Loading...
      </Typography>
    )
  }

  return <AppRouter />
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

export default App
