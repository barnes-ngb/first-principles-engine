import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'

import type { ActivityConfig } from '../../core/types'
import {
  READ_ALOUD_ADD_LABEL,
  earlierReadAloudConfirm,
  earlierReadAloudPrompt,
} from './readAloudCurriculum'

/**
 * The read-aloud's two Curriculum lines under the planner's book picker
 * (FEAT-243 / UX-470). Presentational: it reads nothing and writes nothing —
 * the page hands in the decisions and the two writers.
 *
 *  - **Add to Curriculum**, when the picked book has no row yet. The same
 *    create-only write Apply runs, never a second one.
 *  - **"Dark Sea is still in Curriculum. Mark it finished?"**, one per earlier
 *    read-aloud row still active. A new book never closes the old one by itself
 *    — the family may be pausing it — so the tap opens a confirm first and
 *    only then runs the existing mark-complete path.
 */
export interface ReadAloudCurriculumNoticesProps {
  /** Show the one-tap add (the page decides: a book, no row, a parent). */
  showAdd: boolean
  adding?: boolean
  onAdd: () => void
  /** Earlier read-aloud rows still active, already filtered by the page. */
  earlierRows: Pick<ActivityConfig, 'id' | 'name'>[]
  onConfirmFinish: (config: Pick<ActivityConfig, 'id' | 'name'>) => Promise<void>
}

export default function ReadAloudCurriculumNotices({
  showAdd,
  adding = false,
  onAdd,
  earlierRows,
  onConfirmFinish,
}: ReadAloudCurriculumNoticesProps) {
  const [target, setTarget] = useState<Pick<ActivityConfig, 'id' | 'name'> | null>(null)
  const [saving, setSaving] = useState(false)

  if (!showAdd && earlierRows.length === 0 && !target) return null

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {showAdd && (
        <Button size="small" variant="outlined" onClick={onAdd} disabled={adding} sx={{ alignSelf: 'flex-start' }}>
          {READ_ALOUD_ADD_LABEL}
        </Button>
      )}
      {earlierRows.map((config) => (
        <Alert
          key={config.id}
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => setTarget(config)}>
              Mark finished
            </Button>
          }
        >
          {earlierReadAloudPrompt(config)}
        </Alert>
      ))}
      <Dialog open={target !== null} onClose={() => (saving ? undefined : setTarget(null))}>
        <DialogTitle>Mark finished?</DialogTitle>
        <DialogContent>
          <DialogContentText>{target ? earlierReadAloudConfirm(target) : ''}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)} disabled={saving}>
            Not yet
          </Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={async () => {
              if (!target) return
              setSaving(true)
              try {
                await onConfirmFinish(target)
              } finally {
                setSaving(false)
                setTarget(null)
              }
            }}
          >
            Mark finished
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
