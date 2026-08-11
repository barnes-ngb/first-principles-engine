import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'

/** One selectable destination: a weekday of the current planning week. */
export interface MoveToDayOption {
  /** `YYYY-MM-DD` of the day. */
  dateKey: string
  /** Weekday name as the planner labels it ("Monday"). */
  label: string
}

interface MoveToDayDialogProps {
  open: boolean
  /** The row being moved, shown so the parent can see what they picked. */
  itemLabel: string
  options: MoveToDayOption[]
  /** The day the row is on now — listed, but not pickable. */
  currentDateKey: string
  onClose: () => void
  onPick: (dateKey: string) => void
}

/**
 * "Move this to another day" (FEAT-138) — a weekday picker for the current
 * planning week, shared by the planner's post-Apply day cards and Today's parent
 * edit mode so the two surfaces cannot drift.
 *
 * Deliberately a five-row list, not a calendar: the origin story is *"the video
 * changes the day it will be watched"*, which is always a within-the-week move,
 * and a date picker would invite writing school days into weeks that were never
 * planned. The day the row already sits on is shown and disabled rather than
 * hidden, so the list reads as the week rather than as a gap.
 */
export default function MoveToDayDialog({
  open,
  itemLabel,
  options,
  currentDateKey,
  onClose,
  onPick,
}: MoveToDayDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Move to another day</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {itemLabel}
        </Typography>
        <List dense disablePadding>
          {options.map((option) => {
            const isCurrent = option.dateKey === currentDateKey
            return (
              <ListItemButton
                key={option.dateKey}
                disabled={isCurrent}
                onClick={() => onPick(option.dateKey)}
              >
                <ListItemText
                  primary={option.label}
                  secondary={isCurrent ? 'Where it is now' : undefined}
                />
              </ListItemButton>
            )
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
