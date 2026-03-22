import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { PatternSummary as PatternSummaryType } from './useWordWall'

const MC = {
  bg: 'rgba(0,0,0,0.92)',
  gold: '#FCDB5B',
  green: '#7EFC20',
  stone: '#8B8B8B',
  darkStone: '#3C3C3C',
  font: '"Press Start 2P", monospace',
} as const

interface PatternSummaryProps {
  patterns: PatternSummaryType[]
}

export default function PatternSummary({ patterns }: PatternSummaryProps) {
  if (patterns.length === 0) return null

  return (
    <Box sx={{ bgcolor: MC.darkStone, borderRadius: 2, p: 2 }}>
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.5rem',
          color: MC.gold,
          mb: 2,
        }}
      >
        Patterns
      </Typography>
      <Stack spacing={1.5}>
        {patterns.map((p) => (
          <Box key={p.pattern}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography
                sx={{
                  fontFamily: MC.font,
                  fontSize: '0.4rem',
                  color: '#fff',
                  lineHeight: 1.8,
                }}
              >
                {formatPatternLabel(p.pattern)}
              </Typography>
              <Typography
                sx={{
                  fontFamily: MC.font,
                  fontSize: '0.4rem',
                  color: MC.stone,
                  lineHeight: 1.8,
                }}
              >
                {p.knownWords}/{p.totalWords}
              </Typography>
            </Box>
            {/* Progress bar */}
            <Box
              sx={{
                position: 'relative',
                height: 10,
                backgroundColor: '#1A1A1A',
                border: '1px solid #3A3A3A',
                borderRadius: 0,
                overflow: 'hidden',
              }}
            >
              {/* Known portion */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${(p.knownWords / Math.max(p.totalWords, 1)) * 100}%`,
                  background: `linear-gradient(180deg, ${MC.green} 0%, #3A8008 100%)`,
                }}
              />
              {/* Emerging portion */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: `${(p.knownWords / Math.max(p.totalWords, 1)) * 100}%`,
                  height: '100%',
                  width: `${(p.emergingWords / Math.max(p.totalWords, 1)) * 100}%`,
                  background: 'linear-gradient(180deg, #ff9800 0%, #e65100 100%)',
                }}
              />
            </Box>
            <Typography
              sx={{
                fontFamily: MC.font,
                fontSize: '0.35rem',
                color: MC.stone,
                mt: 0.5,
              }}
            >
              {p.masteryPercent}%
              {p.strugglingWords > 0 && ` · ${p.strugglingWords} struggling`}
              {p.emergingWords > 0 && ` · ${p.emergingWords} emerging`}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

function formatPatternLabel(pattern: string): string {
  return pattern
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
