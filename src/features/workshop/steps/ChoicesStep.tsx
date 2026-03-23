import { useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTTS } from '../../../core/hooks/useTTS'

const CHOICE_TEMPLATES = [
  'Go left or go right',
  'Fight or hide',
  'Open it or leave it',
  'Trust the stranger or run',
  'Use magic or use strength',
] as const

interface ChoicesStepProps {
  value: string[]
  onChange: (choices: string[]) => void
}

export default function ChoicesStep({ value, onChange }: ChoicesStepProps) {
  const tts = useTTS({ rate: 0.85 })

  const handleAdd = useCallback(() => {
    onChange([...value, ''])
  }, [value, onChange])

  const handleUpdate = useCallback(
    (index: number, text: string) => {
      const updated = [...value]
      updated[index] = text
      onChange(updated)
    },
    [value, onChange],
  )

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  const handleTemplateAdd = useCallback(
    (template: string) => {
      if (!value.includes(template)) {
        tts.cancel()
        tts.speak(template)
        onChange([...value, template])
      }
    },
    [value, onChange, tts],
  )

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What choices happen?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        In your story, what choices do people get to make? Like... do they go left or right? Do they
        open the chest or leave it?
      </Typography>

      {/* Template chips */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Tap to add a choice idea:
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {CHOICE_TEMPLATES.map((template) => {
          const isAdded = value.includes(template)
          return (
            <Chip
              key={template}
              label={template}
              onClick={() => !isAdded && handleTemplateAdd(template)}
              variant={isAdded ? 'filled' : 'outlined'}
              color={isAdded ? 'primary' : 'default'}
              disabled={isAdded}
              sx={{ cursor: isAdded ? 'default' : 'pointer' }}
            />
          )
        })}
      </Box>

      {/* Custom choice entries */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
        {value.map((choice, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              value={choice}
              onChange={(e) => handleUpdate(index, e.target.value)}
              placeholder={`Choice ${index + 1}...`}
              inputMode="text"
            />
            <IconButton size="small" color="error" onClick={() => handleRemove(index)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Box>

      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={handleAdd}
        disabled={value.length >= 8}
      >
        Add Your Own Choice
      </Button>

      {value.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {value.filter((c) => c.trim()).length} choice{value.filter((c) => c.trim()).length !== 1 ? 's' : ''} — the
          AI will use these to build your branching story!
        </Typography>
      )}
    </Box>
  )
}
