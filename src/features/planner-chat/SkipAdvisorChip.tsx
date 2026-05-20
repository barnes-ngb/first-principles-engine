import { useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'

import type { SkipAdvisorResult } from '../../core/types'

interface SkipAdvisorChipProps {
  result: SkipAdvisorResult
  /** Override displayed label; defaults to action-based label. */
  label?: string
}

const chipConfig: Record<
  SkipAdvisorResult['action'],
  { color: 'default' | 'warning' | 'info'; defaultLabel: string }
> = {
  keep: { color: 'default', defaultLabel: 'Keep' },
  modify: { color: 'warning', defaultLabel: 'Lighter' },
  skip: { color: 'info', defaultLabel: 'Skip eligible' },
}

/**
 * Quiet, click-to-expand chip showing skip-advisor recommendation.
 * Used in planner item rows and (via the snapshot variant) on the
 * Skill Snapshot priority skill list.
 */
export default function SkipAdvisorChip({ result, label }: SkipAdvisorChipProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const config = chipConfig[result.action]
  const open = Boolean(anchorEl)

  return (
    <>
      <Chip
        label={label ?? config.defaultLabel}
        size="small"
        color={config.color}
        variant="outlined"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ height: 20, cursor: 'pointer' }}
      />
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, maxWidth: 320 }}>
          <Typography variant="body2">{result.rationale}</Typography>
        </Box>
      </Popover>
    </>
  )
}
