import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { UserProfile } from '../core/types/enums'

// ── Hook deps stubbed (AppShell pulls a lot of context) ───────────

vi.mock('../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: UserProfile.Parents }),
}))
vi.mock('../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChild: { id: 'c1', name: 'London' }, activeChildId: 'c1' }),
}))
vi.mock('../core/auth/useAuth', () => ({ useAuth: () => ({ familyId: 'family-1' }) }))
vi.mock('../features/avatar/useAvatarProfile', () => ({ useAvatarProfile: () => null }))
vi.mock('../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({ snapshot: null, loaded: true }),
}))
vi.mock('../components/ProfileMenu', () => ({ default: () => <div>profile-menu</div> }))
vi.mock('../components/DebugPanel', () => ({ default: () => <div>debug-panel</div> }))
vi.mock('../features/avatar/AvatarThumbnail', () => ({ default: () => null }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <div data-testid="page">the reader</div>
      </AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell — Story Call mode', () => {
  it('renders full nav chrome on a normal route', () => {
    renderAt('/books')
    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.getAllByText('Books').length).toBeGreaterThan(0) // nav link present
    expect(screen.getAllByText('profile-menu').length).toBeGreaterThan(0)
    expect(screen.getByText('debug-panel')).toBeInTheDocument()
  })

  it('escapes the shell (no nav, header, or debug chrome) on the call-mode reader', () => {
    const { container } = renderAt('/books/book-1/read?call=1')
    expect(screen.getByTestId('page')).toBeInTheDocument()
    // No sidebar nav, profile menu, or debug panel broadcast on the shared screen.
    expect(screen.queryByText('Books')).not.toBeInTheDocument()
    expect(screen.queryByText('profile-menu')).not.toBeInTheDocument()
    expect(screen.queryByText('debug-panel')).not.toBeInTheDocument()
    expect(container.querySelector('.app-shell--call')).not.toBeNull()
    expect(container.querySelector('.app-shell__nav')).toBeNull()
  })

  it('keeps the shell chrome on the reader WITHOUT the call flag', () => {
    renderAt('/books/book-1/read')
    expect(screen.getAllByText('Books').length).toBeGreaterThan(0)
  })
})
