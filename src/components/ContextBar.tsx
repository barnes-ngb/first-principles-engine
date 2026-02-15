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
import type { Child } from '../core/types/domain'
import { formatDateShort, formatWeekShort, navTo, weekRangeFromDateKey } from '../core/utils/dateKey'

export type ContextBarPage = 'today' | 'week' | 'dadLab' | 'artifacts'

interface ContextBarProps {
  page: ContextBarPage
  activeChild?: Child
  /** YYYY-MM-DD for Today pages */
  dateKey?: string
  /** YYYY-MM-DD week start for Week/DadLab */
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
      {/* Child chip */}
      {activeChild && (
        <Chip
          label={activeChild.name}
          size="small"
          color="primary"
          variant="outlined"
        />
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
      {(page === 'week' || page === 'dadLab') && resolvedWeekStart && (
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
            color={page === 'dadLab' ? 'primary' : 'default'}
            onClick={() => navigate(navTo.dadLab(resolvedWeekStart))}
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
