import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { PaceGaugeResult } from '../../core/types'
import { PaceStatus } from '../../core/types/enums'

interface PaceGaugePanelProps {
  gauges: PaceGaugeResult[]
}

const statusColor: Record<PaceStatus, 'success' | 'info' | 'warning' | 'default'> = {
  [PaceStatus.Explored]: 'success',
  [PaceStatus.Current]: 'info',
  [PaceStatus.Upcoming]: 'default',
  [PaceStatus.NotStarted]: 'default',
}

const statusLabel: Record<PaceStatus, string> = {
  [PaceStatus.Explored]: 'Explored',
  [PaceStatus.Current]: 'Working On',
  [PaceStatus.Upcoming]: 'Coming Up',
  [PaceStatus.NotStarted]: 'Not Started',
}

export default function PaceGaugePanel({ gauges }: PaceGaugePanelProps) {
  if (gauges.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        Add workbook configs to see curriculum coverage.
      </Alert>
    )
  }

  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" color="text.secondary">
          What We've Covered
        </Typography>

        {gauges.map((gauge) => (
          <CoverageRow key={gauge.workbookName} gauge={gauge} />
        ))}
      </Stack>
    </Box>
  )
}

function CoverageRow({ gauge }: { gauge: PaceGaugeResult }) {
  const color = statusColor[gauge.status]
  const progress = gauge.totalUnits > 0
    ? Math.min(100, (gauge.currentPosition / gauge.totalUnits) * 100)
    : 0

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 100 }}>
          {gauge.workbookName}
        </Typography>
        <Chip
          label={statusLabel[gauge.status]}
          size="small"
          color={color}
          variant="outlined"
        />
      </Stack>

      {gauge.totalUnits > 0 && (
        <LinearProgress
          variant="determinate"
          value={progress}
          color={color === 'default' ? 'inherit' : color}
          sx={{ height: 6, borderRadius: 3 }}
        />
      )}

      <Typography variant="caption" color="text.secondary">
        {gauge.coverageText}
      </Typography>
    </Stack>
  )
}
