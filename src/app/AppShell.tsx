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
import { useChildSkillSnapshot } from '../core/hooks/useChildSkillSnapshot'
import { useProfile } from '../core/profile/useProfile'
import { UserProfile } from '../core/types/enums'
import AvatarThumbnail from '../features/avatar/AvatarThumbnail'
import { useAvatarProfile } from '../features/avatar/useAvatarProfile'
import { isArmorComplete } from '../features/avatar/armorGate'
import { canAccessKnowledgeMine } from '../features/quest/knowledgeMineAccess'

const navItems = [
  { label: 'Today', to: '/today' },
  { label: 'Plan My Week', to: '/planner/chat', parentOnly: true },
  { label: 'Weekly Review', to: '/weekly-review', parentOnly: true },
  { label: 'Progress', to: '/progress', parentOnly: true },
  { label: 'Records', to: '/records', parentOnly: true },
  { label: 'Books', to: '/books' },
  { label: 'Barnes Bros', to: '/business' },
  { label: 'Game Workshop', to: '/workshop' },
  { label: 'Dad Lab', to: '/dad-lab' },
  { label: 'Settings', to: '/settings', parentOnly: true },
  { label: 'Ask AI', to: '/chat', parentOnly: true },
]

const kidNavItems = [
  { label: 'Today', to: '/today' },
  { label: 'Knowledge Mine', to: '/quest' },
  { label: 'My Books', to: '/books' },
  { label: 'Books About Me', to: '/books-about-me' },
  { label: 'My Hero', to: '/avatar' },
  { label: 'My Stuff', to: '/records/portfolio' },
  { label: 'Barnes Bros', to: '/business' },
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
  showKnowledgeMine,
}: {
  isParent: boolean
  onNavigate?: () => void
  activeChild?: { id: string; name: string } | null
  avatarProfile?: import('../core/types').AvatarProfile | null
  armorReady?: boolean
  showKnowledgeMine?: boolean
}) {
  // Hide the Knowledge Mine item for kids without Mine calibration — the /quest
  // route guard would silently bounce them to Today, so nav shouldn't advertise
  // a link that goes nowhere. Same predicate as RequireKnowledgeMineAccess.
  const items = (isParent ? navItems : kidNavItems).filter(
    (item) => item.to !== '/quest' || isParent || showKnowledgeMine,
  )
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
  const { activeChild, activeChildId } = useActiveChild()
  const { familyId } = useAuth()
  const avatarProfile = useAvatarProfile(familyId ?? undefined, activeChild?.id)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  const isParent = profile === UserProfile.Parents

  // Kid nav Knowledge Mine visibility mirrors the /quest route guard: only kids
  // with Mine calibration see the item (gate + nav can never disagree).
  const { snapshot: kidSnapshot, loaded: kidSnapshotLoaded } = useChildSkillSnapshot(
    familyId ?? undefined,
    !isParent ? activeChildId || undefined : undefined,
  )
  const showKnowledgeMine =
    !isParent && kidSnapshotLoaded && canAccessKnowledgeMine(kidSnapshot)

  const armorReady = !isParent && avatarProfile ? isArmorComplete(avatarProfile) : undefined

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Story Call broadcast surface (FEAT-95): `?call=1` on the book reader escapes the
  // shell entirely — no sidebar, mobile header, drawer, or debug chrome on the shared
  // screen, and the reader fills the viewport (its own `minHeight:100dvh` isn't pushed
  // down by a header). Scoped to the reader route so a stray param can't blank the app.
  const isCallMode =
    location.pathname.endsWith('/read') &&
    new URLSearchParams(location.search).get('call') === '1'
  if (isCallMode) {
    return (
      <div className="app-shell app-shell--call">
        <main className="app-shell__content app-shell__content--call">{children}</main>
      </div>
    )
  }

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
        <NavContent isParent={isParent} activeChild={activeChild} avatarProfile={avatarProfile} armorReady={armorReady} showKnowledgeMine={showKnowledgeMine} />
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
          showKnowledgeMine={showKnowledgeMine}
        />
      </Drawer>

      <main className="app-shell__content">{children}</main>
      <DebugPanel />
    </div>
  )
}
