import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { AppBlock, DraftWeeklyPlan, PrioritySkill } from '../../core/types/domain'
import { buildCoverageSummary } from './coverageSummary'
import type { CoverageEntry } from './coverageSummary'

interface PlanSummaryPanelProps {
  hoursPerDay: number
  appBlocks: AppBlock[]
  prioritySkills: PrioritySkill[]
  currentDraft: DraftWeeklyPlan | null
}

export default function PlanSummaryPanel({
  hoursPerDay,
  appBlocks,
  prioritySkills,
  currentDraft,
}: PlanSummaryPanelProps) {
  const coverage: CoverageEntry[] = currentDraft
    ? buildCoverageSummary(currentDraft, prioritySkills)
    : []

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
      <Stack spacing={1}>
        {/* Row 1: Time + Apps */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip
            label={`${hoursPerDay}h/day`}
            size="small"
            color="primary"
            variant="outlined"
          />
          {appBlocks.map((block, i) => (
            <Chip
              key={i}
              label={`${block.label} ${block.defaultMinutes}m`}
              size="small"
              variant="outlined"
            />
          ))}
        </Stack>

        {/* Row 2: Priority Skills */}
        {prioritySkills.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
              Focus:
            </Typography>
            {prioritySkills.map((skill) => (
              <Chip
                key={skill.tag}
                label={`${skill.label} (${skill.level})`}
                size="small"
                color="info"
                variant="outlined"
              />
            ))}
          </Stack>
        )}

        {/* Row 3: Coverage (only when draft exists) */}
        {coverage.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Coverage:
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {coverage.map((entry) => {
                const detail = entry.details.length > 0 ? ` (${entry.details.join(', ')})` : ''
                return (
                  <Chip
                    key={entry.subject}
                    label={`${entry.subject}: ${entry.totalBlocks} blocks${detail}`}
                    size="small"
                    variant="outlined"
                    color={entry.priorityHits > 0 ? 'success' : 'default'}
                    title={`${entry.totalMinutes} minutes total`}
                  />
                )
              })}
            </Stack>
          </Stack>
        )}

        {/* Row 4: Minimum win */}
        {currentDraft && (
          <Typography variant="caption" color="text.secondary">
            Min win: {currentDraft.minimumWin}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
