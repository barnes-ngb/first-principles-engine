import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import VoiceInput from '../../../components/VoiceInput'
import type { StoryCharacter } from '../../../core/types'

const TRAIT_OPTIONS = ['fast', 'strong', 'clever', 'kind', 'brave', 'sneaky'] as const

interface CharactersStepProps {
  value: StoryCharacter[]
  onChange: (characters: StoryCharacter[]) => void
}

export default function CharactersStep({ value, onChange }: CharactersStepProps) {
  const [nameInput, setNameInput] = useState('')

  const addCharacter = useCallback(() => {
    const name = nameInput.trim()
    if (!name) return
    onChange([...value, { name, trait: 'brave' }])
    setNameInput('')
  }, [nameInput, value, onChange])

  const removeCharacter = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  const setTrait = useCallback(
    (index: number, trait: string) => {
      const updated = value.map((c, i) => (i === index ? { ...c, trait } : c))
      onChange(updated)
    },
    [value, onChange],
  )

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Who's in your story?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tell me their names!
      </Typography>

      {/* Add character */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <VoiceInput
            value={nameInput}
            onChange={setNameInput}
            placeholder="Say or type a character name..."
          />
        </Box>
        <Button
          variant="contained"
          onClick={addCharacter}
          disabled={!nameInput.trim()}
          sx={{ minHeight: 56, flexShrink: 0 }}
        >
          Add
        </Button>
      </Box>

      {/* Character list */}
      {value.map((character, index) => (
        <Box
          key={index}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: 2,
            mb: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {character.name}
            </Typography>
            <Button size="small" color="error" onClick={() => removeCharacter(index)}>
              Remove
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {TRAIT_OPTIONS.map((trait) => (
              <Chip
                key={trait}
                label={trait}
                size="small"
                variant={character.trait === trait ? 'filled' : 'outlined'}
                color={character.trait === trait ? 'primary' : 'default'}
                onClick={() => setTrait(index, trait)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>
      ))}

      {value.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Add at least one character to continue.
        </Typography>
      )}
    </Box>
  )
}
