// ── One capture surface for a strand session (UX-283) ────────────────────────
//
// A topic, and any of a photo, a recording, a note or a link — the same four
// `EvidenceType`s, because they are already the four.
//
// **It reuses the existing capture components rather than becoming a fifth.**
// `PhotoCapture` (staging mode, so several shots commit as one batch),
// `AudioRecorder` and `VoiceInput` are dropped in as they are; this file
// composes and refuses, it does not re-implement a camera, a recorder or a
// transcriber. The write is the single `logStrandSession`, and the refusal
// sentences are that module's, not a second wording of the same rule.
//
// **Voice and photo are first-class, not an afterthought.** TEST-216 is on the
// ledger because `KidLabView` has five typed fields and no voice input; this
// surface does not add a sixth typed-only door. The note field carries a
// `VoiceInput` beside it, and it is the same control the rest of the app uses.
//
// **Parent-gated on capability, never on a name.** The Curriculum tab renders
// for a kid profile today, and a session write moves a curriculum row's count —
// so the dialog refuses to render its controls for a child profile and the
// write is guarded again in the host.

import { useCallback, useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import VoiceInput from '../../components/VoiceInput'
import type { ActivityConfig } from '../../core/types'
import { strandSessionStandingLine, topicSuggestions } from './strand'
import {
  evidenceKinds,
  planStrandSession,
  type StrandSessionEvidence,
} from './strandSession'

export interface StrandSessionDialogProps {
  open: boolean
  config: ActivityConfig
  /** The profile capturing. A child profile gets the read-only refusal. */
  isChildProfile: boolean
  /** Passed to `VoiceInput` for engine selection. */
  voiceProfile: { id: string; voiceInputEnhanced?: boolean }
  saving?: boolean
  /** Set when the write failed — rendered without closing, so nothing is lost. */
  error?: string | null
  onClose: () => void
  onSave: (topic: string, evidence: StrandSessionEvidence) => void
}

const PARENT_ONLY_NOTICE =
  'A grown-up records a session — it changes what this subject has covered.'

export default function StrandSessionDialog({
  open,
  config,
  isChildProfile,
  voiceProfile,
  saving,
  error,
  onClose,
  onSave,
}: StrandSessionDialogProps) {
  const [topic, setTopic] = useState('')
  const [note, setNote] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [audio, setAudio] = useState<Blob | null>(null)

  const evidence: StrandSessionEvidence = useMemo(
    () => ({ photos, audio, note, videoUrl }),
    [photos, audio, note, videoUrl],
  )

  // The same decision the writer will make, so the button's enabled state and
  // the refusal a save would produce can never disagree.
  const decision = planStrandSession(config, topic, evidence)
  const kinds = evidenceKinds(evidence)

  const suggestions = topicSuggestions(config)

  const reset = useCallback(() => {
    setTopic('')
    setNote('')
    setVideoUrl('')
    setPhotos([])
    setAudio(null)
  }, [])

  const handleClose = useCallback(() => {
    if (saving) return
    reset()
    onClose()
  }, [saving, reset, onClose])

  const handleSave = useCallback(() => {
    if (!decision.ok) return
    onSave(decision.plan.topic, evidence)
  }, [decision, evidence, onSave])

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{`Record a session — ${config.name}`}</DialogTitle>
      <DialogContent>
        {isChildProfile ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            {PARENT_ONLY_NOTICE}
          </Alert>
        ) : (
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {strandSessionStandingLine(config)}
            </Typography>

            {/*
              The topic. Free text with suggestions from what she has used
              before on this strand — most-recent-first, matched on `nameKey`,
              and never a closed list. `freeSolo`, because the whole point is
              that a new topic is as cheap as a returning one.
            */}
            <Autocomplete
              freeSolo
              options={suggestions}
              inputValue={topic}
              onInputChange={(_e, value) => setTopic(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  label="What was this about?"
                  placeholder="Ancient Egypt"
                  helperText={
                    suggestions.length > 0
                      ? 'Pick one you have used before, or type something new.'
                      : undefined
                  }
                />
              )}
            />

            <Divider flexItem>What you captured</Divider>

            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Photos
              </Typography>
              <PhotoCapture onCaptureBatch={setPhotos} multiple uploading={saving} />
              {photos.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {`${photos.length} photo${photos.length === 1 ? '' : 's'} ready.`}
                </Typography>
              )}
            </Stack>

            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                A recording — an answer to a question, or telling it back
              </Typography>
              <AudioRecorder onCapture={setAudio} uploading={saving} allowUpload />
              {audio && (
                <Typography variant="caption" color="text.secondary">
                  Recording ready.
                </Typography>
              )}
            </Stack>

            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="A note"
                  placeholder="What happened, in a line"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {/*
                  Voice beside the note, not instead of it — the boy this is for
                  is six, and typing is the part he cannot do. Appends rather
                  than replaces, so a second thought does not wipe the first.
                */}
                <VoiceInput
                  profile={voiceProfile}
                  sourceSurface="strand-session"
                  size="small"
                  disabled={saving}
                  onTranscript={(text) =>
                    setNote((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
                  }
                />
              </Stack>
            </Stack>

            <TextField
              fullWidth
              label="A link"
              placeholder="The video you watched"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />

            {/*
              The refusal, shown as guidance rather than an error: this is the
              ordinary state of a half-filled form, not a mistake she made.
            */}
            {!decision.ok && (topic.trim() !== '' || kinds.length > 0) && (
              <Alert severity="info">{decision.reason}</Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        {!isChildProfile && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!decision.ok || Boolean(saving)}
          >
            {saving ? 'Saving…' : 'Record session'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
