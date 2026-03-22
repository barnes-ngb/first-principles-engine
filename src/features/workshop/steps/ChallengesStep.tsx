import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import VoiceInput from '../../../components/VoiceInput'
import type { StoryChallenge } from '../../../core/types'
import { ChallengeCardType } from '../../../core/types/workshop'

const CHALLENGE_TYPE_OPTIONS = [
  {
    type: ChallengeCardType.Reading,
    label: 'Reading',
    emoji: '\uD83D\uDCDA',
    description: 'Read the magic word to move forward!',
  },
  {
    type: ChallengeCardType.Math,
    label: 'Math',
    emoji: '\uD83E\uDDEE',
    description: 'Count the gold coins!',
  },
  {
    type: ChallengeCardType.Story,
    label: 'Story',
    emoji: '\uD83D\uDCAC',
    description: 'Tell everyone what happens next!',
  },
  {
    type: ChallengeCardType.Action,
    label: 'Action',
    emoji: '\uD83C\uDFC3',
    description: 'Do 5 jumping jacks!',
  },
] as const

interface ChallengesStepProps {
  value: StoryChallenge[]
  onChange: (challenges: StoryChallenge[]) => void
}

export default function ChallengesStep({ value, onChange }: ChallengesStepProps) {
  const [customIdea, setCustomIdea] = useState('')

  const toggleChallengeType = useCallback(
    (type: ChallengeCardType) => {
      const existing = value.find((c) => c.type === type)
      if (existing) {
        onChange(value.filter((c) => c.type !== type))
      } else {
        onChange([...value, { type }])
      }
    },
    [value, onChange],
  )

  const addCustomChallenge = useCallback(() => {
    const idea = customIdea.trim()
    if (!idea) return
    onChange([...value, { type: 'custom', idea }])
    setCustomIdea('')
  }, [customIdea, value, onChange])

  const removeChallenge = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What tricky things happen?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick challenge types for your game!
      </Typography>

      {/* Challenge type cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 1.5,
          mb: 3,
        }}
      >
        {CHALLENGE_TYPE_OPTIONS.map((option) => {
          const isSelected = value.some((c) => c.type === option.type)
          return (
            <Box
              key={option.type}
              onClick={() => toggleChallengeType(option.type)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 2,
                borderRadius: 2,
                border: '2px solid',
                borderColor: isSelected ? 'primary.main' : 'divider',
                bgcolor: isSelected ? 'primary.light' : 'background.paper',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'primary.main' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
              <Typography variant="body2" sx={{ fontWeight: isSelected ? 700 : 400 }}>
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 0.5 }}>
                {option.description}
              </Typography>
            </Box>
          )
        })}
      </Box>

      {/* Custom challenge ideas */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Got your own tricky idea?
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <VoiceInput
            value={customIdea}
            onChange={setCustomIdea}
            placeholder="Say a custom challenge idea..."
          />
        </Box>
        <Button
          variant="outlined"
          onClick={addCustomChallenge}
          disabled={!customIdea.trim()}
          sx={{ minHeight: 56, flexShrink: 0 }}
        >
          Add
        </Button>
      </Box>

      {/* Show custom challenges */}
      {value.filter((c) => c.type === 'custom').length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {value.map((challenge, index) =>
            challenge.type === 'custom' ? (
              <Chip
                key={index}
                label={challenge.idea}
                onDelete={() => removeChallenge(index)}
                color="secondary"
                size="small"
              />
            ) : null,
          )}
        </Box>
      )}
    </Box>
  )
}
