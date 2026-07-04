import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'

import type { FoundationDomain } from '../../core/foundations/types'
import ReviewActionConfirmCard from './ReviewActionConfirmCard'
import { parseFoundationsReviewActions } from './foundationsReviewActions'
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
 * The Foundations Review Chat surface (FEAT-51, slice 2a). A subject-scoped
 * conversation that walks a child's uncertain concepts one at a time; the parent
 * answers, per-proposal confirm cards stage the writes, and a confirm tap writes
 * to `learnerModels`. Endable anytime with a recap. Reuses the staging-card
 * interaction from the Shelly portal (mirrored, not shared).
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

  const subject = SUBJECT_LABEL[domain]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Review {subject} — {childName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          A short chat to figure out where {childName} really is. End whenever you like — nothing is
          saved until you confirm it.
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
            const text = m.role === 'assistant' ? parseFoundationsReviewActions(m.content).cleanText : m.content
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
                  <Typography variant="body2">{text}</Typography>
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

        {review.sending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1, color: 'text.secondary' }}>
            <CircularProgress size={14} />
            <Typography variant="caption">Shelly is thinking…</Typography>
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
            <TextField
              fullWidth
              size="small"
              placeholder="Reply to Shelly…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={review.sending || review.status === 'loading'}
              multiline
              maxRows={4}
            />
            <IconButton color="primary" onClick={handleSend} disabled={review.sending || !draft.trim()}>
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
    </Box>
  )
}
