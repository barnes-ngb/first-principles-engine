import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { PaceGaugeResult } from '../../core/types/domain'
import { PaceStatus } from '../../core/types/enums'

interface PaceGaugePanelProps {
  gauges: PaceGaugeResult[]
}

const statusColor: Record<PaceStatus, 'success' | 'info' | 'warning' | 'error'> = {
  [PaceStatus.Ahead]: 'success',
  [PaceStatus.OnTrack]: 'info',
  [PaceStatus.Behind]: 'warning',
  [PaceStatus.Critical]: 'error',
}

const statusLabel: Record<PaceStatus, string> = {
  [PaceStatus.Ahead]: 'Ahead',
  [PaceStatus.OnTrack]: 'On Track',
  [PaceStatus.Behind]: 'Behind',
  [PaceStatus.Critical]: 'Critical',
}

export default function PaceGaugePanel({ gauges }: PaceGaugePanelProps) {
  if (gauges.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        Add workbook configs to see pace tracking.
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
          Pace Gauge
        </Typography>

        {gauges.map((gauge) => (
          <PaceRow key={gauge.workbookName} gauge={gauge} />
        ))}
      </Stack>
    </Box>
  )
}

function PaceRow({ gauge }: { gauge: PaceGaugeResult }) {
  const color = statusColor[gauge.status]
  const progress = gauge.requiredPerWeek > 0
    ? Math.min(100, (gauge.plannedPerWeek / gauge.requiredPerWeek) * 100)
    : 100

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
        {gauge.bufferDays > 0 && (
          <Tooltip title={`${gauge.bufferDays} buffer days available`}>
            <Chip
              label={`${gauge.bufferDays}d buffer`}
              size="small"
              variant="outlined"
              color="success"
            />
          </Tooltip>
        )}
      </Stack>

      <LinearProgress
        variant="determinate"
        value={progress}
        color={color}
        sx={{ height: 6, borderRadius: 3 }}
      />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary">
          Need: {gauge.requiredPerWeek}/wk
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Planned: {gauge.plannedPerWeek}/wk
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Finish: {gauge.projectedFinishDate}
        </Typography>
      </Stack>

      <Typography variant="caption" color={`${color}.main`}>
        {gauge.suggestion}
      </Typography>
    </Stack>
  )
}
