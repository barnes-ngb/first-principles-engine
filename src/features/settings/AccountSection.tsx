import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAuth } from '../../core/auth/useAuth'

export default function AccountSection() {
  const { user, upgradeToEmail, signIn, signOut } = useAuth()
  const [mode, setMode] = useState<'idle' | 'upgrade' | 'signin'>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isAnonymous = user?.isAnonymous ?? true

  const handleUpgrade = async () => {
    setError(null)
    setSuccess(null)
    try {
      await upgradeToEmail(email, password)
      setSuccess('Account upgraded! Your data is preserved.')
      setMode('idle')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed.')
    }
  }

  const handleSignIn = async () => {
    setError(null)
    setSuccess(null)
    try {
      await signIn(email, password)
      setSuccess('Signed in.')
      setMode('idle')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    }
  }

  const handleSignOut = async () => {
    setError(null)
    setSuccess(null)
    await signOut()
    setSuccess('Signed out. A new anonymous session has started.')
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Account</Typography>
      <Typography color="text.secondary">
        {isAnonymous
          ? 'You are using an anonymous account. Upgrade to keep your data across devices.'
          : `Signed in as ${user?.email ?? 'unknown'}`}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      {mode === 'idle' && (
        <Stack direction="row" spacing={1}>
          {isAnonymous && (
            <>
              <Button variant="contained" size="small" onClick={() => setMode('upgrade')}>
                Create Account
              </Button>
              <Button variant="outlined" size="small" onClick={() => setMode('signin')}>
                Sign In
              </Button>
            </>
          )}
          {!isAnonymous && (
            <Button variant="outlined" size="small" onClick={handleSignOut}>
              Sign Out
            </Button>
          )}
        </Stack>
      )}

      {(mode === 'upgrade' || mode === 'signin') && (
        <Stack spacing={2} sx={{ maxWidth: 360 }}>
          <TextField
            label="Email"
            type="email"
            size="small"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            size="small"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              size="small"
              onClick={mode === 'upgrade' ? handleUpgrade : handleSignIn}
              disabled={!email || !password}
            >
              {mode === 'upgrade' ? 'Create Account' : 'Sign In'}
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setMode('idle')
                setError(null)
              }}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}
