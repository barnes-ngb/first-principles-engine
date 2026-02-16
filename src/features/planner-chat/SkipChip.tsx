import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'

import type { SkipAdvisorResult } from '../../core/types/domain'

interface SkipChipProps {
  result: SkipAdvisorResult
  onToggle?: (newAction: 'keep' | 'modify' | 'skip') => void
}

const chipConfig: Record<string, { color: 'success' | 'warning' | 'default'; label: string }> = {
  keep: { color: 'success', label: 'Keep' },
  modify: { color: 'warning', label: 'Modify' },
  skip: { color: 'default', label: 'Skip' },
}

export default function SkipChip({ result, onToggle }: SkipChipProps) {
  const config = chipConfig[result.action]

  return (
    <Tooltip title={result.rationale} arrow placement="top">
      <Chip
        label={config.label}
        size="small"
        color={config.color}
        variant="outlined"
        onClick={
          onToggle
            ? () => {
                // Cycle: keep -> modify -> skip -> keep
                const next = result.action === 'keep'
                  ? 'modify'
                  : result.action === 'modify'
                    ? 'skip'
                    : 'keep'
                onToggle(next)
              }
            : undefined
        }
        sx={{
          cursor: onToggle ? 'pointer' : 'default',
          textDecoration: result.action === 'skip' ? 'line-through' : 'none',
        }}
      />
    </Tooltip>
  )
}
