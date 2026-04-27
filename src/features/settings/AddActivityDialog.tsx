import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { NewActivityConfig } from '../../core/hooks/useActivityConfigs'
import type { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'

const ACTIVITY_TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: 'formation', label: 'Formation' },
  { value: 'workbook', label: 'Workbook' },
  { value: 'routine', label: 'Routine' },
  { value: 'activity', label: 'Activity' },
  { value: 'app', label: 'App' },
]

const SUBJECT_BUCKETS: Array<{ value: SubjectBucket; label: string }> = [
  { value: 'Reading', label: 'Reading' },
  { value: 'Math', label: 'Math' },
  { value: 'LanguageArts', label: 'Language Arts' },
  { value: 'Science', label: 'Science' },
  { value: 'Other', label: 'Formation / Other' },
  { value: 'Art', label: 'Art' },
  { value: 'PE', label: 'PE' },
  { value: 'Music', label: 'Music' },
]

const MINUTES_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

const FREQUENCY_OPTIONS: Array<{ value: ActivityFrequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: '3x', label: '3x/week' },
  { value: '2x', label: '2x/week' },
  { value: '1x', label: '1x/week' },
  { value: 'as-needed', label: 'As needed' },
]

const CHILD_OPTIONS = [
  { value: 'lincoln', label: 'Lincoln' },
  { value: 'london', label: 'London' },
  { value: 'both', label: 'Both' },
] as const

interface AddActivityDialogProps {
  open: boolean
  onClose: () => void
  childId: string
  childName: string
  existingCount: number
  onAdd: (data: NewActivityConfig) => Promise<void>
}

export default function AddActivityDialog({
  open,
  onClose,
  childId,
  existingCount,
  onAdd,
}: AddActivityDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ActivityType>('routine')
  const [subjectBucket, setSubjectBucket] = useState<SubjectBucket>('Reading')
  const [defaultMinutes, setDefaultMinutes] = useState(15)
  const [frequency, setFrequency] = useState<ActivityFrequency>('2x')
  const [selectedChild, setSelectedChild] = useState<string | 'both'>(childId)
  const [scannable, setScannable] = useState(false)
  const [curriculum, setCurriculum] = useState('')
  const [totalUnits, setTotalUnits] = useState('')
  const [currentPosition, setCurrentPosition] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName('')
    setType('routine')
    setSubjectBucket('Reading')
    setDefaultMinutes(15)
    setFrequency('2x')
    setSelectedChild(childId)
    setScannable(false)
    setCurriculum('')
    setTotalUnits('')
    setCurrentPosition('')
  }

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      // Compute sort order based on type
      const sortOrderBase =
        type === 'formation' ? 1 :
        type === 'workbook' ? 11 :
        type === 'routine' ? 31 :
        type === 'activity' ? 91 :
        type === 'app' ? 71 : 51
      const sortOrder = sortOrderBase + existingCount

      await onAdd({
        name: name.trim(),
        type,
        subjectBucket,
        defaultMinutes,
        frequency,
        childId: selectedChild,
        sortOrder,
        scannable,
        ...(scannable && curriculum ? { curriculum } : {}),
        ...(scannable && totalUnits ? { totalUnits: Number(totalUnits) } : {}),
        ...(scannable && currentPosition ? { currentPosition: Number(currentPosition) } : {}),
        ...(scannable ? { unitLabel: 'lesson' } : {}),
      })
      reset()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add Activity</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Name"
            placeholder="e.g., Board game with family"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
          />

          {/* Type */}
          <Box>
            <Typography variant="caption" color="text.secondary">Type</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {ACTIVITY_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  label={t.label}
                  size="small"
                  variant={type === t.value ? 'filled' : 'outlined'}
                  color={type === t.value ? 'primary' : 'default'}
                  onClick={() => setType(t.value)}
                />
              ))}
            </Stack>
          </Box>

          {/* Subject */}
          <Box>
            <Typography variant="caption" color="text.secondary">Subject</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {SUBJECT_BUCKETS.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  size="small"
                  variant={subjectBucket === s.value ? 'filled' : 'outlined'}
                  color={subjectBucket === s.value ? 'primary' : 'default'}
                  onClick={() => setSubjectBucket(s.value)}
                />
              ))}
            </Stack>
          </Box>

          {/* Minutes */}
          <Box>
            <Typography variant="caption" color="text.secondary">Minutes</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {MINUTES_OPTIONS.map((m) => (
                <Chip
                  key={m}
                  label={`${m}m`}
                  size="small"
                  variant={defaultMinutes === m ? 'filled' : 'outlined'}
                  color={defaultMinutes === m ? 'primary' : 'default'}
                  onClick={() => setDefaultMinutes(m)}
                />
              ))}
            </Stack>
          </Box>

          {/* Frequency */}
          <Box>
            <Typography variant="caption" color="text.secondary">How often</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {FREQUENCY_OPTIONS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  size="small"
                  variant={frequency === f.value ? 'filled' : 'outlined'}
                  color={frequency === f.value ? 'primary' : 'default'}
                  onClick={() => setFrequency(f.value)}
                />
              ))}
            </Stack>
          </Box>

          {/* Child */}
          <Box>
            <Typography variant="caption" color="text.secondary">Which child</Typography>
            <Stack direction="row" spacing={0.5}>
              {CHILD_OPTIONS.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  size="small"
                  variant={selectedChild === c.value ? 'filled' : 'outlined'}
                  color={selectedChild === c.value ? 'primary' : 'default'}
                  onClick={() => setSelectedChild(c.value)}
                />
              ))}
            </Stack>
          </Box>

          {/* Scannable */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2">Can you scan pages from this?</Typography>
            <Switch checked={scannable} onChange={(_, v) => setScannable(v)} size="small" />
          </Stack>

          {/* Workbook fields (if scannable) */}
          {scannable && (
            <Stack spacing={1.5}>
              <TextField
                size="small"
                label="Curriculum name"
                placeholder="e.g., GATB"
                value={curriculum}
                onChange={(e) => setCurriculum(e.target.value)}
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Total lessons"
                  type="number"
                  value={totalUnits}
                  onChange={(e) => setTotalUnits(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Current lesson"
                  type="number"
                  value={currentPosition}
                  onChange={(e) => setCurrentPosition(e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Stack>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || saving}
          onClick={handleAdd}
        >
          {saving ? 'Adding...' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

