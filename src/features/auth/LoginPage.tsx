import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { useAuth } from '../../core/auth/useAuth'
import { getAuthErrorMessage } from '../../core/auth/firebaseAuthErrors'

export default function LoginPage() {
  const { signIn, upgradeToEmail, user } = useAuth()
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || password.length < 6) return
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'create' && user?.isAnonymous) {
        await upgradeToEmail(email, password)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(getAuthErrorMessage(err))
    }
    setSubmitting(false)
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 400, width: '100%' }}>
        <Typography variant="h4" fontWeight={700} textAlign="center">
          First Principles Engine
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          Barnes Family Homeschool
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            required
            helperText={
              password.length > 0 && password.length < 6 ? 'At least 6 characters' : undefined
            }
            error={password.length > 0 && password.length < 6}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting || !email || password.length < 6}
          >
            {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" textAlign="center">
          {mode === 'signin' ? (
            <>
              Need an account?{' '}
              <Button size="small" onClick={() => setMode('create')}>
                Create one
              </Button>
            </>
          ) : (
            <>
              Already have one?{' '}
              <Button size="small" onClick={() => setMode('signin')}>
                Sign in
              </Button>
            </>
          )}
        </Typography>
      </Stack>
    </Box>
  )
}
