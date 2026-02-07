import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'

type RecordingState = 'idle' | 'recording' | 'recorded'

interface AudioRecorderProps {
  /** Called with the recorded audio Blob when the user confirms. */
  onCapture: (blob: Blob) => void
  /** If true, show a spinner to indicate upload in progress. */
  uploading?: boolean
}

export default function AudioRecorder({ onCapture, uploading }: AudioRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [state, setState] = useState<RecordingState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [audioUrl])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        setState('recorded')
        // Stop all tracks so browser releases the mic
        stream.getTracks().forEach((track) => track.stop())
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }

      recorder.start()
      setState('recording')
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } catch {
      setError('Could not access microphone. Check browser permissions.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
  }, [])

  const handleConfirm = useCallback(() => {
    if (!audioBlob) return
    onCapture(audioBlob)
    // Clean up
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setState('idle')
    setElapsed(0)
  }, [audioBlob, audioUrl, onCapture])

  const handleDiscard = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setState('idle')
    setElapsed(0)
  }, [audioUrl])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <Stack spacing={2}>
      {error && (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      )}

      {state === 'idle' && (
        <Button
          variant="outlined"
          startIcon={<MicIcon />}
          onClick={startRecording}
          sx={{ height: 56 }}
        >
          Start Recording
        </Button>
      )}

      {state === 'recording' && (
        <Stack spacing={1} alignItems="center">
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              bgcolor: 'error.main',
              animation: 'pulse 1s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.4 },
                '100%': { opacity: 1 },
              },
            }}
          />
          <Typography variant="h6" fontFamily="monospace">
            {formatTime(elapsed)}
          </Typography>
          <Button
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            onClick={stopRecording}
            sx={{ height: 56, minWidth: 200 }}
          >
            Stop Recording
          </Button>
        </Stack>
      )}

      {state === 'recorded' && audioUrl && (
        <Stack spacing={2}>
          <Box
            component="audio"
            controls
            src={audioUrl}
            sx={{ width: '100%' }}
          />
          <Typography variant="body2" color="text.secondary">
            Duration: {formatTime(elapsed)}
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={uploading}
              startIcon={uploading ? <CircularProgress size={18} /> : undefined}
            >
              {uploading ? 'Uploading...' : 'Use Recording'}
            </Button>
            <Button variant="outlined" onClick={handleDiscard} disabled={uploading}>
              Discard
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}
