import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuIcon from '@mui/icons-material/Menu'
import DebugPanel from '../components/DebugPanel'
import ProfileMenu from '../components/ProfileMenu'
import { useActiveChild } from '../core/hooks/useActiveChild'
import { useProfile } from '../core/profile/useProfile'
import { UserProfile } from '../core/types/enums'

const navItems = [
  { label: 'Dashboard', to: '/dashboard', end: true },
  { label: 'Scoreboard', to: '/scoreboard', end: true },
  { label: 'Dad Lab', to: '/projects', end: true },
  { label: 'Ladders', to: '/ladders', end: true },
  { label: 'Today', to: '/today', end: true },
  { label: 'This Week', to: '/week', parentOnly: true, end: true },
  { label: 'Engine', to: '/engine', parentOnly: true, end: true },
  { label: 'Records', to: '/records', parentOnly: true, end: true },
  { label: 'Evaluations', to: '/records/evaluations', parentOnly: true, end: true },
  { label: 'Portfolio', to: '/records/portfolio', parentOnly: true, end: true },
]

type AppShellProps = {
  children: ReactNode
}

function NavContent({
  isParent,
  onNavigate,
}: {
  isParent: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="app-shell__profile-row">
        <ProfileMenu />
      </div>
      <nav>
        <ul>
          {navItems.map((item) => {
            if (!isParent && item.parentOnly) return null
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                >
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

export function AppShell({ children }: AppShellProps) {
  const { profile } = useProfile()
  const { activeChild } = useActiveChild()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  const isParent = profile === UserProfile.Parents

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Find the current page label for the mobile header (exact match first, then longest prefix)
  const currentLabel =
    navItems.find((item) => location.pathname === item.to)?.label ??
    [...navItems]
      .filter((item) => location.pathname.startsWith(item.to) && item.to !== '/')
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ??
    'Planner'

  return (
    <div className="app-shell">
      {/* Desktop sidebar (hidden on mobile via CSS) */}
      <aside className="app-shell__nav">
        <NavContent isParent={isParent} />
      </aside>

      {/* Mobile header + drawer (hidden on desktop via CSS) */}
      <Box
        className="app-shell__mobile-header"
        sx={{
          display: { xs: 'flex', md: 'none' },
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          bgcolor: 'background.paper',
        }}
      >
        <IconButton
          edge="start"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </IconButton>
        <Box component="span" sx={{ fontWeight: 600, fontSize: '1rem', flex: 1 }}>
          {currentLabel}
        </Box>
        {activeChild && (
          <Chip
            label={activeChild.name}
            size="small"
            variant="outlined"
            color="primary"
          />
        )}
        <ProfileMenu />
      </Box>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        sx={{
          '& .MuiDrawer-paper': {
            width: 260,
            px: 2,
            py: 3,
          },
        }}
      >
        <NavContent
          isParent={isParent}
          onNavigate={closeDrawer}
        />
      </Drawer>

      <main className="app-shell__content">{children}</main>
      <DebugPanel />
    </div>
  )
}
