import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import type { StoryQuestion } from './useStoryGuide'
import { VoiceState } from './useStoryGuide'

interface Props {
  question: StoryQuestion
  questionNumber: number
  totalQuestions: number
  inputMode: 'voice' | 'type'
  onSetInputMode: (mode: 'voice' | 'type') => void
  typedValue: string
  onTypedChange: (value: string) => void
  voiceState: VoiceState
  transcription: string
  onStartRecording: () => void
  onStopRecording: () => void
  onConfirmTranscription: () => void
  onRetryRecording: () => void
  onAdvance: () => void
  onSkip: () => void
  onBack: () => void
  canGoBack: boolean
  isLincoln: boolean
}

export default function StoryGuideQuestion({
  question,
  questionNumber,
  totalQuestions,
  inputMode,
  onSetInputMode,
  typedValue,
  onTypedChange,
  voiceState,
  transcription,
  onStartRecording,
  onStopRecording,
  onConfirmTranscription,
  onRetryRecording,
  onAdvance,
  onSkip,
  onBack,
  canGoBack,
  isLincoln,
}: Props) {
  const accentColor = isLincoln ? '#4caf50' : '#f06292'
  const bgColor = isLincoln ? 'grey.900' : '#fff8f0'
  const textColor = isLincoln ? 'grey.100' : '#3d3d3d'

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 480, mx: 'auto' }}>
      {/* Progress dots */}
      <Stack direction="row" spacing={1} justifyContent="center">
        {Array.from({ length: totalQuestions }).map((_, i) => (
          <Box
            key={i}
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: i < questionNumber ? accentColor : i === questionNumber - 1 ? accentColor : 'action.disabled',
              opacity: i === questionNumber - 1 ? 1 : i < questionNumber - 1 ? 0.5 : 0.25,
              transition: 'all 0.2s',
            }}
          />
        ))}
      </Stack>

      {/* Question */}
      <Box
        sx={{
          p: 3,
          borderRadius: 3,
          bgcolor: bgColor,
          border: '2px solid',
          borderColor: accentColor,
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            color: textColor,
            ...(isLincoln ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.85rem', lineHeight: 2 } : {}),
            mb: question.hint ? 1.5 : 0,
          }}
        >
          {question.text}
        </Typography>
        {question.hint && (
          <Typography
            variant="body2"
            sx={{ color: isLincoln ? 'grey.400' : 'text.secondary', fontStyle: 'italic' }}
          >
            {question.hint}
          </Typography>
        )}
      </Box>

      {/* Input mode toggle */}
      <Stack direction="row" justifyContent="center">
        <ToggleButtonGroup
          value={inputMode}
          exclusive
          onChange={(_, val) => {
            if (val) onSetInputMode(val as 'voice' | 'type')
          }}
          size="small"
        >
          <ToggleButton value="voice" sx={{ textTransform: 'none', gap: 0.5 }}>
            <MicIcon fontSize="small" />
            Voice
          </ToggleButton>
          <ToggleButton value="type" sx={{ textTransform: 'none', gap: 0.5 }}>
            <KeyboardIcon fontSize="small" />
            Type
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Input area */}
      {inputMode === 'type' ? (
        <TextField
          multiline
          minRows={2}
          maxRows={4}
          placeholder="Type your answer here..."
          value={typedValue}
          onChange={(e) => onTypedChange(e.target.value)}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '1.1rem',
            },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && typedValue.trim()) {
              e.preventDefault()
              onAdvance()
            }
          }}
        />
      ) : (
        /* Voice area */
        <Stack alignItems="center" spacing={2}>
          {voiceState === VoiceState.Idle && (
            <IconButton
              onClick={onStartRecording}
              sx={{
                width: 72,
                height: 72,
                bgcolor: accentColor,
                color: '#fff',
                '&:hover': { bgcolor: accentColor, opacity: 0.85 },
              }}
              aria-label="Start recording"
            >
              <MicIcon sx={{ fontSize: 36 }} />
            </IconButton>
          )}

          {voiceState === VoiceState.Recording && (
            <>
              <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
                Listening...
              </Typography>
              <IconButton
                onClick={onStopRecording}
                sx={{
                  width: 72,
                  height: 72,
                  bgcolor: 'error.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'error.dark' },
                  animation: 'pulse 1s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { transform: 'scale(1)' },
                    '50%': { transform: 'scale(1.05)' },
                  },
                }}
                aria-label="Stop recording"
              >
                <StopIcon sx={{ fontSize: 36 }} />
              </IconButton>
            </>
          )}

          {voiceState === VoiceState.Confirming && (
            <Stack spacing={2} sx={{ width: '100%' }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isLincoln ? 'grey.800' : '#f3f0ff',
                  border: '1px solid',
                  borderColor: accentColor,
                }}
              >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  I heard:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {transcription}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} justifyContent="center">
                <Button
                  variant="contained"
                  onClick={onConfirmTranscription}
                  sx={{ bgcolor: accentColor, '&:hover': { bgcolor: accentColor, opacity: 0.85 } }}
                >
                  ✓ Yes, that's right!
                </Button>
                <Button variant="outlined" onClick={onRetryRecording}>
                  🔄 Try Again
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      )}

      {/* Navigation */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button
          variant="text"
          onClick={onBack}
          disabled={!canGoBack}
          sx={{ textTransform: 'none', color: 'text.secondary' }}
        >
          ← Back
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="text"
          onClick={onSkip}
          sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.8rem' }}
        >
          Skip
        </Button>
        <Button
          variant="contained"
          onClick={
            inputMode === 'voice' && voiceState === VoiceState.Confirming
              ? onConfirmTranscription
              : onAdvance
          }
          disabled={inputMode === 'voice' && voiceState === VoiceState.Recording}
          sx={{
            bgcolor: accentColor,
            '&:hover': { bgcolor: accentColor, opacity: 0.85 },
            minWidth: 100,
            textTransform: 'none',
            fontWeight: 700,
          }}
        >
          Next →
        </Button>
      </Stack>
    </Stack>
  )
}
