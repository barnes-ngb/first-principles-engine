import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { CardMechanic } from '../../../core/types/workshop'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

const MECHANIC_OPTIONS = [
  {
    value: CardMechanic.Matching,
    label: 'Matching',
    emoji: '\uD83D\uDD04',
    description: 'Flip cards and find pairs! Like Memory.',
  },
  {
    value: CardMechanic.Collecting,
    label: 'Collecting',
    emoji: '\u2B50',
    description: 'Collect sets of cards! Like Go Fish.',
  },
  {
    value: CardMechanic.Battle,
    label: 'Battle',
    emoji: '\u2694\uFE0F',
    description: 'Play cards against each other! Highest card wins.',
  },
] as const

interface CardMechanicStepProps {
  value: string
  onChange: (mechanic: string) => void
  stepRef?: React.Ref<TapToHearRef>
}

export default function CardMechanicStep({ value, onChange, stepRef }: CardMechanicStepProps) {
  const tap = useTapToHear(value, onChange)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        How do you play?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick one! Tap to hear, tap again to pick!
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {MECHANIC_OPTIONS.map((option) => {
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
                alignItems: 'center',
                gap: 2,
                p: 2.5,
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
                transition: 'all 0.2s',
                transform: state === 'highlighted' ? 'scale(1.02)' : 'scale(1)',
                boxShadow: state === 'highlighted' ? '0 0 12px rgba(156,39,176,0.3)' : 'none',
                '&:hover': { borderColor: 'primary.main', transform: 'scale(1.01)' },
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              <Typography sx={{ fontSize: '2.5rem' }}>{option.emoji}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: isActive ? 700 : 600 }}>
                  {option.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                  {option.description}
                </Typography>
              </Box>
              {isActive && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    tap.replayTTS(`${option.label}. ${option.description}`)
                  }}
                  sx={{ color: 'primary.main', p: 0.5 }}
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
