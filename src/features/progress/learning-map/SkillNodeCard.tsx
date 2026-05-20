import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

import type { CurriculumNode } from '../../../core/curriculum/curriculumMap'
import type { SkillNodeStatus } from '../../../core/curriculum/skillStatus'
import { SkillStatus, SkillStatusLabel } from '../../../core/curriculum/skillStatus'

const STATUS_COLORS: Record<SkillStatus, string> = {
  [SkillStatus.NotStarted]: '#e0e0e0',
  [SkillStatus.InProgress]: '#fff3e0',
  [SkillStatus.Mastered]: '#e8f5e9',
}

const STATUS_BORDER: Record<SkillStatus, string> = {
  [SkillStatus.NotStarted]: '#bdbdbd',
  [SkillStatus.InProgress]: '#ff9800',
  [SkillStatus.Mastered]: '#4caf50',
}

interface SkillNodeCardProps {
  node: CurriculumNode
  status: SkillNodeStatus | undefined
  onTap: (node: CurriculumNode) => void
}

export default function SkillNodeCard({ node, status, onTap }: SkillNodeCardProps) {
  const currentStatus = status?.status ?? SkillStatus.NotStarted

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: STATUS_COLORS[currentStatus],
        borderColor: STATUS_BORDER[currentStatus],
        borderWidth: 2,
      }}
    >
      <CardActionArea onClick={() => onTap(node)} sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {node.label}
          </Typography>
          <Chip
            label={SkillStatusLabel[currentStatus]}
            size="small"
            sx={{
              bgcolor: STATUS_BORDER[currentStatus],
              color: currentStatus === SkillStatus.NotStarted ? '#616161' : '#fff',
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 22,
              flexShrink: 0,
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {node.description}
        </Typography>
        {node.linkedPrograms && node.linkedPrograms.length > 0 && (
          <Box sx={{ mt: 0.5 }}>
            {node.linkedPrograms.map((p) => (
              <Chip key={p} label={p} size="small" variant="outlined" sx={{ mr: 0.5, height: 18, fontSize: '0.65rem' }} />
            ))}
          </Box>
        )}
      </CardActionArea>
    </Card>
  )
}
