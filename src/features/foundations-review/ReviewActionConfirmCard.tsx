import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import type { FoundationsReviewAction } from './foundationsReviewActions'
import type { PendingReviewAction } from './useFoundationsReview'

interface Props {
  pending: PendingReviewAction[]
  childName: string
  onConfirm: (action: FoundationsReviewAction) => void
  onDismiss: (action: FoundationsReviewAction) => void
  onConfirmAll: () => void
}

/** Plain-language state phrase — NEVER a band number or percentage (§14). */
const STATE_PHRASE: Record<string, string> = {
  solid: 'has this solid',
  forming: 'is coming along with this',
  frontier: 'is working on this',
}

function kidNameOf(conceptId: string): string {
  return FOUNDATION_NODE_MAP[conceptId]?.kidName ?? conceptId
}

/** One human-readable preview line per proposed write. Plain words only. */
function describe(action: FoundationsReviewAction, childName: string): { label: string; sub?: string } {
  const name = childName || 'your child'
  const kid = kidNameOf(action.conceptId)
  switch (action.kind) {
    case 'attest':
      return {
        label: `Record that ${name} ${STATE_PHRASE[action.state] ?? 'can do this'}: "${kid}"`,
        sub: action.note,
      }
    case 'covered': {
      const unit = action.unit ? ` (${action.unit})` : ''
      return {
        label: `Note "${kid}" as covered in ${action.source}${unit}`,
        sub: 'A step forward — we’ll suggest a quick check to be sure.',
      }
    }
    case 'queueTest':
      return {
        label: `Queue a quick quest so ${name} can show "${kid}"`,
        sub: action.reason,
      }
  }
}

function iconFor(kind: FoundationsReviewAction['kind']) {
  if (kind === 'attest') return <VerifiedOutlinedIcon fontSize="small" color="success" />
  if (kind === 'covered') return <MenuBookOutlinedIcon fontSize="small" color="info" />
  return <QuizOutlinedIcon fontSize="small" color="warning" />
}

/**
 * Inline confirm cards for proposed Review-Chat writes — mirrors the Shelly
 * portal's `ActionConfirmCard` (propose → confirm → write) but for the three
 * foundations write paths. Nothing here writes; taps call back into
 * `useFoundationsReview`. Plain language only — no band numbers, no percentages.
 */
export default function ReviewActionConfirmCard({
  pending,
  childName,
  onConfirm,
  onDismiss,
  onConfirmAll,
}: Props) {
  if (pending.length === 0) return null
  const stillPending = pending.filter((p) => p.status === 'pending')

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      <Stack spacing={1}>
        {pending.map((item) => {
          const { label, sub } = describe(item.action, childName)
          return (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                opacity: item.status === 'dismissed' ? 0.5 : 1,
              }}
            >
              {iconFor(item.action.kind)}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
                {sub && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {sub}
                  </Typography>
                )}
              </Box>
              {item.status === 'pending' && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => onConfirm(item.action)}
                    sx={{ textTransform: 'none', minWidth: 0, py: 0.5 }}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={() => onDismiss(item.action)}
                    sx={{ textTransform: 'none', minWidth: 0, py: 0.5 }}
                  >
                    Dismiss
                  </Button>
                </Box>
              )}
              {item.status === 'applied' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                  <CheckCircleIcon fontSize="small" />
                  <Typography variant="caption">Done</Typography>
                </Box>
              )}
              {item.status === 'dismissed' && (
                <Typography variant="caption" color="text.secondary">
                  Dismissed
                </Typography>
              )}
            </Paper>
          )
        })}
        {stillPending.length >= 2 && (
          <Button
            size="small"
            variant="outlined"
            onClick={onConfirmAll}
            sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
          >
            Confirm all ({stillPending.length})
          </Button>
        )}
      </Stack>
    </Box>
  )
}
