import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { WordProgress } from '../../core/types'

interface WordDetailProps {
  word: WordProgress | null
  open: boolean
  onClose: () => void
  onMarkAsKnown: (word: string) => void
  onAddToStory: (word: string) => void
}

export default function WordDetail({
  word,
  open,
  onClose,
  onMarkAsKnown,
  onAddToStory,
}: WordDetailProps) {
  if (!word) return null

  const totalAttempts = word.correctCount + word.wrongCount + word.skippedCount

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.7rem',
          bgcolor: 'rgba(0,0,0,0.92)',
          color: '#FCDB5B',
        }}
      >
        {word.word}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: 'rgba(0,0,0,0.88)', color: '#fff', pt: 2 }}>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <DetailRow label="Pattern" value={word.pattern || 'Unknown'} />
          <DetailRow label="Skill" value={word.skill || 'Unknown'} />
          <DetailRow
            label="Mastery"
            value={formatMastery(word.masteryLevel, totalAttempts)}
          />
          <DetailRow label="Correct" value={`${word.correctCount} of ${totalAttempts}`} />
          {word.wrongCount > 0 && (
            <DetailRow label="Wrong" value={String(word.wrongCount)} />
          )}
          {word.skippedCount > 0 && (
            <DetailRow label="Skipped" value={String(word.skippedCount)} />
          )}
          <DetailRow
            label="First seen"
            value={word.firstSeen ? formatDate(word.firstSeen) : 'Unknown'}
          />
          <DetailRow
            label="Last seen"
            value={word.lastSeen ? formatDate(word.lastSeen) : 'Unknown'}
          />
          <DetailRow
            label="Quest sessions"
            value={String(word.questSessions?.length ?? 0)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ bgcolor: 'rgba(0,0,0,0.92)', gap: 1, px: 2, pb: 2 }}>
        <Button
          size="small"
          onClick={() => onAddToStory(word.word)}
          sx={{ color: '#5BFCEE', fontSize: '0.7rem' }}
        >
          Add to story
        </Button>
        {word.masteryLevel !== 'known' && (
          <Button
            size="small"
            onClick={() => onMarkAsKnown(word.word)}
            sx={{ color: '#7EFC20', fontSize: '0.7rem' }}
          >
            Mark as known
          </Button>
        )}
        <Button size="small" onClick={onClose} sx={{ color: '#8B8B8B' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Typography
        sx={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.4rem',
          color: '#8B8B8B',
          lineHeight: 1.8,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '0.4rem',
          color: '#fff',
          lineHeight: 1.8,
          textAlign: 'right',
          maxWidth: '60%',
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

function formatMastery(level: string, total: number): string {
  const labels: Record<string, string> = {
    known: 'Known',
    emerging: 'Emerging',
    struggling: 'Struggling',
    'not-yet': 'Not Yet',
  }
  return `${labels[level] ?? level} (${total} attempts)`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}
