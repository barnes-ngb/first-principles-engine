/**
 * The Today/Week context strip.
 *
 * **It no longer renders a child chip** (`FEAT-237` / `UX-425`, owner decision
 * 2026-09-13: *"There are now as many as four locations to choose a child. I
 * like the chip drop-down in the header as the primary source; remove the
 * others."*). It carried one from `UX-362` until then — the shared
 * `ChildSwitcherChip`, correctly, after AUDIT-228 found it drawing an inert
 * look-alike — and the shell's chip sits ~60px above it on the page a parent
 * opens first. Two working switchers a thumb apart is the duplication the owner
 * reported, so this one went and the shell's stayed.
 *
 * The avatar thumbnail stays: it is a picture of the child, not a control that
 * chooses one, and it is what makes the strip read as *this* boy's day. The
 * `activeChild` prop stays with it, and still decides whether that block
 * renders at all.
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
      {/* The child's avatar — a picture, never a control. UX-425 removed the
          chip that sat beside it; the one child chip is in the shell above. */}
      {activeChild && avatarProfile && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AvatarThumbnail
            features={avatarProfile.characterFeatures}
            ageGroup={avatarProfile.ageGroup}
            equippedPieces={avatarProfile.equippedPieces ?? []}
            totalXp={avatarProfile.totalXp}
            size={28}
          />
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
