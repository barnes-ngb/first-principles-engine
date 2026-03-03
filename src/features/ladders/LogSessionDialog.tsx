import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { LadderCardDefinition, LadderProgress } from '../../core/types/domain'
import { SessionSymbol, SupportLevel } from '../../core/types/enums'
import type { ApplySessionInput } from './ladderProgress'

const SUPPORT_LABELS: Record<SupportLevel, string> = {
  [SupportLevel.None]: 'None',
  [SupportLevel.Environment]: 'Environment',
  [SupportLevel.Prompts]: 'Prompts',
  [SupportLevel.Tools]: 'Tools',
  [SupportLevel.HandOverHand]: 'Hand-over-hand',
}

interface LogSessionDialogProps {
  open: boolean
  onClose: () => void
  onSave: (input: ApplySessionInput) => void
  ladder: LadderCardDefinition
  progress: LadderProgress
  saving?: boolean
}

export default function LogSessionDialog({
  open,
  onClose,
  onSave,
  ladder,
  progress,
  saving,
}: LogSessionDialogProps) {
  const [result, setResult] = useState<SessionSymbol>(SessionSymbol.Pass)
  const [supportLevel, setSupportLevel] = useState<SupportLevel>(
    progress.lastSupportLevel,
  )
  const [note, setNote] = useState('')

  const currentRung = ladder.rungs.find((r) => r.rungId === progress.currentRungId)

  const handleSave = () => {
    const dateKey = new Date().toISOString().slice(0, 10)
    onSave({
      dateKey,
      result,
      supportLevel,
      note: note.trim() || undefined,
    })
    // Reset form
    setResult(SessionSymbol.Pass)
    setNote('')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { mx: 1 } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        Log Session
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              {ladder.title}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {currentRung
                ? `${currentRung.rungId}: ${currentRung.name}`
                : progress.currentRungId}
            </Typography>
            {currentRung && (
              <Typography variant="caption" color="text.secondary">
                {currentRung.evidenceText}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Result</Typography>
            <ToggleButtonGroup
              value={result}
              exclusive
              fullWidth
              onChange={(_e, v) => { if (v) setResult(v) }}
            >
              <ToggleButton value={SessionSymbol.Pass} sx={{ fontSize: '1.2rem' }}>
                ✔ Pass
              </ToggleButton>
              <ToggleButton value={SessionSymbol.Partial} sx={{ fontSize: '1.2rem' }}>
                △ Partial
              </ToggleButton>
              <ToggleButton value={SessionSymbol.Miss} sx={{ fontSize: '1.2rem' }}>
                ✖ Miss
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <TextField
            label="Support level"
            select
            fullWidth
            size="small"
            value={supportLevel}
            onChange={(e) => setSupportLevel(e.target.value as SupportLevel)}
          >
            {Object.values(SupportLevel).map((level) => (
              <MenuItem key={level} value={level}>
                {SUPPORT_LABELS[level]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Note (optional)"
            multiline
            minRows={2}
            size="small"
            fullWidth
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
