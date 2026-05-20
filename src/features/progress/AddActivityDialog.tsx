import { useState } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { NewActivityConfig } from '../../core/hooks/useActivityConfigs'
import type { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'

interface AddActivityDialogProps {
  open: boolean
  childId: string
  nextSortOrder: number
  onAdd: (data: NewActivityConfig) => void
  onClose: () => void
}

const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'workbook', label: 'Workbook' },
  { value: 'routine', label: 'Routine' },
  { value: 'app', label: 'App' },
]

const SUBJECT_OPTIONS: { value: SubjectBucket; label: string }[] = [
  { value: 'Reading', label: 'Reading' },
  { value: 'Math', label: 'Math' },
  { value: 'LanguageArts', label: 'Language Arts' },
  { value: 'Science', label: 'Science' },
  { value: 'Other', label: 'Other' },
]

const MINUTE_OPTIONS = [10, 15, 20, 30, 45] as const

const FREQUENCY_OPTIONS: { value: ActivityFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: '3x', label: '3x/week' },
  { value: '2x', label: '2x/week' },
  { value: '1x', label: '1x/week' },
]

export default function AddActivityDialog({
  open,
  childId,
  nextSortOrder,
  onAdd,
  onClose,
}: AddActivityDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ActivityType>('workbook')
  const [subject, setSubject] = useState<SubjectBucket>('Reading')
  const [minutes, setMinutes] = useState(20)
  const [frequency, setFrequency] = useState<ActivityFrequency>('daily')
  const [scannable, setScannable] = useState(true)
  const [totalUnits, setTotalUnits] = useState('')
  const [currentPosition, setCurrentPosition] = useState('')

  const reset = () => {
    setName('')
    setType('workbook')
    setSubject('Reading')
    setMinutes(20)
    setFrequency('daily')
    setScannable(true)
    setTotalUnits('')
    setCurrentPosition('')
  }

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd({
      name: name.trim(),
      type,
      subjectBucket: subject,
      defaultMinutes: minutes,
      frequency,
      childId,
      sortOrder: nextSortOrder,
      scannable,
      ...(scannable && totalUnits ? { totalUnits: Number(totalUnits) } : {}),
      ...(scannable && currentPosition ? { currentPosition: Number(currentPosition) } : {}),
      ...(scannable ? { unitLabel: 'lesson' } : {}),
    })
    reset()
    onClose()
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add Activity</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />

          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Type
            </Typography>
            <Stack direction="row" spacing={1}>
              {TYPE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  variant={type === opt.value ? 'filled' : 'outlined'}
                  color={type === opt.value ? 'primary' : 'default'}
                  onClick={() => {
                    setType(opt.value)
                    setScannable(opt.value === 'workbook')
                  }}
                />
              ))}
            </Stack>
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Subject
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {SUBJECT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  variant={subject === opt.value ? 'filled' : 'outlined'}
                  color={subject === opt.value ? 'primary' : 'default'}
                  onClick={() => setSubject(opt.value)}
                />
              ))}
            </Stack>
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Minutes per session
            </Typography>
            <Stack direction="row" spacing={1}>
              {MINUTE_OPTIONS.map((m) => (
                <Chip
                  key={m}
                  label={`${m}m`}
                  variant={minutes === m ? 'filled' : 'outlined'}
                  color={minutes === m ? 'primary' : 'default'}
                  onClick={() => setMinutes(m)}
                />
              ))}
            </Stack>
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              How often
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {FREQUENCY_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  variant={frequency === opt.value ? 'filled' : 'outlined'}
                  color={frequency === opt.value ? 'primary' : 'default'}
                  onClick={() => setFrequency(opt.value)}
                />
              ))}
            </Stack>
          </Stack>

          {type === 'workbook' && (
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Can you scan pages?
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  label="Yes"
                  variant={scannable ? 'filled' : 'outlined'}
                  color={scannable ? 'primary' : 'default'}
                  onClick={() => setScannable(true)}
                />
                <Chip
                  label="No"
                  variant={!scannable ? 'filled' : 'outlined'}
                  color={!scannable ? 'primary' : 'default'}
                  onClick={() => setScannable(false)}
                />
              </Stack>
            </Stack>
          )}

          {scannable && type === 'workbook' && (
            <Stack direction="row" spacing={1}>
              <TextField
                label="Total lessons (optional)"
                value={totalUnits}
                onChange={(e) => setTotalUnits(e.target.value)}
                size="small"
                type="number"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Current lesson (optional)"
                value={currentPosition}
                onChange={(e) => setCurrentPosition(e.target.value)}
                size="small"
                type="number"
                sx={{ flex: 1 }}
              />
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!name.trim()}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}
