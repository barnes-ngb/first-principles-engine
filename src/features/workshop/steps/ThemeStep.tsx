import { useImperativeHandle } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { useTapToHear } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

const THEME_OPTIONS = [
  { value: 'dragons', label: 'Dragons', emoji: '\uD83D\uDC09' },
  { value: 'space', label: 'Space', emoji: '\uD83D\uDE80' },
  { value: 'ocean', label: 'Ocean', emoji: '\uD83C\uDF0A' },
  { value: 'jungle', label: 'Jungle', emoji: '\uD83C\uDF34' },
  { value: 'castle', label: 'Castle', emoji: '\uD83C\uDFF0' },
  { value: 'robots', label: 'Robots', emoji: '\uD83E\uDD16' },
  { value: 'animals', label: 'Animals', emoji: '\uD83D\uDC3B' },
] as const

interface ThemeStepProps {
  value: string
  onChange: (theme: string) => void
  stepRef?: React.Ref<TapToHearRef>
}

export default function ThemeStep({ value, onChange, stepRef }: ThemeStepProps) {
  const tap = useTapToHear(value, onChange)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

  const isCustom = value !== '' && !THEME_OPTIONS.some((o) => o.value === value)

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What's your game about?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap to hear, tap again to pick!
      </Typography>

      {/* Theme tiles */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: 1.5,
          mb: 3,
        }}
      >
        {THEME_OPTIONS.map((option) => {
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
              <Typography variant="body2" sx={{ fontWeight: isActive ? 700 : 400 }}>
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

      {/* Custom theme via text (device keyboard has native dictation mic) */}
      <TextField
        fullWidth
        value={isCustom ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tell me your idea..."
        label="My Own Idea"
        inputMode="text"
        slotProps={{
          input: { sx: { fontSize: '1.1rem' } },
          htmlInput: { style: { minHeight: 48 } },
        }}
      />
    </Box>
  )
}
