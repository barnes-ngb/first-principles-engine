import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Checkbox from '@mui/material/Checkbox'
import type { WordMasteryLevel } from '../../core/types'

// UX-49: the `struggling` key stays (it is the stored `WordMasteryLevel`), but
// the child reads the block, not the key. A deep-red "\uD83D\uDD34" is a deficit grade on
// the one Progress surface a kid sees, under a strip that promises no grades \u2014
// so this level renders amber with the pickaxe the rest of the kid app uses for
// work-in-progress.
const MASTERY_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  known: { bg: '#2e7d32', border: '#4caf50', icon: '\u2705' },
  emerging: { bg: '#e65100', border: '#ff9800', icon: '\uD83D\uDFE1' },
  struggling: { bg: '#8d5000', border: '#ffb300', icon: '\u26CF\uFE0F' },
  'not-yet': { bg: '#616161', border: '#9e9e9e', icon: '\u2B1C' },
}

interface WordBlockProps {
  word: string
  masteryLevel: WordMasteryLevel
  correctCount: number
  totalAttempts: number
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (word: string) => void
  onClick?: () => void
}

export default function WordBlock({
  word,
  masteryLevel,
  correctCount,
  totalAttempts,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onClick,
}: WordBlockProps) {
  const colors = MASTERY_COLORS[masteryLevel] ?? MASTERY_COLORS['not-yet']

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect(word)
    } else if (onClick) {
      onClick()
    }
  }

  return (
    <Box
      onClick={handleClick}
      sx={{
        bgcolor: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 1,
        p: 1,
        minWidth: 72,
        textAlign: 'center',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.1s',
        '&:hover': { transform: 'scale(1.05)' },
        '&:active': { transform: 'scale(0.97)' },
        ...(selected && {
          boxShadow: '0 0 0 3px #90caf9',
        }),
      }}
    >
      {selectMode && (
        <Checkbox
          checked={selected}
          size="small"
          sx={{
            position: 'absolute',
            top: -4,
            right: -4,
            p: 0,
            color: '#fff',
            '&.Mui-checked': { color: '#90caf9' },
          }}
          tabIndex={-1}
        />
      )}
      <Typography
        sx={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.5rem',
          color: '#fff',
          mb: 0.5,
          wordBreak: 'break-word',
        }}
      >
        {word}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', lineHeight: 1 }}>{colors.icon}</Typography>
      <Typography
        sx={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.35rem',
          color: 'rgba(255,255,255,0.7)',
          mt: 0.5,
        }}
      >
        {correctCount}/{totalAttempts}
      </Typography>
    </Box>
  )
}
