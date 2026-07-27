import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SettingsPage from './SettingsPage'
import { ThemeMode, UserProfile } from '../../core/types/enums'

/** Nathan's UID — the Dev tab's admin gate, mirrored from SettingsPage. */
const ADMIN_UID = 'rqQMDnF3ltTlUzdj6oNTcYlL1br2'

const familyIdRef = { current: 'family-1' }
const profileRef = { current: UserProfile.Parents as UserProfile }

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => familyIdRef.current,
}))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({
    themeMode: ThemeMode.Family,
    setThemeMode: vi.fn(),
    profile: profileRef.current,
  }),
}))
vi.mock('../../core/ai/featureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/ai/featureFlags')>()
  return { ...actual, useAIFeatureFlags: () => ({ isEnabled: () => false, setEnabled: vi.fn() }) }
})

// Stub the tab bodies — this suite is about WHICH panel a tab selects.
vi.mock('./AvatarAdminTab', () => ({ default: () => <div>avatar-tab</div> }))
vi.mock('./StickerLibraryTab', () => ({ default: () => <div>sticker-tab</div> }))
vi.mock('./DevAdminTab', () => ({ default: () => <div>dev-tab</div> }))
vi.mock('./DiagnosticsTab', () => ({ default: () => <div>diagnostics-tab</div> }))
vi.mock('./SoftProfileSection', () => ({ default: () => <div>soft-profile</div> }))
vi.mock('./VoiceInputSection', () => ({ default: () => <div>voice-input</div> }))
vi.mock('./AccountSection', () => ({ default: () => <div>account</div> }))
vi.mock('./AIUsagePanel', () => ({ default: () => <div>ai-usage</div> }))

function renderSettings(opts: { admin?: boolean } = {}) {
  familyIdRef.current = opts.admin ? ADMIN_UID : 'family-1'
  profileRef.current = UserProfile.Parents
  return render(<SettingsPage />)
}

beforeEach(() => {
  familyIdRef.current = 'family-1'
  profileRef.current = UserProfile.Parents
})

/**
 * FEAT-132: the Watch Library tab moved out to its own `/watch` route. The tabs
 * were index-compared (`activeTab === 3`, `isAdmin ? 5 : 4`), so removing one
 * silently re-pointed every tab AFTER it at the wrong panel — the regression
 * these tests exist to catch. Selection is keyed now.
 */
describe('SettingsPage — tabs after the Watch Library moved out (FEAT-132)', () => {
  it('no longer offers a Watch Library tab', () => {
    renderSettings()
    expect(screen.queryByRole('tab', { name: 'Watch Library' })).not.toBeInTheDocument()
  })

  it('still selects Diagnostics — the tab that FOLLOWED Watch Library', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }))
    expect(screen.getByText('diagnostics-tab')).toBeInTheDocument()
  })

  it('still selects Diagnostics when the admin-only Dev tab shifts the indices', () => {
    renderSettings({ admin: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }))
    expect(screen.getByText('diagnostics-tab')).toBeInTheDocument()
    expect(screen.queryByText('dev-tab')).not.toBeInTheDocument()
  })

  it('still selects the admin Dev tab', () => {
    renderSettings({ admin: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Dev' }))
    expect(screen.getByText('dev-tab')).toBeInTheDocument()
    expect(screen.queryByText('diagnostics-tab')).not.toBeInTheDocument()
  })

  it('keeps the tabs before it pointing at their own panels', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'Avatar & XP' }))
    expect(screen.getByText('avatar-tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Sticker Library' }))
    expect(screen.getByText('sticker-tab')).toBeInTheDocument()
    expect(screen.queryByText('avatar-tab')).not.toBeInTheDocument()
  })

  it('hides the Dev tab from a non-admin parent', () => {
    renderSettings()
    expect(screen.queryByRole('tab', { name: 'Dev' })).not.toBeInTheDocument()
  })
})
