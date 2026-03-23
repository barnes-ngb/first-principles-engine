import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

const STORY_SUGGESTIONS = [
  'Lost in a mysterious place',
  'Found something magical',
  'On a rescue mission',
  'Escaped from somewhere scary',
  'Discovered a secret',
] as const

interface StorySetupStepProps {
  value: string
  onChange: (setup: string) => void
}

export default function StorySetupStep({ value, onChange }: StorySetupStepProps) {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What's the story about?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tell me about your adventure! Who is it about and what happens to them?
      </Typography>

      <TextField
        fullWidth
        multiline
        minRows={3}
        maxRows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="A knight finds a magic door in the forest and has to figure out where it goes..."
        inputMode="text"
        slotProps={{
          input: { sx: { fontSize: '1.1rem' } },
        }}
        sx={{ mb: 2 }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Need an idea? Tap one:
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {STORY_SUGGESTIONS.map((suggestion) => (
          <Chip
            key={suggestion}
            label={suggestion}
            onClick={() => onChange(suggestion)}
            variant={value === suggestion ? 'filled' : 'outlined'}
            color={value === suggestion ? 'primary' : 'default'}
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Box>
    </Box>
  )
}
