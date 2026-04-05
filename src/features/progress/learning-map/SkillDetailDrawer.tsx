import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'

import type { CurriculumNode } from '../../../core/curriculum/curriculumMap'
import { CURRICULUM_NODE_MAP, getDependents } from '../../../core/curriculum/curriculumMap'
import type { SkillNodeStatus } from '../../../core/curriculum/skillStatus'
import { SkillStatus, SkillStatusLabel } from '../../../core/curriculum/skillStatus'

interface SkillDetailDrawerProps {
  node: CurriculumNode | null
  status: SkillNodeStatus | undefined
  onClose: () => void
  onUpdateStatus: (nodeId: string, status: SkillStatus) => void
  getNodeStatus: (nodeId: string) => SkillNodeStatus | undefined
}

export default function SkillDetailDrawer({
  node,
  status,
  onClose,
  onUpdateStatus,
  getNodeStatus,
}: SkillDetailDrawerProps) {
  if (!node) return null

  const currentStatus = status?.status ?? SkillStatus.NotStarted
  const dependencyNodes = node.dependencies
    .map((id) => CURRICULUM_NODE_MAP[id])
    .filter(Boolean)
  const dependentNodes = getDependents(node.id)

  return (
    <Drawer anchor="bottom" open={!!node} onClose={onClose}>
      <Box sx={{ p: 2, maxHeight: '80vh', overflowY: 'auto' }}>
        <Typography variant="h6" gutterBottom>
          {node.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {node.description}
        </Typography>

        <Chip
          label={SkillStatusLabel[currentStatus]}
          sx={{ mb: 2, fontWeight: 600 }}
        />

        {/* Status buttons */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            size="small"
            variant={currentStatus === SkillStatus.NotStarted ? 'contained' : 'outlined'}
            startIcon={<RadioButtonUncheckedIcon />}
            onClick={() => onUpdateStatus(node.id, SkillStatus.NotStarted)}
          >
            Not Started
          </Button>
          <Button
            size="small"
            variant={currentStatus === SkillStatus.InProgress ? 'contained' : 'outlined'}
            color="warning"
            startIcon={<PlayCircleIcon />}
            onClick={() => onUpdateStatus(node.id, SkillStatus.InProgress)}
          >
            Working On
          </Button>
          <Button
            size="small"
            variant={currentStatus === SkillStatus.Mastered ? 'contained' : 'outlined'}
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={() => onUpdateStatus(node.id, SkillStatus.Mastered)}
          >
            Mastered
          </Button>
        </Stack>

        {status?.notes && (
          <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic' }}>
            Note: {status.notes}
          </Typography>
        )}

        {/* Practice ideas */}
        {node.practiceIdeas.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <LightbulbIcon fontSize="small" color="warning" /> Practice Ideas
            </Typography>
            <List dense disablePadding>
              {node.practiceIdeas.map((idea) => (
                <ListItem key={idea} disableGutters sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <Typography variant="body2">•</Typography>
                  </ListItemIcon>
                  <ListItemText primary={idea} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {/* Dependencies */}
        {dependencyNodes.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" gutterBottom>
              Prerequisites
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {dependencyNodes.map((dep) => {
                const depStatus = getNodeStatus(dep.id)?.status ?? SkillStatus.NotStarted
                return (
                  <Chip
                    key={dep.id}
                    label={dep.label}
                    size="small"
                    color={depStatus === SkillStatus.Mastered ? 'success' : depStatus === SkillStatus.InProgress ? 'warning' : 'default'}
                    variant="outlined"
                  />
                )
              })}
            </Stack>
          </>
        )}

        {/* Dependents */}
        {dependentNodes.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" gutterBottom>
              Unlocks
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {dependentNodes.map((dep) => (
                <Chip key={dep.id} label={dep.label} size="small" variant="outlined" />
              ))}
            </Stack>
          </>
        )}

        {/* Linked programs */}
        {node.linkedPrograms && node.linkedPrograms.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" gutterBottom>
              Covered by
            </Typography>
            <Stack direction="row" gap={0.5}>
              {node.linkedPrograms.map((p) => (
                <Chip key={p} label={p} size="small" color="info" variant="outlined" />
              ))}
            </Stack>
          </>
        )}
      </Box>
    </Drawer>
  )
}
