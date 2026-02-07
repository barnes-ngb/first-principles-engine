import { type SyntheticEvent, useState } from 'react'
import {
  Alert,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useProfile } from '../../core/profile/useProfile'
import { ThemeMode } from '../../core/types/enums'
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

const themeModeLabels: Record<ThemeMode, string> = {
  [ThemeMode.Family]: 'Family',
  [ThemeMode.Lincoln]: 'Lincoln',
  [ThemeMode.London]: 'London',
}

export default function SettingsPage() {
  const familyId = useFamilyId()
  const { themeMode, setThemeMode } = useProfile()
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

  const handleThemeModeChange = (event: SelectChangeEvent) => {
    setThemeMode(event.target.value as ThemeMode)
  }

  return (
    <Page>
      <SectionCard title="Settings">
        <Stack spacing={3}>
          <Stack spacing={2}>
            <Typography variant="h6">Appearance</Typography>
            <FormControl size="small" sx={{ maxWidth: 240 }}>
              <InputLabel id="theme-mode-label">Theme</InputLabel>
              <Select
                labelId="theme-mode-label"
                value={themeMode}
                label="Theme"
                onChange={handleThemeModeChange}
              >
                {Object.values(ThemeMode).map((mode) => (
                  <MenuItem key={mode} value={mode}>
                    {themeModeLabels[mode]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Divider />

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

        </Stack>
      </SectionCard>

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
    </Page>
  )
}
