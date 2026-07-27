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
import DevAdminTab from './DevAdminTab'
import DiagnosticsTab from './DiagnosticsTab'
import SoftProfileSection from './SoftProfileSection'
import StickerLibraryTab from './StickerLibraryTab'
import VoiceInputSection from './VoiceInputSection'

/**
 * Nathan's Firebase Auth UID. The "Dev" admin tab in Settings is only
 * rendered when the authenticated user matches this UID. This is a
 * lightweight feature-gate that works on the production site without
 * any infrastructure changes.
 */
const ADMIN_UID = 'rqQMDnF3ltTlUzdj6oNTcYlL1br2'

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

/**
 * Settings tab identities (FEAT-132). Keyed, never index-compared — see the
 * `tabs` array below for why.
 */
const SettingsTab = {
  General: 'general',
  Avatar: 'avatar',
  Stickers: 'stickers',
  Dev: 'dev',
  Diagnostics: 'diagnostics',
} as const
type SettingsTab = (typeof SettingsTab)[keyof typeof SettingsTab]

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
  const [activeTab, setActiveTab] = useState<SettingsTab>(SettingsTab.General)

  const isParent = profile === UserProfile.Parents
  const isAdmin = familyId === ADMIN_UID

  // Visible tabs, in order. `isAdmin` conditionally inserts Dev in the middle,
  // so the tab list is variable-length — which is why selection is KEYED, not
  // index-compared (FEAT-132). The old `activeTab === 3` / `isAdmin ? 5 : 4`
  // arithmetic meant removing or reordering a tab silently re-pointed every tab
  // after it at the wrong panel; removing the Watch Library tab was exactly that
  // hazard. Keys can't shift.
  const tabs = [
    { key: SettingsTab.General, label: 'General' },
    { key: SettingsTab.Avatar, label: 'Avatar & XP' },
    { key: SettingsTab.Stickers, label: 'Sticker Library' },
    ...(isAdmin ? [{ key: SettingsTab.Dev, label: 'Dev' }] : []),
    { key: SettingsTab.Diagnostics, label: 'Diagnostics' },
  ]
  // Fall back to General if the selected tab isn't currently visible (e.g. the
  // admin check resolves false after Dev was selected) — MUI would otherwise
  // render a Tabs value matching no Tab.
  const selectedTab = tabs.some((t) => t.key === activeTab) ? activeTab : SettingsTab.General

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
            value={selectedTab}
            onChange={(_, v: SettingsTab) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            {tabs.map((t) => (
              <Tab key={t.key} value={t.key} label={t.label} />
            ))}
          </Tabs>
        )}

        {/* ── General tab ─────────────────────────────────────── */}
        {(!isParent || selectedTab === SettingsTab.General) && (
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

            {isParent && <SoftProfileSection />}

            {isParent && <Divider />}

            {isParent && <VoiceInputSection />}

            {isParent && <Divider />}

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
        {isParent && selectedTab === SettingsTab.Avatar && <AvatarAdminTab />}

        {/* ── Sticker Library tab (parent only) ───────────────── */}
        {isParent && selectedTab === SettingsTab.Stickers && <StickerLibraryTab />}

        {/* (The Watch Library moved out to its own `/watch` route in FEAT-132.) */}

        {/* ── Dev admin tab (admin UID only) ──────────────────── */}
        {isAdmin && selectedTab === SettingsTab.Dev && <DevAdminTab />}

        {/* ── Diagnostics tab (ARCH-11, parent only, read-only) ─ */}
        {isParent && selectedTab === SettingsTab.Diagnostics && <DiagnosticsTab />}
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
