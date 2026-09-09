import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'

import type { ActivityConfig } from '../../core/types'
import {
  parsePositionInput,
  positionFieldHint,
  positionFieldLabel,
} from './manualPosition'

/**
 * "Where are we?" by hand (UX-314).
 *
 * The one presentational surface for setting a workbook's position without a
 * photograph. It holds no Firestore and decides nothing — the rule is
 * `manualPosition.ts`, the write is the caller's `updatePosition` (the same
 * shared writer the Ask AI confirm card uses, so a position set here and one set
 * from a chat fold into the learner model identically).
 *
 * Propose → confirm → write: the dialog IS the confirm step, and nothing is
 * written until Save.
 */
interface SetPositionDialogProps {
  /** The row being edited. Mount this component only when there is one, keyed
   *  by its id — the field seeds from the row ONCE, at mount, so there is no
   *  effect re-seeding state behind the parent's back. */
  config: ActivityConfig
  saving: boolean
  onSave: (position: number) => void
  onClose: () => void
}

export default function SetPositionDialog({
  config,
  saving,
  onSave,
  onClose,
}: SetPositionDialogProps) {
  // Seeded at mount from what the app currently believes, so the common
  // correction is a one-character edit.
  const [value, setValue] = useState(() =>
    config.currentPosition != null ? String(config.currentPosition) : '',
  )
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    const parsed = parsePositionInput(value, config)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    onSave(parsed.position)
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{config.name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Set where you are now. This is your record — it can move back as well
          as forward.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
          label={positionFieldLabel(config)}
          helperText={error ?? positionFieldHint(config)}
          error={Boolean(error)}
          disabled={saving}
          // A numeric keypad on a phone, without `type="number"` — which brings
          // spinners, accepts `e`/`-`/`.`, and silently reports "" for a value
          // the browser dislikes. The rule in `manualPosition` does the
          // validating; the keyboard is only a convenience.
          inputMode="numeric"
          slotProps={{ htmlInput: { pattern: '[0-9]*', 'aria-label': positionFieldLabel(config) } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
