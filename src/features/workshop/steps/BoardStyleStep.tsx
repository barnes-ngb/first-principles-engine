import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { BoardStyle, BoardLength } from '../../../core/types/workshop'

const STYLE_OPTIONS = [
  { value: BoardStyle.Winding, label: 'Winding Path', emoji: '\uD83D\uDC0D', description: 'Like Candy Land' },
  { value: BoardStyle.Grid, label: 'Grid', emoji: '\u2B1C', description: 'Like a checkerboard' },
  { value: BoardStyle.Circle, label: 'Circle', emoji: '\uD83D\uDD04', description: 'Round and round' },
] as const

const LENGTH_OPTIONS = [
  { value: BoardLength.Short, label: 'Short', spaces: 15, description: 'Quick game' },
  { value: BoardLength.Medium, label: 'Medium', spaces: 25, description: 'Just right' },
  { value: BoardLength.Long, label: 'Long', spaces: 35, description: 'Big adventure' },
] as const

interface BoardStyleStepProps {
  boardStyle: BoardStyle | ''
  boardLength: BoardLength | ''
  onStyleChange: (style: BoardStyle) => void
  onLengthChange: (length: BoardLength) => void
}

export default function BoardStyleStep({
  boardStyle,
  boardLength,
  onStyleChange,
  onLengthChange,
}: BoardStyleStepProps) {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        How does your game look?
      </Typography>

      {/* Board style */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        What shape should your game board be?
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1.5,
          mb: 3,
        }}
      >
        {STYLE_OPTIONS.map((option) => (
          <Box
            key={option.value}
            onClick={() => onStyleChange(option.value)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
              borderRadius: 2,
              border: '2px solid',
              borderColor: boardStyle === option.value ? 'primary.main' : 'divider',
              bgcolor: boardStyle === option.value ? 'primary.light' : 'background.paper',
              cursor: 'pointer',
              minHeight: 90,
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.main' },
              '&:active': { transform: 'scale(0.97)' },
            }}
          >
            <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
            <Typography variant="body2" sx={{ fontWeight: boardStyle === option.value ? 700 : 400 }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {option.description}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Board length */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        How long should the adventure be?
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1.5,
        }}
      >
        {LENGTH_OPTIONS.map((option) => (
          <Box
            key={option.value}
            onClick={() => onLengthChange(option.value)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
              borderRadius: 2,
              border: '2px solid',
              borderColor: boardLength === option.value ? 'primary.main' : 'divider',
              bgcolor: boardLength === option.value ? 'primary.light' : 'background.paper',
              cursor: 'pointer',
              minHeight: 80,
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.main' },
              '&:active': { transform: 'scale(0.97)' },
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: boardLength === option.value ? 700 : 400 }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {option.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ~{option.spaces} spaces
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
