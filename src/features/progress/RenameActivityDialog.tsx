import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { ChatActivityConfig } from '../shelly-chat/useShellyChatActions'
import type { ActivityConfig } from '../../core/types/planning'
import { planRename } from './renameActivity'

interface RenameActivityDialogProps {
  /** The row being renamed; `null` closes the dialog. */
  config: ActivityConfig | null
  /** The rows it sits beside, for the duplicate notice. */
  siblings: readonly ChatActivityConfig[]
  onSave: (configId: string, name: string, aliases: string[]) => void
  onClose: () => void
}

/**
 * Rename a curriculum row (UX-279).
 *
 * Writes `name` — and the alternates, when the old name is carried into them —
 * and nothing else. The two sentences under the field are the whole point of
 * the feature: what the name is FOR (the plan and the row) and what still finds
 * it afterwards (a photo of the cover). A parent renaming a workbook to
 * something shorter than what is printed on it needs to know the scan will
 * still land, or she will not do it.
 */
export default function RenameActivityDialog({
  config,
  siblings,
  onSave,
  onClose,
}: RenameActivityDialogProps) {
  if (!config) return null
  // Keyed on the row, so opening a different one mounts a fresh field seeded
  // with that row's own name — rather than an effect resetting state after the
  // first render has already drawn the previous row's name.
  return (
    <RenameActivityDialogBody
      key={config.id}
      config={config}
      siblings={siblings}
      onSave={onSave}
      onClose={onClose}
    />
  )
}

function RenameActivityDialogBody({
  config,
  siblings,
  onSave,
  onClose,
}: RenameActivityDialogProps & { config: ActivityConfig }) {
  const [name, setName] = useState(config.name)

  const plan = useMemo(() => planRename(config, name, siblings), [config, name, siblings])

  const canSave = plan.name != null && plan.refusal === ''

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Rename this activity</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            error={Boolean(plan.refusal)}
            helperText={plan.refusal || 'What you call it — on the row, and in the week you plan.'}
          />

          {plan.duplicateNotice ? (
            <Alert severity="info">{plan.duplicateNotice}</Alert>
          ) : null}

          {plan.carriesOldName ? (
            <Alert severity="success">
              We&rsquo;ll remember that this used to be called &ldquo;{config.name}&rdquo;, so a
              photo of the cover still finds it.
            </Alert>
          ) : null}

          <Typography variant="caption" color="text.secondary">
            Renaming changes what this is called from now on. Days you have already logged keep the
            words they were logged with.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSave}
          onClick={() => {
            if (plan.name == null) return
            onSave(config.id, plan.name, plan.aliases ?? [])
            onClose()
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
