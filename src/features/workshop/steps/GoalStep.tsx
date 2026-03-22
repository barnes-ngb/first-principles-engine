import { useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import VoiceInput from '../../../components/VoiceInput'

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
}

export default function GoalStep({ value, onChange }: GoalStepProps) {
  const handleOptionClick = useCallback(
    (goal: string) => {
      onChange(goal)
    },
    [onChange],
  )

  const isCustom = value !== '' && !GOAL_OPTIONS.some((o) => o.value === value)

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What are they trying to do?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick a quest or tell me your own!
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 1.5,
          mb: 3,
        }}
      >
        {GOAL_OPTIONS.map((option) => (
          <Box
            key={option.value}
            onClick={() => handleOptionClick(option.value)}
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
            <Typography
              variant="body2"
              sx={{ fontWeight: value === option.value ? 700 : 400, textAlign: 'center' }}
            >
              {option.label}
            </Typography>
          </Box>
        ))}
      </Box>

      <VoiceInput
        value={isCustom ? value : ''}
        onChange={onChange}
        placeholder="Or say your own quest..."
        label="My Own Quest"
      />
    </Box>
  )
}
