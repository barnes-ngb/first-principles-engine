import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

interface PublishConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  childName: string
  month: string
  loading?: boolean
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Number(y), Number(m) - 1, 1)
  if (Number.isNaN(d.getTime())) return month
  return d.toLocaleString(undefined, { month: 'long' })
}

export function PublishConfirmDialog({
  open,
  onClose,
  onConfirm,
  childName,
  month,
  loading,
}: PublishConfirmDialogProps) {
  const monthLabel = formatMonthLabel(month)
  const who = childName || 'them'
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Publish this book?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will make the {monthLabel} book visible to {who} in &ldquo;Books About
          Me.&rdquo; You can still edit and republish later.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="success"
          variant="contained"
          disabled={loading}
        >
          {loading ? 'Publishing…' : 'Publish'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
