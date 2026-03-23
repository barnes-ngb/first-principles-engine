import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { AdventureLength } from '../../../core/types/workshop'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

const LENGTH_OPTIONS = [
  {
    value: AdventureLength.Short,
    label: 'Short',
    emoji: '\u26A1',
    description: 'About 5 choices',
    time: '~5 min',
  },
  {
    value: AdventureLength.Medium,
    label: 'Medium',
    emoji: '\uD83D\uDCD6',
    description: 'About 8 choices',
    time: '~10 min',
  },
  {
    value: AdventureLength.Long,
    label: 'Long',
    emoji: '\uD83D\uDDFA\uFE0F',
    description: 'About 12 choices',
    time: '~15 min',
  },
] as const

interface AdventureLengthStepProps {
  value: string
  onChange: (length: AdventureLength) => void
  stepRef?: React.Ref<TapToHearRef>
}

export default function AdventureLengthStep({ value, onChange, stepRef }: AdventureLengthStepProps) {
  const tap = useTapToHear<AdventureLength>(
    (value || '') as AdventureLength,
    onChange,
  )

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        How long should your adventure be?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap to hear, tap again to pick!
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1.5,
        }}
      >
        {LENGTH_OPTIONS.map((option) => {
          const state = tap.getTileState(option.value)
          const isActive = state !== 'idle'
          return (
            <Box
              key={option.value}
              onClick={() =>
                tap.handleTileTap(option.value, `${option.label}. ${option.description}`)
              }
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
                minHeight: 100,
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
              <Typography variant="caption" color="text.secondary">
                {option.time}
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
