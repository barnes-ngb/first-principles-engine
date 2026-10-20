import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import FileUploadIcon from '@mui/icons-material/FileUpload'

type RecordingState = 'idle' | 'recording' | 'recorded'

interface AudioRecorderProps {
  /** Called with the recorded (or uploaded) audio Blob/File when the user confirms. */
  onCapture: (blob: Blob) => void
  /** If true, show a spinner to indicate upload in progress. */
  uploading?: boolean
  /** If true, show an "Upload audio file" control beside the recorder. */
  allowUpload?: boolean
  /**
   * Called when this recorder's OWN pending draft changes — a recording
   * started, a take finished, a take discarded. Optional: a host that does not
   * pass it behaves exactly as before.
   *
   * The start case fires SYNCHRONOUSLY, before `getUserMedia` is awaited, so a
   * host hears that a newer draft exists before any of its own in-flight save
   * can finish and decide the form is clear-able (capture draft protection,
   * G1/G2). Confirming a take and uploading a file are submissions, not draft
   * changes, and go through `onCapture` alone.
   */
  onDraftChange?: () => void
  /**
   * **Direct staging (FIX-267, opt-in).** A finished take goes straight to
   * `onCapture` and this component returns to idle, so the host holds the only
   * copy of it and renders the only preview.
   *
   * Without it there are two drafts: a take sitting in this component's
   * *recorded* state is visible to the parent but absent from the host's own
   * draft, so the host's Save wrote the log without the recording on screen.
   * Every existing caller leaves this `false` and keeps the preview, the
   * *Use Recording* / *Discard* pair and the commit-on-confirm behaviour.
   */
  stageDirect?: boolean
  /**
   * Whether a recording is in progress (FIX-267, opt-in).
   *
   * A host that saves on its own button must not write while the microphone is
   * still running, or the log is filed without the take being recorded for it.
   */
  onBusyChange?: (busy: boolean) => void
}

export default function AudioRecorder({
  onCapture,
  uploading,
  allowUpload,
  onDraftChange,
  stageDirect,
  onBusyChange,
}: AudioRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<RecordingState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /**
   * The microphone has been asked for and has not answered.
   *
   * Busy begins HERE rather than when `getUserMedia` resolves: a host that
   * saves on its own button would otherwise save during the permission prompt,
   * and a prompt answered after the surface was replaced would acquire a live
   * stream nobody can stop.
   */
  const [awaitingPermission, setAwaitingPermission] = useState(false)

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [audioUrl])

  // Anything this recorder is still holding is a draft the host has not got.
  useEffect(() => {
    onBusyChange?.(awaitingPermission || state === 'recording')
  }, [awaitingPermission, state, onBusyChange])

  /**
   * Liveness, per mount AND per request.
   *
   * `MediaRecorder.onstop` and a pending permission prompt both resolve after
   * the unmount that cancelled them, and such a take belongs to a scope that is
   * no longer on screen. Two things decide that:
   *
   *   • `liveRef`, which the effect SETS TRUE on setup — StrictMode runs
   *     setup → cleanup → setup, so a flag only the cleanup wrote stayed false
   *     for the real mount and every recording after it was refused;
   *   • `generationRef`, bumped by every cleanup, which an async step compares
   *     itself against so a request from the previous mount cannot pass as this
   *     one's.
   */
  const liveRef = useRef(true)
  const generationRef = useRef(0)
  /** The latest `onBusyChange`, for the cleanup, which cannot read props. */
  const busyReportRef = useRef(onBusyChange)
  // Assigned in an effect, never during render (`react-hooks/refs`).
  useEffect(() => {
    busyReportRef.current = onBusyChange
  }, [onBusyChange])

  const releaseRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null
    if (!recorder) return
    recorder.stream.getTracks().forEach((track) => track.stop())
    if (recorder.state !== 'inactive') recorder.stop()
  }, [])

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
      generationRef.current += 1
      busyReportRef.current?.(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      releaseRecorder()
    }
  }, [releaseRecorder])

  const startRecording = useCallback(async () => {
    // One request at a time: a second tap during the prompt would acquire a
    // second stream and leave the first with no Stop.
    if (awaitingPermission || state === 'recording') return
    setError(null)
    // Before the permission prompt is awaited: tapping record is already a new
    // draft, whatever the microphone then says.
    onDraftChange?.()
    setAwaitingPermission(true)
    const generation = generationRef.current
    const stillMine = () => liveRef.current && generationRef.current === generation
    let started = false
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!stillMine()) {
        // The prompt was answered after this surface was replaced. Release the
        // stream immediately rather than starting a recording nobody can see.
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // Stop all tracks so browser releases the mic — first, and whatever
        // else this handler then decides to do.
        recorder.stream.getTracks().forEach((track) => track.stop())
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        // Gone: this take belongs to a scope that is no longer on screen.
        if (!stillMine()) return
        // A take now exists where none did: a draft change, not a submission.
        onDraftChange?.()
        if (stageDirect) {
          // The host holds the take and renders the only preview, so there is
          // no second copy here for its Save to miss.
          onCapture(blob)
          setState('idle')
          setElapsed(0)
          return
        }
        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        setState('recorded')
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      started = true
      setElapsed(0)
      // Both in one batch, so busy never blinks false between them.
      setAwaitingPermission(false)
      setState('recording')
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } catch {
      // A refusal, a cancel, or a recorder that could not be constructed or
      // started after the stream was acquired: release the microphone either
      // way, and never leave the host waiting on a request that is over.
      stream?.getTracks().forEach((track) => track.stop())
      mediaRecorderRef.current = null
      if (stillMine()) setError('Could not access microphone. Check browser permissions.')
    } finally {
      if (!started) setAwaitingPermission(false)
    }
  }, [awaitingPermission, state, onDraftChange, onCapture, stageDirect])

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
    onDraftChange?.()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setState('idle')
    setElapsed(0)
  }, [audioUrl, onDraftChange])

  const handleFileSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) onCapture(selected)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onCapture])

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
        <Stack spacing={1}>
          <Button
            variant="outlined"
            startIcon={<MicIcon />}
            onClick={startRecording}
            disabled={awaitingPermission}
            sx={{ height: 56 }}
          >
            {awaitingPermission ? 'Waiting for the microphone…' : 'Start Recording'}
          </Button>
          {awaitingPermission && (
            <Typography variant="caption" color="text.secondary" role="status">
              Allow the microphone to start recording.
            </Typography>
          )}
          {allowUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelected}
                style={{ display: 'none' }}
              />
              <Button
                variant="text"
                startIcon={<FileUploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Upload audio file
              </Button>
            </>
          )}
        </Stack>
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
