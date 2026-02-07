import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuIcon from '@mui/icons-material/Menu'
import { useProfile } from '../core/profile/useProfile'
import { UserProfile } from '../core/types/enums'

const navItems = [
  { label: 'Today', to: '/today' },
  { label: 'This Week', to: '/week' },
  { label: 'Engine', to: '/engine' },
  { label: 'Kids', to: '/kids' },
  { label: 'Records', to: '/records' },
  { label: 'Evaluations', to: '/records/evaluations', parentOnly: true },
  { label: 'Portfolio', to: '/records/portfolio', parentOnly: true },
  { label: 'Settings', to: '/settings' },
]

type AppShellProps = {
  children: ReactNode
}

function NavContent({
  displayName,
  isParent,
  onNavigate,
}: {
  displayName: string
  isParent: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      <h2>{displayName}</h2>
      <nav>
        <ul>
          {navItems.map((item) => {
            if (!isParent && item.parentOnly) return null
            return (
              <li key={item.to}>
                <NavLink to={item.to} onClick={onNavigate}>
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  const displayName = profile
    ? profile.charAt(0).toUpperCase() + profile.slice(1)
    : 'Planner'

  const isParent = profile === UserProfile.Parents

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Find the current page label for the mobile header
  const currentLabel =
    navItems.find((item) => location.pathname === item.to)?.label ??
    navItems.find((item) => location.pathname.startsWith(item.to) && item.to !== '/')?.label ??
    'Planner'

  return (
    <div className="app-shell">
      {/* Desktop sidebar (hidden on mobile via CSS) */}
      <aside className="app-shell__nav">
        <NavContent displayName={displayName} isParent={isParent} />
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
        <Box component="span" sx={{ fontWeight: 600, fontSize: '1rem' }}>
          {currentLabel}
        </Box>
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
          displayName={displayName}
          isParent={isParent}
          onNavigate={closeDrawer}
        />
      </Drawer>

      <main className="app-shell__content">{children}</main>
    </div>
  )
}
