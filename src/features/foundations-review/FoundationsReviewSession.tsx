import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'

import type { FoundationDomain } from '../../core/foundations/types'
import ReviewActionConfirmCard from './ReviewActionConfirmCard'
import { parseFoundationsReviewActions } from './foundationsReviewActions'
import { parseImageMarkers } from './uploadImageMessage'
import { PERSONA_NAME, PLACEHOLDER_TEXT } from './persona'
import { useFoundationsReview } from './useFoundationsReview'

interface Props {
  familyId: string
  childId: string
  childName: string
  domain: FoundationDomain
  onClose: () => void
}

const SUBJECT_LABEL: Record<FoundationDomain, string> = {
  reading: 'reading',
  math: 'math',
}

/**
 * The Foundations Review Chat surface (FEAT-51 slice 2a; FEAT-53 slice 2b adds
 * mid-chat uploads). A subject-scoped conversation that walks a child's uncertain
 * concepts one at a time; the parent answers (or attaches a photo of recent
 * work / a curriculum screenshot), per-proposal confirm cards stage the writes,
 * and a confirm tap writes to `learnerModels`. Endable anytime with a recap.
 * Reuses the staging-card interaction from the shellyChat portal (mirrored, not
 * shared). The assistant persona is the {@link PERSONA_NAME}, never a person.
 */
export default function FoundationsReviewSession({
  familyId,
  childId,
  childName,
  domain,
  onClose,
}: Props) {
  const review = useFoundationsReview({ familyId, childId, childName, domain })
  const [draft, setDraft] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadContext, setUploadContext] = useState('')
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void review.start()
  }, [review])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [review.messages, review.pending])

  const handleSend = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void review.send(text)
  }

  const closeUpload = () => {
    setUploadOpen(false)
    setUploadFiles([])
    setUploadContext('')
  }

  const handleUploadSubmit = () => {
    if (uploadFiles.length === 0 || !uploadContext.trim()) return
    void review.uploadImages(uploadFiles, uploadContext)
    closeUpload()
  }

  const subject = SUBJECT_LABEL[domain]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Review {subject} — {childName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          A short chat with the {PERSONA_NAME} to figure out where {childName} really is. Attach a
          photo of recent work anytime. End whenever you like — nothing is saved until you confirm it.
        </Typography>
      </Box>
      <Divider />

      {/* Conversation */}
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 2, minHeight: 200 }}>
        {review.status === 'loading' && review.messages.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        <Stack spacing={1.5}>
          {review.messages.map((m, i) => {
            // User messages may carry `[IMAGE_URL:…]` markers from an upload turn —
            // strip them for display and show a small attachment chip instead.
            const parsedUser = m.role === 'user' ? parseImageMarkers(m.content) : null
            const text = m.role === 'assistant'
              ? parseFoundationsReviewActions(m.content).cleanText
              : parsedUser!.text
            const attachedCount = parsedUser?.urls.length ?? 0
            if (m.role === 'assistant' && !text) return null
            return (
              <Box
                key={`${m.at}_${i}`}
                sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    px: 1.5,
                    py: 1,
                    maxWidth: '85%',
                    borderRadius: 2,
                    bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                    color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {attachedCount > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: text ? 0.5 : 0, opacity: 0.9 }}>
                      <ImageOutlinedIcon fontSize="small" />
                      <Typography variant="caption">
                        {attachedCount === 1 ? 'Photo attached' : `${attachedCount} photos attached`}
                      </Typography>
                    </Box>
                  )}
                  {text && <Typography variant="body2">{text}</Typography>}
                </Paper>
              </Box>
            )
          })}
        </Stack>

        {/* Staged proposals from the latest assistant turn */}
        <Box sx={{ mt: 1 }}>
          <ReviewActionConfirmCard
            pending={review.pending}
            childName={childName}
            onConfirm={review.applyAction}
            onDismiss={review.dismissAction}
            onConfirmAll={review.confirmAll}
          />
        </Box>

        {(review.sending || review.uploading) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1, color: 'text.secondary' }}>
            <CircularProgress size={14} />
            <Typography variant="caption">
              {review.uploading ? 'Reading your photo…' : `The ${PERSONA_NAME} is thinking…`}
            </Typography>
          </Box>
        )}

        {review.error && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {review.error}
          </Alert>
        )}
      </Box>

      {/* Recap on end */}
      {review.ended && (
        <>
          <Divider />
          <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Review recap
            </Typography>
            {review.recap.changed.length === 0 && review.recap.queued.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nothing recorded this time — that’s completely fine. Come back whenever.
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                {review.recap.changed.map((c) => (
                  <Typography key={`ch_${c.conceptId}`} variant="body2">
                    ✓ <strong>{c.kidName}</strong> — {c.via}
                  </Typography>
                ))}
                {review.recap.queued.length > 0 && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      Queued for testing (the next Knowledge Mine quest can pick these up):
                    </Typography>
                    {review.recap.queued.map((q) => (
                      <Typography key={`q_${q.conceptId}`} variant="body2">
                        🧪 <strong>{q.kidName}</strong>
                      </Typography>
                    ))}
                  </>
                )}
              </Stack>
            )}
          </Box>
        </>
      )}

      <Divider />
      {/* Composer + controls */}
      <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
        {!review.ended ? (
          <>
            <IconButton
              color="primary"
              onClick={() => setUploadOpen(true)}
              disabled={review.sending || review.uploading || review.status === 'loading'}
              aria-label="Attach a photo"
            >
              <AddPhotoAlternateOutlinedIcon />
            </IconButton>
            <TextField
              fullWidth
              size="small"
              placeholder={PLACEHOLDER_TEXT}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={review.sending || review.uploading || review.status === 'loading'}
              multiline
              maxRows={4}
            />
            <IconButton color="primary" onClick={handleSend} disabled={review.sending || review.uploading || !draft.trim()}>
              <SendIcon />
            </IconButton>
            <Button onClick={review.end} sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
              End
            </Button>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
            <Button variant="contained" fullWidth onClick={onClose} sx={{ textTransform: 'none' }}>
              Done
            </Button>
            <Button onClick={() => review.start()} sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
              Keep reviewing
            </Button>
          </Box>
        )}
      </Box>

      {/* Upload dialog — attach photo(s) + a required one-line context (§11.3) */}
      <Dialog open={uploadOpen} onClose={closeUpload} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 0.5 }}>Attach a photo</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            A curriculum screenshot (e.g. a Fast Phonics progress page) or a photo of{' '}
            {childName}’s actual work — a spelling page, a worksheet. Tell me in one line what it is.
          </Typography>
          <Button
            component="label"
            variant="outlined"
            startIcon={<AddPhotoAlternateOutlinedIcon />}
            sx={{ textTransform: 'none', mb: 1 }}
          >
            {uploadFiles.length === 0
              ? 'Choose photo(s)'
              : `${uploadFiles.length} photo${uploadFiles.length === 1 ? '' : 's'} selected`}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
            />
          </Button>
          <TextField
            fullWidth
            size="small"
            required
            label="What is this?"
            placeholder="e.g. these are Fast Phonics"
            value={uploadContext}
            onChange={(e) => setUploadContext(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUpload} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUploadSubmit}
            disabled={uploadFiles.length === 0 || !uploadContext.trim()}
            sx={{ textTransform: 'none' }}
          >
            Attach
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
