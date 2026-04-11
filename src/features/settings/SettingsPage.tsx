import { type SyntheticEvent, useState } from 'react'
import {
  Alert,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useProfile } from '../../core/profile/useProfile'
import { ThemeMode, UserProfile } from '../../core/types/enums'
import { seedDemoFamily } from '../../core/data/seed'
import {
  AIFeatureFlag,
  AIFeatureFlagDescription,
  AIFeatureFlagLabel,
  useAIFeatureFlags,
} from '../../core/ai/featureFlags'
import AccountSection from './AccountSection'
import AIUsagePanel from './AIUsagePanel'
import AvatarAdminTab from './AvatarAdminTab'
import StickerLibraryTab from './StickerLibraryTab'

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
  const { themeMode, setThemeMode, profile } = useProfile()
  const { isEnabled, setEnabled } = useAIFeatureFlags()
  const [snackbar, setSnackbar] = useState<SnackbarState>(defaultSnackbarState)
  const [activeTab, setActiveTab] = useState(0)

  const isParent = profile === UserProfile.Parents

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
        {isParent && (
          <Tabs
            value={activeTab}
            onChange={(_, v: number) => setActiveTab(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="General" />
            <Tab label="Avatar & XP" />
            <Tab label="Sticker Library" />
          </Tabs>
        )}

        {/* ── General tab ─────────────────────────────────────── */}
        {(!isParent || activeTab === 0) && (
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

            <Stack spacing={2}>
              <Typography variant="h6">AI Features</Typography>
              <Typography variant="body2" color="text.secondary">
                Toggle AI-powered features on or off. When off, the app uses local
                logic as a fallback.
              </Typography>
              {Object.values(AIFeatureFlag).map((flag) => (
                <FormControlLabel
                  key={flag}
                  control={
                    <Switch
                      checked={isEnabled(flag)}
                      onChange={(_, checked) => setEnabled(flag, checked)}
                    />
                  }
                  label={AIFeatureFlagLabel[flag]}
                  slotProps={{
                    typography: { variant: 'body2' },
                  }}
                />
              ))}
              <Typography variant="caption" color="text.secondary">
                {AIFeatureFlagDescription[AIFeatureFlag.AiPlanning]}
              </Typography>
            </Stack>

            <Divider />

            <AccountSection />

            <Divider />

            {import.meta.env.DEV && (
              <Stack spacing={1}>
                <Typography color="text.secondary">
                  Developer tool: seed demo data.
                </Typography>
                <Button variant="contained" onClick={handleSeedDemoData}>
                  Seed Demo Data
                </Button>
              </Stack>
            )}
          </Stack>
        )}

        {/* ── Avatar & XP tab (parent only) ───────────────────── */}
        {isParent && activeTab === 1 && <AvatarAdminTab />}

        {/* ── Sticker Library tab (parent only) ───────────────── */}
        {isParent && activeTab === 2 && <StickerLibraryTab />}
      </SectionCard>

      <AIUsagePanel />

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
