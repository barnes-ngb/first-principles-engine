import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import { useSpeechRecognition } from '../core/hooks/useSpeechRecognition'

interface VoiceInputProps {
  /** Current value (controlled) */
  value: string
  /** Called when value changes (from voice or typing) */
  onChange: (value: string) => void
  /** Placeholder text for the text field fallback */
  placeholder?: string
  /** Label above the input */
  label?: string
  /** Whether to allow multi-line text entry */
  multiline?: boolean
  /** Maximum rows for multiline */
  maxRows?: number
}

export default function VoiceInput({
  value,
  onChange,
  placeholder = 'Tap the mic or type here...',
  label,
  multiline = false,
  maxRows = 3,
}: VoiceInputProps) {
  const speech = useSpeechRecognition()
  const [wasListening, setWasListening] = useState(false)

  // When speech recognition produces a final transcript, push it to the value
  useEffect(() => {
    if (speech.transcript) {
      onChange(speech.transcript)
    }
  }, [speech.transcript, onChange])

  // Track when listening stops to capture interim text
  useEffect(() => {
    if (wasListening && !speech.isListening && speech.interimTranscript) {
      onChange(value ? value + ' ' + speech.interimTranscript.trim() : speech.interimTranscript.trim())
    }
    setWasListening(speech.isListening)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isListening])

  const toggleListening = useCallback(() => {
    if (speech.isListening) {
      speech.stop()
    } else {
      speech.reset()
      speech.start()
    }
  }, [speech])

  const displayText = speech.isListening && speech.interimTranscript
    ? (value ? value + ' ' : '') + speech.interimTranscript
    : value

  return (
    <Box sx={{ width: '100%' }}>
      {label && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        {/* Mic button — only show if speech recognition is supported */}
        {speech.isSupported && (
          <IconButton
            onClick={toggleListening}
            aria-label={speech.isListening ? 'Stop listening' : 'Start listening'}
            sx={{
              width: 56,
              height: 56,
              bgcolor: speech.isListening ? 'error.main' : 'primary.main',
              color: 'white',
              flexShrink: 0,
              '&:hover': {
                bgcolor: speech.isListening ? 'error.dark' : 'primary.dark',
              },
              // Pulse animation when listening
              ...(speech.isListening && {
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { transform: 'scale(1)' },
                  '50%': { transform: 'scale(1.1)' },
                },
              }),
            }}
          >
            {speech.isListening ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
        )}

        {/* Text input — always visible as fallback */}
        <TextField
          value={displayText}
          onChange={(e) => {
            if (speech.isListening) speech.stop()
            onChange(e.target.value)
          }}
          placeholder={placeholder}
          fullWidth
          multiline={multiline}
          maxRows={maxRows}
          size="small"
          variant="outlined"
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '1rem',
            },
          }}
        />
      </Box>

      {/* Error message */}
      {speech.error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          Voice input error: {speech.error}. You can type instead.
        </Typography>
      )}

      {/* Listening indicator */}
      {speech.isListening && (
        <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
          Listening...
        </Typography>
      )}
    </Box>
  )
}
