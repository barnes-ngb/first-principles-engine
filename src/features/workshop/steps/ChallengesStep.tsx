import { useCallback, useImperativeHandle, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import type { StoryChallenge } from '../../../core/types'
import { ChallengeCardType } from '../../../core/types/workshop'
import { useTapToHearMulti } from '../useTapToHear'
import type { TapToHearRef } from '../workshopTypes'

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
  stepRef?: React.Ref<TapToHearRef>
}

export default function ChallengesStep({ value, onChange, stepRef }: ChallengesStepProps) {
  const [customIdea, setCustomIdea] = useState('')

  // Extract typed challenge types for the multi-select hook
  const selectedTypes = value
    .filter((c) => c.type !== 'custom')
    .map((c) => c.type as ChallengeCardType)

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

  const tap = useTapToHearMulti(selectedTypes, toggleChallengeType)

  useImperativeHandle(stepRef, () => ({
    confirmHighlighted: tap.confirmHighlighted,
  }))

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
        Tap to hear, tap again to pick!
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
          const state = tap.getTileState(option.type)
          const isActive = state !== 'idle'
          return (
            <Box
              key={option.type}
              onClick={() => tap.handleTileTap(option.type, option.label)}
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 2,
                borderRadius: 2,
                border: '3px solid',
                borderColor:
                  state === 'selected'
                    ? 'primary.main'
                    : state === 'highlighted'
                      ? 'secondary.main'
                      : 'divider',
                bgcolor:
                  state === 'selected'
                    ? 'primary.light'
                    : state === 'highlighted'
                      ? 'secondary.light'
                      : 'background.paper',
                cursor: 'pointer',
                transition: 'all 0.2s',
                transform: state === 'highlighted' ? 'scale(1.05)' : 'scale(1)',
                boxShadow: state === 'highlighted' ? '0 0 12px rgba(156,39,176,0.3)' : 'none',
                '&:hover': { borderColor: 'primary.main' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Typography sx={{ fontSize: '2rem' }}>{option.emoji}</Typography>
              <Typography variant="body2" sx={{ fontWeight: isActive ? 700 : 400 }}>
                {option.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: 'center', mt: 0.5 }}
              >
                {option.description}
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

      {/* Custom challenge ideas */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Got your own tricky idea?
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <TextField
            fullWidth
            value={customIdea}
            onChange={(e) => setCustomIdea(e.target.value)}
            placeholder="Type a custom challenge idea..."
            inputMode="text"
            slotProps={{
              input: { sx: { fontSize: '1.1rem' } },
              htmlInput: { style: { minHeight: 48 } },
            }}
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
