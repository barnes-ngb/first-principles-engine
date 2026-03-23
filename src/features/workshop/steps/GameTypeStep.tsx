import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { GameType } from '../../../core/types/workshop'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

const GAME_TYPE_OPTIONS = [
  {
    value: GameType.Board,
    label: 'Board Game',
    emoji: '\uD83C\uDFB2',
    description: 'Race to the finish! Roll dice, draw cards, play together.',
  },
  {
    value: GameType.Adventure,
    label: 'Adventure Story',
    emoji: '\uD83D\uDCD6',
    description: 'Tell a story with choices! Everyone decides what happens next.',
  },
] as const

interface GameTypeStepProps {
  value: string
  onChange: (gameType: string) => void
  stepRef?: React.Ref<TapToHearRef>
}

export default function GameTypeStep({ value, onChange, stepRef }: GameTypeStepProps) {
  const tap = useTapToHear(value, onChange)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What kind of game?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap to hear, tap again to pick!
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 2,
        }}
      >
        {GAME_TYPE_OPTIONS.map((option) => {
          const state = tap.getTileState(option.value)
          const isActive = state !== 'idle'
          return (
            <Box
              key={option.value}
              onClick={() =>
                tap.handleTileTap(
                  option.value,
                  `${option.label}. ${option.description}`,
                )
              }
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3,
                borderRadius: 3,
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
                minHeight: 160,
                transition: 'all 0.2s',
                transform: state === 'highlighted' ? 'scale(1.05)' : 'scale(1)',
                boxShadow: state === 'highlighted' ? '0 0 12px rgba(156,39,176,0.3)' : 'none',
                '&:hover': { borderColor: 'primary.main', transform: 'scale(1.03)' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Typography sx={{ fontSize: '3rem', mb: 1 }}>{option.emoji}</Typography>
              <Typography variant="h6" sx={{ fontWeight: isActive ? 700 : 600, textAlign: 'center' }}>
                {option.label}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', mt: 0.5, lineHeight: 1.3 }}
              >
                {option.description}
              </Typography>
              {isActive && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    tap.replayTTS(`${option.label}. ${option.description}`)
                  }}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
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
