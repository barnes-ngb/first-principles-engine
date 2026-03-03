import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import UnarchiveIcon from '@mui/icons-material/Unarchive'

import type { Project } from '../../core/types/domain'

// ── Props ──────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  /** Whether this project is currently selected. */
  isSelected: boolean
  /** Whether the current user has edit permissions. */
  canEdit: boolean
  /** Whether to render in archived style. */
  archived?: boolean

  // Callbacks
  onStartSession: (projectId: string) => void
  onOpenNotes: (projectId: string) => void
  onOpenMenu: (event: React.MouseEvent<HTMLElement>, projectId: string) => void
  onUnarchive?: (projectId: string) => void
}

// ── Component ──────────────────────────────────────────────────

export default function ProjectCard({
  project,
  isSelected,
  canEdit,
  archived = false,
  onStartSession,
  onOpenNotes,
  onOpenMenu,
  onUnarchive,
}: ProjectCardProps) {
  if (archived) {
    return (
      <Card variant="outlined" sx={{ opacity: 0.75 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }}>
                {project.title}
              </Typography>
              <Chip label={project.phase} size="small" variant="outlined" />
              <Chip label="Archived" size="small" color="default" />
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="outlined"
                size="small"
                onClick={() => onOpenNotes(project.id!)}
              >
                Project Notes
              </Button>
              {canEdit && onUnarchive && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UnarchiveIcon />}
                  onClick={() => onUnarchive(project.id!)}
                >
                  Unarchive
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isSelected ? 'primary.main' : undefined,
        borderWidth: isSelected ? 2 : 1,
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }}>
              {project.title}
            </Typography>
            <Chip
              label={project.phase}
              color="primary"
              size="small"
              variant="outlined"
            />
            {canEdit && (
              <IconButton
                size="small"
                onClick={(e) => onOpenMenu(e, project.id!)}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="contained"
              size="small"
              onClick={() => onStartSession(project.id!)}
            >
              Start Session
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => onOpenNotes(project.id!)}
            >
              Project Notes
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
