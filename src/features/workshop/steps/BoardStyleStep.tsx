import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { BoardStyle, BoardLength } from '../../../core/types/workshop'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

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
  stepRef?: React.Ref<TapToHearRef>
}

export default function BoardStyleStep({
  boardStyle,
  boardLength,
  onStyleChange,
  onLengthChange,
  stepRef,
}: BoardStyleStepProps) {
  const styleTap = useTapToHear<BoardStyle>(boardStyle || ('' as BoardStyle), onStyleChange)
  const lengthTap = useTapToHear<BoardLength>(boardLength || ('' as BoardLength), onLengthChange)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: () => {
      styleTap.confirmHighlighted()
      lengthTap.confirmHighlighted()
    },
  }))

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
        {STYLE_OPTIONS.map((option) => {
          const state = styleTap.getTileState(option.value)
          const isActive = state !== 'idle'
          return (
            <Box
              key={option.value}
              onClick={() => styleTap.handleTileTap(option.value, option.label)}
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                borderRadius: 2,
                border: '3px solid',
                borderColor:
                  state === 'confirmed'
                    ? 'primary.main'
                    : state === 'highlighted'
                      ? 'secondary.main'
                      : 'divider',
                bgcolor:
                  state === 'confirmed'
                    ? 'primary.light'
                    : state === 'highlighted'
                      ? 'secondary.light'
                      : 'background.paper',
                cursor: 'pointer',
                minHeight: 90,
                transition: 'all 0.2s',
                transform: state === 'highlighted' ? 'scale(1.05)' : 'scale(1)',
                boxShadow: state === 'highlighted' ? '0 0 12px rgba(156,39,176,0.3)' : 'none',
                '&:hover': { borderColor: 'primary.main' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
              <Typography variant="body2" sx={{ fontWeight: isActive ? 700 : 400 }}>
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.description}
              </Typography>
              {isActive && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    styleTap.replayTTS(option.label)
                  }}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    color: 'primary.main',
                    p: 0.5,
                  }}
                >
                  <VolumeUpIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )
        })}
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
        {LENGTH_OPTIONS.map((option) => {
          const state = lengthTap.getTileState(option.value)
          const isActive = state !== 'idle'
          return (
            <Box
              key={option.value}
              onClick={() => lengthTap.handleTileTap(option.value, option.label)}
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                borderRadius: 2,
                border: '3px solid',
                borderColor:
                  state === 'confirmed'
                    ? 'primary.main'
                    : state === 'highlighted'
                      ? 'secondary.main'
                      : 'divider',
                bgcolor:
                  state === 'confirmed'
                    ? 'primary.light'
                    : state === 'highlighted'
                      ? 'secondary.light'
                      : 'background.paper',
                cursor: 'pointer',
                minHeight: 80,
                transition: 'all 0.2s',
                transform: state === 'highlighted' ? 'scale(1.05)' : 'scale(1)',
                boxShadow: state === 'highlighted' ? '0 0 12px rgba(156,39,176,0.3)' : 'none',
                '&:hover': { borderColor: 'primary.main' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: isActive ? 700 : 400 }}>
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.description}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ~{option.spaces} spaces
              </Typography>
              {isActive && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    lengthTap.replayTTS(option.label)
                  }}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    color: 'primary.main',
                    p: 0.5,
                  }}
                >
                  <VolumeUpIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
