import { useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import VoiceInput from '../../../components/VoiceInput'

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
}

export default function ThemeStep({ value, onChange }: ThemeStepProps) {
  const handleTileClick = useCallback(
    (theme: string) => {
      onChange(theme)
    },
    [onChange],
  )

  const isCustom = value !== '' && !THEME_OPTIONS.some((o) => o.value === value)

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What's your game about?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick one or tell me your own idea!
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
        {THEME_OPTIONS.map((option) => (
          <Box
            key={option.value}
            onClick={() => handleTileClick(option.value)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
              borderRadius: 2,
              border: '2px solid',
              borderColor: value === option.value ? 'primary.main' : 'divider',
              bgcolor: value === option.value ? 'primary.light' : 'background.paper',
              cursor: 'pointer',
              minHeight: 80,
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.main', transform: 'scale(1.03)' },
              '&:active': { transform: 'scale(0.97)' },
            }}
          >
            <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
            <Typography variant="body2" sx={{ fontWeight: value === option.value ? 700 : 400 }}>
              {option.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Custom theme via voice or text */}
      <VoiceInput
        value={isCustom ? value : ''}
        onChange={onChange}
        placeholder="Or say your own idea..."
        label="My Own Idea"
      />
    </Box>
  )
}
