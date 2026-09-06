import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { AppBlock, Child, SkillSnapshot } from '../../core/types'
import { formatPlanningWeekLabel } from './chatPlanner.logic'

interface ContextDrawerProps {
  open: boolean
  onClose: () => void
  child: Child | null
  /** The planning week's Sunday-start key, as the page resolved it. */
  weekKey: string
  hoursPerDay: number
  appBlocks: AppBlock[]
  snapshot: SkillSnapshot | null
}

export default function ContextDrawer({
  open,
  onClose,
  child,
  weekKey,
  hoursPerDay,
  appBlocks,
  snapshot,
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
          {/* UX-242: "Context" is the internal word for this. What the panel
              actually lists is what the plan is being built from. */}
          <Typography variant="h6">What Shelly is planning with</Typography>
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
          {/* UX-242: this said "Week of 2026-09-06" — a raw document key, and
              the SUNDAY, while every other control on the page names the same
              week as "Sep 7–11". One formatter, the planner's own. */}
          <Typography variant="body2" color="text.secondary">
            {formatPlanningWeekLabel(weekKey) || `Week of ${weekKey}`}
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

      </Stack>
    </Drawer>
  )
}
