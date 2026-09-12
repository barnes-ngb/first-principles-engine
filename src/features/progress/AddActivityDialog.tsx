import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { NewActivityConfig } from '../../core/hooks/useActivityConfigs'
import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import type { ActivityFrequency, ActivityType } from '../../core/types/enums'
import { durationOptionsWithValue } from './durationOptions'
import { unitLabelForNewActivity } from './strand'
import {
  EMPTY_ADD_ACTIVITY_DRAFT,
  addActivityDraftIsEmpty,
  addActivitySwitchNotice,
} from './addActivityOwnership'

interface AddActivityDialogProps {
  open: boolean
  childId: string
  nextSortOrder: number
  onAdd: (data: NewActivityConfig) => void
  onClose: () => void
  /**
   * Name for a child id, for the UX-335 notice. Optional: without it the
   * sentence still says the activity was cleared, it just cannot say whose.
   */
  childName?: (id: string) => string | undefined
}

/**
 * The types this dialog offers.
 *
 * A deliberately CURATED subset, not a derived list: `formation` and
 * `evaluation` are not things a parent adds by hand here (an evaluation added
 * by hand is UX-204's shape reopened — see `EVALUATION_NOT_OFFERED_REASON`),
 * and `activity` is covered by App for this door's purposes. So it is spelled
 * out rather than read off the enum.
 *
 * `strand` was added in Codex round 1: UX-281 prepared the unit label for a
 * strand created here and never added it to this list, so the branch was
 * unreachable and a parent could not create a strand from Progress → Curriculum
 * at all — she would have had to find the chat's type-correction chip. That is
 * a FOURTH place a new `ActivityType` can be orphaned, after the two `Record`
 * rails that caught it and the card order that did not.
 */
const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'workbook', label: 'Workbook' },
  { value: 'routine', label: 'Routine' },
  { value: 'strand', label: 'Strand' },
  { value: 'app', label: 'App' },
]

/**
 * Every bucket, derived from the enum rather than hand-listed (FEAT-199).
 *
 * The hand-kept list offered five of the ten, so `PracticalArts` — the bucket
 * *packing*, chores and life skills belong to — could not be chosen anywhere in
 * the app, and a family's practical work had to be filed as "Other". Deriving
 * it means the next bucket added to `SubjectBucket` is offered here on the same
 * commit, with its own `SubjectBucketLabel` wording.
 */
const SUBJECT_OPTIONS: { value: SubjectBucket; label: string }[] = Object.values(
  SubjectBucket,
).map((value) => ({ value, label: SubjectBucketLabel[value] }))

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
  childName,
}: AddActivityDialogProps) {
  const [name, setName] = useState(EMPTY_ADD_ACTIVITY_DRAFT.name)
  const [type, setType] = useState<ActivityType>(EMPTY_ADD_ACTIVITY_DRAFT.type)
  const [subject, setSubject] = useState<SubjectBucket>(EMPTY_ADD_ACTIVITY_DRAFT.subject)
  const [minutes, setMinutes] = useState(EMPTY_ADD_ACTIVITY_DRAFT.minutes)
  const [frequency, setFrequency] = useState<ActivityFrequency>(EMPTY_ADD_ACTIVITY_DRAFT.frequency)
  const [scannable, setScannable] = useState(EMPTY_ADD_ACTIVITY_DRAFT.scannable)
  const [totalUnits, setTotalUnits] = useState(EMPTY_ADD_ACTIVITY_DRAFT.totalUnits)
  const [currentPosition, setCurrentPosition] = useState(EMPTY_ADD_ACTIVITY_DRAFT.currentPosition)
  // FEAT-199. Default off: the quick-log row is for EXTRA work a kid logs
  // themselves, and most configs are the planned day the checklist already
  // shows. Opting in is one tap here, or on the activity's own menu later.
  const [quickLog, setQuickLog] = useState(EMPTY_ADD_ACTIVITY_DRAFT.quickLog)

  const reset = () => {
    setName(EMPTY_ADD_ACTIVITY_DRAFT.name)
    setType(EMPTY_ADD_ACTIVITY_DRAFT.type)
    setSubject(EMPTY_ADD_ACTIVITY_DRAFT.subject)
    setMinutes(EMPTY_ADD_ACTIVITY_DRAFT.minutes)
    setFrequency(EMPTY_ADD_ACTIVITY_DRAFT.frequency)
    setScannable(EMPTY_ADD_ACTIVITY_DRAFT.scannable)
    setTotalUnits(EMPTY_ADD_ACTIVITY_DRAFT.totalUnits)
    setCurrentPosition(EMPTY_ADD_ACTIVITY_DRAFT.currentPosition)
    setQuickLog(EMPTY_ADD_ACTIVITY_DRAFT.quickLog)
  }

  /**
   * UX-335 — a typed activity belongs to the child it was typed for, and a
   * child change clears it rather than re-pointing it.
   *
   * `handleAdd` below stamps the live `childId` prop, so a filled form plus a
   * selector tap (or, since FIX-231, an app-bar tap) plus Add created one boy's
   * workbook on his brother's curriculum, where it plans every day.
   *
   * Adjusting state during render is React's own answer to "derive from a
   * changed prop"; this repo's lint forbids the set-state-in-effect form
   * (the `ArmorTab` / UX-336 precedent).
   */
  const [formChildId, setFormChildId] = useState(childId)
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)
  if (formChildId !== childId) {
    setSwitchNotice(
      addActivitySwitchNotice(
        !addActivityDraftIsEmpty({
          name, type, subject, minutes, frequency, scannable, totalUnits, currentPosition, quickLog,
        }),
        childName?.(formChildId),
        childName?.(childId),
      ),
    )
    setFormChildId(childId)
    reset()
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
      // Written only when true — `addActivityConfig` spreads this object
      // straight into `setDoc`, and Firestore rejects an explicit `undefined`.
      ...(quickLog ? { quickLog: true } : {}),
      ...(scannable && totalUnits ? { totalUnits: Number(totalUnits) } : {}),
      ...(scannable && currentPosition ? { currentPosition: Number(currentPosition) } : {}),
      // UX-281: one definition of the new row's unit label, so this door and
      // the chat's addActivity card cannot disagree — a strand needs
      // 'session', and it is not scannable.
      ...(unitLabelForNewActivity(type, scannable)
        ? { unitLabel: unitLabelForNewActivity(type, scannable) }
        : {}),
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
          {/* UX-335 — the cleared activity is named, and so is whose it was. A
              silently emptied form is how this whole class of defect hides. */}
          {switchNotice && (
            <Alert severity="info" onClose={() => setSwitchNotice(null)}>
              {switchNotice}
            </Alert>
          )}
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
            <Select
              value={minutes}
              size="small"
              onChange={(e) => setMinutes(Number(e.target.value))}
              sx={{ maxWidth: 160 }}
              aria-label="Minutes per session"
            >
              {durationOptionsWithValue(minutes).map((m) => (
                <MenuItem key={m} value={m}>
                  {m}m
                </MenuItem>
              ))}
            </Select>
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

          {/* FEAT-199 — parent-facing copy, so it is not held to the kid bar. */}
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Show on the kids&rsquo; &ldquo;I Did More!&rdquo; chips?
            </Typography>
            <Stack direction="row" spacing={1}>
              <Chip
                label="Yes"
                variant={quickLog ? 'filled' : 'outlined'}
                color={quickLog ? 'primary' : 'default'}
                onClick={() => setQuickLog(true)}
              />
              <Chip
                label="No"
                variant={!quickLog ? 'filled' : 'outlined'}
                color={!quickLog ? 'primary' : 'default'}
                onClick={() => setQuickLog(false)}
              />
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
