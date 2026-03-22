import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

const GOAL_OPTIONS = [
  { value: 'find_treasure', label: 'Find the Treasure', emoji: '\uD83D\uDCB0' },
  { value: 'rescue', label: 'Rescue Someone', emoji: '\uD83E\uDDB8' },
  { value: 'race', label: 'Win the Race', emoji: '\uD83C\uDFC1' },
  { value: 'escape', label: 'Escape!', emoji: '\uD83C\uDFC3' },
  { value: 'build', label: 'Build Something', emoji: '\uD83D\uDD28' },
] as const

interface GoalStepProps {
  value: string
  onChange: (goal: string) => void
  stepRef?: React.Ref<TapToHearRef>
}

export default function GoalStep({ value, onChange, stepRef }: GoalStepProps) {
  const tap = useTapToHear(value, onChange)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

  const isCustom = value !== '' && !GOAL_OPTIONS.some((o) => o.value === value)

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What are they trying to do?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap to hear, tap again to pick!
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 1.5,
          mb: 3,
        }}
      >
        {GOAL_OPTIONS.map((option) => {
          const state = tap.getTileState(option.value)
          const isActive = state !== 'idle'
          return (
            <Box
              key={option.value}
              onClick={() => tap.handleTileTap(option.value, option.label)}
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
                '&:hover': { borderColor: 'primary.main', transform: 'scale(1.03)' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: isActive ? 700 : 400, textAlign: 'center' }}
              >
                {option.label}
              </Typography>
              {isActive && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    tap.replayTTS(option.label)
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

      <TextField
        fullWidth
        value={isCustom ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tell me your own quest..."
        label="My Own Quest"
        inputMode="text"
        slotProps={{
          input: { sx: { fontSize: '1.1rem' } },
          htmlInput: { style: { minHeight: 48 } },
        }}
      />
    </Box>
  )
}
