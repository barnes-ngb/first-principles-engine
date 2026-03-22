import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import IconButton from '@mui/material/IconButton'
import type { StoryCharacter } from '../../../core/types'
import { useTTS } from '../../../core/hooks/useTTS'

const TRAIT_OPTIONS = ['fast', 'strong', 'clever', 'kind', 'brave', 'sneaky'] as const

interface CharactersStepProps {
  value: StoryCharacter[]
  onChange: (characters: StoryCharacter[]) => void
}

export default function CharactersStep({ value, onChange }: CharactersStepProps) {
  const [nameInput, setNameInput] = useState('')
  const [highlightedTrait, setHighlightedTrait] = useState<Record<number, string>>({})
  const tts = useTTS({ rate: 0.85 })

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

  const handleTraitTap = useCallback(
    (charIndex: number, trait: string) => {
      const currentHighlight = highlightedTrait[charIndex]

      // If this trait is already the character's confirmed trait, just replay
      if (value[charIndex]?.trait === trait) {
        tts.cancel()
        tts.speak(trait)
        return
      }

      // Second tap on same highlighted trait → confirm
      if (currentHighlight === trait) {
        tts.cancel()
        const updated = value.map((c, i) => (i === charIndex ? { ...c, trait } : c))
        onChange(updated)
        setHighlightedTrait((prev) => {
          const next = { ...prev }
          delete next[charIndex]
          return next
        })
        return
      }

      // First tap → highlight + speak
      tts.cancel()
      tts.speak(trait)
      setHighlightedTrait((prev) => ({ ...prev, [charIndex]: trait }))
    },
    [highlightedTrait, value, onChange, tts],
  )

  const getTraitState = (charIndex: number, trait: string): 'confirmed' | 'highlighted' | 'idle' => {
    if (value[charIndex]?.trait === trait) return 'confirmed'
    if (highlightedTrait[charIndex] === trait) return 'highlighted'
    return 'idle'
  }

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
          <TextField
            fullWidth
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Name your character..."
            inputMode="text"
            slotProps={{
              input: { sx: { fontSize: '1.1rem' } },
              htmlInput: { style: { minHeight: 48 } },
            }}
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
          <Typography variant="caption" color="text.secondary">
            Tap a trait to hear it, tap again to pick!
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {TRAIT_OPTIONS.map((trait) => {
              const state = getTraitState(index, trait)
              const isActive = state !== 'idle'
              return (
                <Box key={trait} sx={{ position: 'relative', display: 'inline-flex' }}>
                  <Chip
                    label={trait}
                    size="medium"
                    variant={state === 'confirmed' ? 'filled' : 'outlined'}
                    color={
                      state === 'confirmed'
                        ? 'primary'
                        : state === 'highlighted'
                          ? 'secondary'
                          : 'default'
                    }
                    onClick={() => handleTraitTap(index, trait)}
                    sx={{
                      cursor: 'pointer',
                      fontWeight: isActive ? 700 : 400,
                      transform: state === 'highlighted' ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.2s',
                      boxShadow:
                        state === 'highlighted' ? '0 0 8px rgba(156,39,176,0.3)' : 'none',
                      pr: isActive ? 3.5 : undefined,
                    }}
                  />
                  {isActive && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        tts.cancel()
                        tts.speak(trait)
                      }}
                      sx={{
                        position: 'absolute',
                        right: 2,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        p: 0.25,
                        color: 'primary.main',
                      }}
                    >
                      <VolumeUpIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              )
            })}
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
