import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { CardBackStyle } from '../../../core/types/workshop'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

const CARD_BACK_OPTIONS = [
  {
    value: CardBackStyle.Classic,
    label: 'Classic',
    emoji: '\uD83C\uDFB4',
    description: 'Simple pattern with your theme colors.',
  },
  {
    value: CardBackStyle.Decorated,
    label: 'Decorated',
    emoji: '\u2728',
    description: 'Theme illustrations on the back of every card!',
  },
  {
    value: CardBackStyle.Custom,
    label: 'Custom',
    emoji: '\uD83C\uDFA8',
    description: 'Describe what you want on the back!',
  },
] as const

interface CardStyleStepProps {
  value: string
  customDescription: string
  deckSize: number
  onChange: (style: string) => void
  onCustomChange: (description: string) => void
  stepRef?: React.Ref<TapToHearRef>
}

export default function CardStyleStep({
  value,
  customDescription,
  deckSize,
  onChange,
  onCustomChange,
  stepRef,
}: CardStyleStepProps) {
  const tap = useTapToHear(value, onChange)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        How should your cards look?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick a style for the back of your cards!
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        {CARD_BACK_OPTIONS.map((option) => {
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
                p: 2,
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
                '&:hover': { borderColor: 'primary.main', transform: 'scale(1.01)' },
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: isActive ? 700 : 600 }}>
                  {option.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
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

      {/* Custom description field (shown only when Custom is selected) */}
      {value === CardBackStyle.Custom && (
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Describe what you want on the back of your cards..."
          value={customDescription}
          onChange={(e) => onCustomChange(e.target.value)}
          sx={{ mb: 2 }}
        />
      )}

      {/* Deck size display */}
      <Box
        sx={{
          textAlign: 'center',
          p: 2,
          borderRadius: 2,
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          \uD83C\uDCC3 Your game will have {deckSize} cards!
        </Typography>
      </Box>
    </Box>
  )
}
