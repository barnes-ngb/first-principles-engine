import { useState } from 'react'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ActivityConfig } from '../../core/types'
import type { ActivityFrequency } from '../../core/types/enums'
import { ActivityFrequencyLabel } from '../../core/types/enums'
import AddActivityDialog from './AddActivityDialog'

/** Activity type display groups. */
const TYPE_GROUPS = [
  { key: 'formation', label: 'Formation' },
  { key: 'workbook', label: 'Core' },
  { key: 'routine', label: 'Support' },
  { key: 'activity', label: 'Activities' },
  { key: 'app', label: 'Apps' },
  { key: 'evaluation', label: 'Evaluation (auto-managed)' },
] as const

const FREQUENCY_OPTIONS: ActivityFrequency[] = ['daily', '3x', '2x', '1x', 'as-needed']

const MINUTES_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

interface ActivityConfigListProps {
  childName: string
  childId: string
  configs: ActivityConfig[]
  loading: boolean
  onUpdateConfig: (id: string, updates: Partial<ActivityConfig>) => Promise<void>
  onDeleteConfig: (id: string) => Promise<void>
  onMarkComplete: (id: string) => Promise<void>
  onAddConfig: (data: Parameters<typeof AddActivityDialog>[0]['onAdd'] extends (d: infer T) => unknown ? T : never) => Promise<void>
}

export default function ActivityConfigList({
  childName,
  childId,
  configs,
  loading,
  onUpdateConfig,
  onDeleteConfig,
  onMarkComplete,
  onAddConfig,
}: ActivityConfigListProps) {
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; configId: string } | null>(null)
  const [freqAnchor, setFreqAnchor] = useState<{ el: HTMLElement; configId: string } | null>(null)
  const [minutesAnchor, setMinutesAnchor] = useState<{ el: HTMLElement; configId: string } | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  const activeConfigs = configs.filter((c) => !c.completed)
  const completedConfigs = configs.filter((c) => c.completed)

  const handleFrequencyChange = async (configId: string, freq: ActivityFrequency) => {
    await onUpdateConfig(configId, { frequency: freq })
    setFreqAnchor(null)
  }

  const handleMinutesChange = async (configId: string, minutes: number) => {
    await onUpdateConfig(configId, { defaultMinutes: minutes })
    setMinutesAnchor(null)
  }

  const renderConfigRow = (config: ActivityConfig) => (
    <Stack
      key={config.id}
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.75,
        px: 1,
        opacity: config.completed ? 0.5 : 1,
        '&:hover': { bgcolor: 'action.hover', borderRadius: 1 },
      }}
    >
      {config.completed ? (
        <CheckCircleIcon fontSize="small" color="success" />
      ) : (
        <Box sx={{ width: 20 }} />
      )}

      <Typography
        variant="body2"
        sx={{
          flex: 1,
          textDecoration: config.completed ? 'line-through' : 'none',
          fontWeight: config.type === 'evaluation' ? 500 : 400,
        }}
      >
        {config.name}
        {config.completed && config.completedDate && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            Done {new Date(config.completedDate).toLocaleDateString()}
          </Typography>
        )}
      </Typography>

      {/* Minutes chip */}
      {!config.completed && (
        <Chip
          label={`${config.defaultMinutes}m`}
          size="small"
          variant="outlined"
          onClick={(e) => setMinutesAnchor({ el: e.currentTarget, configId: config.id })}
          sx={{ cursor: 'pointer', minWidth: 44 }}
        />
      )}

      {/* Frequency chip */}
      {!config.completed && (
        <Chip
          label={ActivityFrequencyLabel[config.frequency as ActivityFrequency] ?? config.frequency}
          size="small"
          variant="outlined"
          onClick={(e) => setFreqAnchor({ el: e.currentTarget, configId: config.id })}
          sx={{ cursor: 'pointer', minWidth: 60 }}
        />
      )}

      {/* Scannable indicator */}
      {config.scannable && !config.completed && (
        <CameraAltIcon fontSize="small" color="action" titleAccess="Scannable" />
      )}

      {/* Position indicator for workbooks */}
      {config.currentPosition != null && config.totalUnits != null && !config.completed && (
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {config.unitLabel ?? 'Lesson'} {config.currentPosition}
        </Typography>
      )}

      {/* Overflow menu */}
      {!config.completed && config.type !== 'evaluation' && (
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor({ el: e.currentTarget, configId: config.id })}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  )

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{childName}&apos;s Activities</Typography>
        <Typography variant="caption" color="text.secondary">
          {activeConfigs.length} active{completedConfigs.length > 0 ? `, ${completedConfigs.length} completed` : ''}
        </Typography>
      </Stack>

      {/* Grouped active configs */}
      {TYPE_GROUPS.map((group) => {
        const groupConfigs = activeConfigs.filter((c) => c.type === group.key)
        if (groupConfigs.length === 0) return null
        return (
          <Box key={group.key} sx={{ mb: 1.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, pl: 1 }}
            >
              {group.label}
            </Typography>
            {groupConfigs.map(renderConfigRow)}
          </Box>
        )
      })}

      {/* Completed section */}
      {completedConfigs.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, pl: 1 }}
          >
            Completed
          </Typography>
          {completedConfigs.map(renderConfigRow)}
        </Box>
      )}

      {/* Add button */}
      <Button
        variant="outlined"
        size="small"
        fullWidth
        sx={{ mt: 2 }}
        onClick={() => setAddDialogOpen(true)}
      >
        + Add Activity
      </Button>

      {/* Frequency popover */}
      <Popover
        open={!!freqAnchor}
        anchorEl={freqAnchor?.el}
        onClose={() => setFreqAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack direction="row" spacing={0.5} sx={{ p: 1 }}>
          {FREQUENCY_OPTIONS.map((freq) => (
            <Chip
              key={freq}
              label={ActivityFrequencyLabel[freq]}
              size="small"
              variant={freqAnchor && configs.find((c) => c.id === freqAnchor.configId)?.frequency === freq ? 'filled' : 'outlined'}
              color={freqAnchor && configs.find((c) => c.id === freqAnchor.configId)?.frequency === freq ? 'primary' : 'default'}
              onClick={() => freqAnchor && handleFrequencyChange(freqAnchor.configId, freq)}
            />
          ))}
        </Stack>
      </Popover>

      {/* Minutes popover */}
      <Popover
        open={!!minutesAnchor}
        anchorEl={minutesAnchor?.el}
        onClose={() => setMinutesAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack direction="row" spacing={0.5} sx={{ p: 1 }} flexWrap="wrap" useFlexGap>
          {MINUTES_OPTIONS.map((min) => (
            <Chip
              key={min}
              label={`${min}m`}
              size="small"
              variant={minutesAnchor && configs.find((c) => c.id === minutesAnchor.configId)?.defaultMinutes === min ? 'filled' : 'outlined'}
              color={minutesAnchor && configs.find((c) => c.id === minutesAnchor.configId)?.defaultMinutes === min ? 'primary' : 'default'}
              onClick={() => minutesAnchor && handleMinutesChange(minutesAnchor.configId, min)}
            />
          ))}
        </Stack>
      </Popover>

      {/* Overflow menu */}
      <Menu
        anchorEl={menuAnchor?.el}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={async () => {
            if (menuAnchor) await onMarkComplete(menuAnchor.configId)
            setMenuAnchor(null)
          }}
        >
          <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Mark Complete</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={async () => {
            if (menuAnchor) await onDeleteConfig(menuAnchor.configId)
            setMenuAnchor(null)
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Add dialog */}
      <AddActivityDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        childId={childId}
        childName={childName}
        existingCount={activeConfigs.length}
        onAdd={onAddConfig}
      />
    </Box>
  )
}
