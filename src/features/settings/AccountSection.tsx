import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAuth } from '../../core/auth/useAuth'
import { getAuthErrorMessage } from '../../core/auth/firebaseAuthErrors'

export default function AccountSection() {
  const { user, upgradeToEmail, signIn, signOut } = useAuth()
  const [mode, setMode] = useState<'idle' | 'upgrade' | 'signin'>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isAnonymous = user?.isAnonymous ?? true

  const passwordTooShort = password.length > 0 && password.length < 6
  const canSubmit = email.length > 0 && password.length >= 6 && !submitting

  const handleUpgrade = async () => {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      await upgradeToEmail(email, password)
      setSuccess('Account upgraded! Your data is preserved.')
      setMode('idle')
      setEmail('')
      setPassword('')
    } catch (err) {
      const message = getAuthErrorMessage(err)
      // If the email is already in use, hint to switch to sign-in mode.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'auth/email-already-in-use'
      ) {
        setError(message)
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignIn = async () => {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      setSuccess('Signed in.')
      setMode('idle')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = mode === 'upgrade' ? handleUpgrade : handleSignIn

  const handleSignOutClick = () => {
    if (isAnonymous) {
      setConfirmOpen(true)
      return
    }
    handleSignOut()
  }

  const handleSignOut = async () => {
    setConfirmOpen(false)
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
              <Button variant="outlined" size="small" color="warning" onClick={handleSignOutClick}>
                Sign Out
              </Button>
            </>
          )}
          {!isAnonymous && (
            <Button variant="outlined" size="small" onClick={handleSignOutClick}>
              Sign Out
            </Button>
          )}
        </Stack>
      )}

      {(mode === 'upgrade' || mode === 'signin') && (
        <Stack
          component="form"
          spacing={2}
          sx={{ maxWidth: 360 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) handleSubmit()
          }}
        >
          <TextField
            label="Email"
            type="email"
            size="small"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            size="small"
            autoComplete={mode === 'upgrade' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordTooShort}
            helperText={passwordTooShort ? 'Password must be at least 6 characters' : undefined}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              size="small"
              type="submit"
              disabled={!canSubmit}
            >
              {submitting
                ? 'Please wait…'
                : mode === 'upgrade'
                  ? 'Create Account'
                  : 'Sign In'}
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
          {mode === 'upgrade' && (
            <Typography variant="caption" color="text.secondary">
              Already have an account?{' '}
              <Button
                variant="text"
                size="small"
                sx={{ textTransform: 'none', p: 0, minWidth: 'auto' }}
                onClick={() => {
                  setMode('signin')
                  setError(null)
                }}
              >
                Sign in instead
              </Button>
            </Typography>
          )}
          {mode === 'signin' && (
            <Typography variant="caption" color="text.secondary">
              Need an account?{' '}
              <Button
                variant="text"
                size="small"
                sx={{ textTransform: 'none', p: 0, minWidth: 'auto' }}
                onClick={() => {
                  setMode('upgrade')
                  setError(null)
                }}
              >
                Create one
              </Button>
            </Typography>
          )}
        </Stack>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Sign out of anonymous account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are using a temporary anonymous account. Signing out will lose
            access to this family's data. Upgrade to email/password before
            signing out.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setConfirmOpen(false)
              setMode('upgrade')
            }}
          >
            Upgrade account
          </Button>
          <Button onClick={handleSignOut} color="error">
            Sign out anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
