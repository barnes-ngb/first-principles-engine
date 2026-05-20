import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { getGatbProgress } from '../core/data/gatbCurriculum'

interface GatbLessonInfoProps {
  level: string | null | undefined
  lessonNumber: number
}

/**
 * Resolves a level designation like "Level 1", "Level K", "Level 2"
 * into the curriculum key used by GATB_CURRICULUM.
 * Tries Language Arts first (more common for scans), then Math.
 */
function resolveCurriculumKey(level: string | null | undefined): string | null {
  if (!level) return null
  const lower = level.toLowerCase().trim()

  // Extract the level identifier (K, 1, 2, etc.)
  const match = lower.match(/(?:level\s*)?([k012])/)
  if (!match) return null

  const lvl = match[1]
  // Try Language Arts first (primary use case)
  const laKey = `gatb-la-${lvl}`
  return laKey
}

export default function GatbLessonInfo({ level, lessonNumber }: GatbLessonInfoProps) {
  const progress = useMemo(() => {
    const key = resolveCurriculumKey(level)
    if (!key) return null
    return getGatbProgress(key, lessonNumber)
  }, [level, lessonNumber])

  if (!progress) return null

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1,
      }}
    >
      <Stack spacing={1}>
        {/* Current unit */}
        {progress.currentUnit && (
          <Typography variant="body2" fontWeight={600}>
            Current: {progress.currentUnit.topic}
          </Typography>
        )}

        {/* Progress bar */}
        <Stack direction="row" spacing={1} alignItems="center">
          <LinearProgress
            variant="determinate"
            value={progress.percentComplete}
            sx={{ flex: 1, height: 6, borderRadius: 3 }}
          />
          <Typography variant="caption" color="text.secondary">
            {progress.percentComplete}%
          </Typography>
        </Stack>

        {/* Skills covered in current unit */}
        {progress.currentUnit && progress.currentUnit.skills.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {progress.currentUnit.skills.map((skill) => (
              <Chip key={skill} label={skill} size="small" variant="outlined" />
            ))}
          </Stack>
        )}

        {/* Upcoming topic */}
        {progress.upcomingUnits.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Up next: {progress.upcomingUnits[0].topic}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
