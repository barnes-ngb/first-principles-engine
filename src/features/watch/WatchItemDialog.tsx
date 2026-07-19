import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'

import VoiceInput from '../../components/VoiceInput'
import type { WatchVideo } from '../../core/types'
import WatchPlayer from './WatchPlayer'

interface WatchItemDialogProps {
  /** The curated video this planned item points at (resolved from `watchVideoId`). */
  video: WatchVideo | null
  open: boolean
  onClose: () => void
  /**
   * Fired from the end-of-video "Mark it done" action with the optional note.
   * The caller credits the planned minutes + leaves the portfolio artifact
   * (slice 3). Never fired from the error/close path — an errored or abandoned
   * watch never completes.
   */
  onComplete: (note?: string) => void
  /** When set, offer voice dictation for the note (ETHOS-04 — dictation counts). */
  voiceProfile?: { id: string; voiceInputEnhanced?: boolean }
}

/**
 * Watch Vehicle — the PLANNED Today player (FEAT-103 / design FEAT-86, slice 3).
 *
 * Wraps the shared, safety-hardened `WatchPlayer` (embed + end-stop + app-owned
 * fullscreen) and adds the completion beat: after the video ends, an OPTIONAL
 * "what we saw" note and a "Mark it done" action that hands the note back so the
 * caller can credit hours + leave an artifact. The note never blocks completion
 * and carries no shame copy when skipped.
 *
 * Distinct from `WatchPlayerDialog` (the library *practice* host), which passes
 * no `onComplete` and therefore writes nothing — only planned watching counts.
 */
export default function WatchItemDialog({
  video,
  open,
  onClose,
  onComplete,
  voiceProfile,
}: WatchItemDialogProps) {
  const [note, setNote] = useState('')

  // Reset the note when the target video changes (render-phase state adjustment,
  // the React-recommended pattern; see useWatchLibrary) so a note never carries
  // from one video to the next.
  const videoId = video?.id ?? null
  const [trackedVideoId, setTrackedVideoId] = useState(videoId)
  if (trackedVideoId !== videoId) {
    setTrackedVideoId(videoId)
    setNote('')
  }

  const handleComplete = () => {
    const trimmed = note.trim()
    onComplete(trimmed.length > 0 ? trimmed : undefined)
  }

  const completionExtra = (
    <Stack spacing={1} sx={{ width: '100%', maxWidth: 420 }}>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Want to jot what you saw? (optional)
      </Typography>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What we saw…"
          multiline
          minRows={2}
          fullWidth
          size="small"
        />
        {voiceProfile && (
          <VoiceInput
            profile={voiceProfile}
            sourceSurface="watch-what-we-saw"
            size="small"
            onTranscript={(text) => setNote((prev) => (prev ? `${prev} ${text}` : text))}
          />
        )}
      </Stack>
    </Stack>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Watch
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* key by video so switching remounts fresh player + note state. */}
        {video && (
          <WatchPlayer
            key={video.id}
            video={video}
            onDone={onClose}
            onComplete={handleComplete}
            doneLabel="Mark it done"
            completionExtra={completionExtra}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
