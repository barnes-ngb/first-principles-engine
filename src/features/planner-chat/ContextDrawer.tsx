import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { AppBlock, Child, SkillSnapshot } from '../../core/types/domain'

interface ContextDrawerProps {
  open: boolean
  onClose: () => void
  child: Child | null
  weekKey: string
  hoursPerDay: number
  appBlocks: AppBlock[]
  snapshot: SkillSnapshot | null
  minimumWin: string
}

export default function ContextDrawer({
  open,
  onClose,
  child,
  weekKey,
  hoursPerDay,
  appBlocks,
  snapshot,
  minimumWin,
}: ContextDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '85vw', sm: 340 },
          p: 2,
        },
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Context</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>

        <Divider />

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Child & Week
          </Typography>
          <Typography variant="body2">{child?.name ?? 'No child selected'}</Typography>
          <Typography variant="body2" color="text.secondary">
            Week of {weekKey}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hoursPerDay} hours/day ({Math.round(hoursPerDay * 60)} min)
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            App Blocks
          </Typography>
          {appBlocks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">None configured</Typography>
          ) : (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {appBlocks.map((block, i) => (
                <Chip
                  key={i}
                  label={`${block.label} (${block.defaultMinutes}m)`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Stack>
          )}
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Skill Snapshot
          </Typography>
          {!snapshot || snapshot.prioritySkills.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No skill snapshot configured
            </Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">Priority Skills</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {snapshot.prioritySkills.map((skill) => (
                  <Chip
                    key={skill.tag}
                    label={`${skill.label} (${skill.level})`}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                ))}
              </Stack>
              {snapshot.stopRules.length > 0 && (
                <>
                  <Typography variant="caption" color="text.secondary">Stop Rules</Typography>
                  {snapshot.stopRules.map((rule, i) => (
                    <Typography key={i} variant="body2">
                      {rule.label}: {rule.action}
                    </Typography>
                  ))}
                </>
              )}
            </Stack>
          )}
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Minimum Win
          </Typography>
          <Typography variant="body2">{minimumWin}</Typography>
        </Box>
      </Stack>
    </Drawer>
  )
}
