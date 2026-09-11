/**
 * The Today/Week context strip — and, since `UX-362`, the third site of the one
 * child chip.
 *
 * It used to draw its own `<Chip label={activeChild.name} color="primary"
 * variant="outlined" />` with **no `onClick`**: the exact defect `UX-324` wrote
 * `ChildSwitcherChip` to fix in the app shell, live on the page a parent opens
 * first, styled precisely like every *tappable* chip in the app. AUDIT-228
 * counted six things about one particular boy rendering above the control that
 * says which boy, and that chip was the first of them.
 *
 * It now renders the shared `ChildSwitcherChip`, so this strip and the shell
 * cannot disagree about whether a name is a control. The chip reads
 * `useActiveChild` itself rather than taking the `activeChild` prop: the prop
 * and the hook resolve to the same value (every caller passes
 * `useActiveChild().activeChild`), and reading the hook is what makes the chip
 * and every in-page `ChildSelector` move together — one source of truth, which
 * is the rule the switcher was built on. The prop stays because this component
 * also uses it for the avatar thumbnail, and because it is what decides whether
 * the child block renders at all.
 */
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import DateRangeIcon from '@mui/icons-material/DateRange'
import ScienceIcon from '@mui/icons-material/Science'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import type { Child } from '../core/types'
import { formatDateShort, formatWeekShort, navTo, weekRangeFromDateKey } from '../core/utils/dateKey'
import { useAuth } from '../core/auth/useAuth'
import AvatarThumbnail from '../features/avatar/AvatarThumbnail'
import { useAvatarProfile } from '../features/avatar/useAvatarProfile'
import ChildSwitcherChip from './ChildSwitcherChip'

export type ContextBarPage = 'today' | 'week' | 'artifacts'

interface ContextBarProps {
  page: ContextBarPage
  activeChild?: Child
  /** YYYY-MM-DD for Today pages */
  dateKey?: string
  /** YYYY-MM-DD week start for Week pages */
  weekStart?: string
  /** Callback when "Capture Artifact" is tapped (optional, shown only when provided) */
  onCaptureArtifact?: () => void
}

export default function ContextBar({
  page,
  activeChild,
  dateKey,
  weekStart,
  onCaptureArtifact,
}: ContextBarProps) {
  const navigate = useNavigate()
  const { familyId } = useAuth()
  const avatarProfile = useAvatarProfile(familyId ?? undefined, activeChild?.id)

  // Derive week from dateKey if weekStart not provided
  const resolvedWeekStart = weekStart ?? (dateKey ? weekRangeFromDateKey(dateKey).start : undefined)

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexWrap: 'wrap',
        minHeight: 44,
      }}
    >
      {/* Child chip with avatar — the shared switcher (UX-362), never a second
          inert copy of it. Read-only for a kid profile and for a one-child
          family, by the one `canSwitchChild` rule. */}
      {activeChild && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {avatarProfile && (
            <AvatarThumbnail
              features={avatarProfile.characterFeatures}
              ageGroup={avatarProfile.ageGroup}
              equippedPieces={avatarProfile.equippedPieces ?? []}
              totalXp={avatarProfile.totalXp}
              size={28}
            />
          )}
          <ChildSwitcherChip />
        </Box>
      )}

      {/* Date or Week chip */}
      {page === 'today' && dateKey && (
        <Chip
          label={formatDateShort(dateKey)}
          size="small"
          variant="outlined"
          icon={<CalendarTodayIcon />}
        />
      )}
      {page === 'week' && resolvedWeekStart && (
        <Chip
          label={formatWeekShort(resolvedWeekStart)}
          size="small"
          variant="outlined"
          icon={<DateRangeIcon />}
        />
      )}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Quick nav buttons */}
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title="Week Plan">
          <IconButton
            size="small"
            color={page === 'week' ? 'primary' : 'default'}
            onClick={() => navigate(navTo.week(resolvedWeekStart))}
          >
            <DateRangeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Today">
          <IconButton
            size="small"
            color={page === 'today' ? 'primary' : 'default'}
            onClick={() => navigate(navTo.today(dateKey))}
          >
            <CalendarTodayIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Dad Lab">
          <IconButton
            size="small"
            color="default"
            onClick={() => navigate(navTo.dadLab())}
          >
            <ScienceIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {onCaptureArtifact && (
          <Tooltip title="Capture Artifact">
            <IconButton
              size="small"
              onClick={onCaptureArtifact}
            >
              <CameraAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  )
}
