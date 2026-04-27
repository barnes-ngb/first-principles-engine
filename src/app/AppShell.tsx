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
import { useAuth } from '../core/auth/useAuth'
import { useActiveChild } from '../core/hooks/useActiveChild'
import { useProfile } from '../core/profile/useProfile'
import { UserProfile } from '../core/types/enums'
import AvatarThumbnail from '../features/avatar/AvatarThumbnail'
import { useAvatarProfile } from '../features/avatar/useAvatarProfile'
import { isArmorComplete } from '../features/avatar/armorGate'

const navItems = [
  { label: 'Today', to: '/today' },
  { label: 'Plan My Week', to: '/planner/chat', parentOnly: true },
  { label: 'Weekly Review', to: '/weekly-review', parentOnly: true },
  { label: 'Progress', to: '/progress', parentOnly: true },
  { label: 'Records', to: '/records', parentOnly: true },
  { label: 'Books', to: '/books' },
  { label: 'Game Workshop', to: '/workshop' },
  { label: 'Dad Lab', to: '/dad-lab' },
  { label: 'Settings', to: '/settings', parentOnly: true },
  { label: 'Ask AI', to: '/chat', parentOnly: true },
]

const kidNavItems = [
  { label: 'Today', to: '/today' },
  { label: 'Knowledge Mine', to: '/quest' },
  { label: 'Hero Hub', to: '/avatar' },
  { label: 'My Books', to: '/books' },
  { label: 'My Stuff', to: '/records/portfolio' },
  { label: 'Game Workshop', to: '/workshop' },
  { label: 'Dad Lab', to: '/dad-lab' },
]

type AppShellProps = {
  children: ReactNode
}

function NavContent({
  isParent,
  onNavigate,
  activeChild,
  avatarProfile,
  armorReady,
}: {
  isParent: boolean
  onNavigate?: () => void
  activeChild?: { id: string; name: string } | null
  avatarProfile?: import('../core/types').AvatarProfile | null
  armorReady?: boolean
}) {
  const items = isParent ? navItems : kidNavItems
  return (
    <>
      <div className="app-shell__profile-row">
        <ProfileMenu />
      </div>
      {activeChild && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 1,
            mb: 0.5,
          }}
        >
          {avatarProfile && (
            <AvatarThumbnail
              features={avatarProfile.characterFeatures}
              ageGroup={avatarProfile.ageGroup}
              equippedPieces={avatarProfile.equippedPieces ?? []}
              totalXp={avatarProfile.totalXp}
              faceGrid={avatarProfile.faceGrid}
              size={32}
              childName={activeChild.name}
            />
          )}
          <Chip
            label={activeChild.name}
            size="small"
            variant="outlined"
            color="primary"
          />
        </Box>
      )}
      <nav>
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
              >
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {item.label}
                  {/* Orange dot on Today when armor gate is active */}
                  {!isParent && item.to === '/today' && armorReady === false && (
                    <Box
                      component="span"
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: '#FF9800',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {/* Highlight My Armor when gate is active */}
                  {!isParent && item.to === '/avatar' && armorReady === false && (
                    <Box
                      component="span"
                      sx={{
                        fontSize: '10px',
                        color: '#FF9800',
                        fontWeight: 700,
                      }}
                    >
                      !
                    </Box>
                  )}
                </Box>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

export function AppShell({ children }: AppShellProps) {
  const { profile } = useProfile()
  const { activeChild } = useActiveChild()
  const { familyId } = useAuth()
  const avatarProfile = useAvatarProfile(familyId ?? undefined, activeChild?.id)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  const isParent = profile === UserProfile.Parents
  const armorReady = !isParent && avatarProfile ? isArmorComplete(avatarProfile) : undefined

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Find the current page label for the mobile header
  const allNavItems = [...navItems, ...kidNavItems]
  const currentLabel =
    allNavItems.find((item) => location.pathname === item.to)?.label ??
    allNavItems.find((item) => location.pathname.startsWith(item.to) && item.to !== '/')?.label ??
    'Home'

  return (
    <div className="app-shell">
      {/* Desktop sidebar (hidden on mobile via CSS) */}
      <aside className="app-shell__nav">
        <NavContent isParent={isParent} activeChild={activeChild} avatarProfile={avatarProfile} armorReady={armorReady} />
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {avatarProfile && (
              <AvatarThumbnail
                features={avatarProfile.characterFeatures}
                ageGroup={avatarProfile.ageGroup}
                equippedPieces={avatarProfile.equippedPieces ?? []}
                totalXp={avatarProfile.totalXp}
                size={32}
                childName={activeChild.name}
              />
            )}
            <Chip
              label={activeChild.name}
              size="small"
              variant="outlined"
              color="primary"
            />
          </Box>
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
          activeChild={activeChild}
          avatarProfile={avatarProfile}
          armorReady={armorReady}
        />
      </Drawer>

      <main className="app-shell__content">{children}</main>
      <DebugPanel />
    </div>
  )
}
