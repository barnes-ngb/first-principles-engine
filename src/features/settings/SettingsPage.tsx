import { type SyntheticEvent, useState } from 'react'
import { Alert, Button, Divider, Snackbar, Stack, Typography } from '@mui/material'

import { useFamilyId } from '../../core/auth/useAuth'
import { seedDemoFamily } from '../../core/data/seed'
import AccountSection from './AccountSection'

type SnackbarState = {
  open: boolean
  severity: 'success' | 'error'
  message: string
}

const defaultSnackbarState: SnackbarState = {
  open: false,
  severity: 'success',
  message: '',
}

export default function SettingsPage() {
  const familyId = useFamilyId()
  const [snackbar, setSnackbar] = useState<SnackbarState>(defaultSnackbarState)

  const handleSeedDemoData = async () => {
    try {
      await seedDemoFamily(familyId)
      setSnackbar({
        open: true,
        severity: 'success',
        message: 'Demo data seeded.',
      })
    } catch (error) {
      console.error('Failed to seed demo data', error)
      setSnackbar({
        open: true,
        severity: 'error',
        message: 'Unable to seed demo data.',
      })
    }
  }

  const handleCloseSnackbar = (
    _event?: SyntheticEvent | Event,
    reason?: string,
  ) => {
    if (reason === 'clickaway') {
      return
    }

    setSnackbar((prev) => ({ ...prev, open: false }))
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Stack spacing={1}>
        <Typography variant="h4">Settings</Typography>
      </Stack>
      <AccountSection />
      <Divider />
      <Stack spacing={1}>
        <Typography color="text.secondary">
          Use the button below to seed demo data for your family.
        </Typography>
        <Button variant="contained" onClick={handleSeedDemoData}>
          Seed Demo Data
        </Button>
      </Stack>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
