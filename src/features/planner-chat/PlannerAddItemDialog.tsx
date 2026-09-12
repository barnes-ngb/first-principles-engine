import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addActivityConfig } from '../../core/firebase/activityConfigWrites'
import type { ActivityConfig } from '../../core/types'
import AddActivityDialog from '../progress/AddActivityDialog'
import { canPlanActivity } from './curriculumDayItem'

interface Props {
  familyId: string
  childId: string
  childName: string
  dayLabel?: string
  applied: boolean
  configs: ActivityConfig[]
  loading: boolean
  error: string | null
  onAdd: (config: ActivityConfig) => Promise<void>
  onVideo: () => void
  onClose: () => void
  onResourceSaved: (name: string) => void
}

/** BIND: the host keys this dialog by family/child/week/day and hides it on a scope change. */
export default function PlannerAddItemDialog({
  familyId, childId, childName, dayLabel, applied, configs, loading, error,
  onAdd, onVideo, onClose, onResourceSaved,
}: Props) {
  const [creating, setCreating] = useState(!dayLabel)
  const [created, setCreated] = useState<ActivityConfig | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const alive = useRef(false)
  const lock = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const available = [...configs, ...(created && !configs.some(c => c.id === created.id) ? [created] : [])]
    .filter(config => canPlanActivity(config, childId))
  const selected = available.find(config => config.id === selectedId)

  if (creating) return <AddActivityDialog
    open childId={childId}
    nextSortOrder={Math.max(0, ...configs.map(config => config.sortOrder)) + 1}
    submitLabel="Save to Curriculum"
    description={`For ${childName}. Saves a reusable resource. ${dayLabel ? `You can then add it to ${dayLabel}.` : 'This does not change your current week.'}`}
    onAdd={async data => {
      const id = await addActivityConfig(familyId, data)
      if (!alive.current) return
      const now = new Date().toISOString()
      setCreated({ ...data, id, completed: false, createdAt: now, updatedAt: now })
      setSelectedId(id)
      if (!dayLabel) onResourceSaved(data.name)
    }}
    onClose={() => dayLabel ? setCreating(false) : onClose()}
  />

  const add = async () => {
    if (!selected || lock.current) return
    lock.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onAdd(selected)
      if (alive.current) onClose()
    } catch (err) {
      console.warn('[Planner] Add item failed', err)
      if (alive.current) setSaveError(err instanceof Error ? err.message : 'Could not add this item. Try again.')
    } finally {
      lock.current = false
      if (alive.current) setSaving(false)
    }
  }

  return <Dialog open onClose={() => { if (!lock.current) onClose() }} fullWidth maxWidth="sm">
    <DialogTitle>Add item · {childName}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography fontWeight={600}>{dayLabel}</Typography>
        <Typography variant="body2" color="text.secondary">
          {applied ? 'Adds directly to this day’s checklist.' : 'Adds to your draft. Apply the plan to save it to the day.'}
        </Typography>
        {created && <Alert severity="success">{created.name} is saved in Curriculum. Choose Add to day to schedule it.</Alert>}
        {(error || saveError) && <Alert severity="error">{saveError || 'Could not load Curriculum. Close and try again.'}</Alert>}
        <TextField select label="From Curriculum" value={selected?.id ?? ''}
          onChange={event => setSelectedId(event.target.value)} fullWidth
          disabled={saving || loading || !!error}
          helperText={loading ? 'Loading Curriculum…' : available.length ? 'Use a resource you already have.' : 'No available activities yet. Create one below.'}>
          {available.map(config => <MenuItem key={config.id} value={config.id} sx={{ whiteSpace: 'normal', minHeight: 44 }}>{config.name} · {config.defaultMinutes} min</MenuItem>)}
        </TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" disabled={saving || loading || !!error} onClick={() => setCreating(true)} sx={{ minHeight: 44 }}>Create new resource</Button>
          <Button variant="outlined" disabled={saving} onClick={onVideo} sx={{ minHeight: 44 }}>Choose a video</Button>
        </Stack>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={saving || loading || !!error || !selected} onClick={add} sx={{ minHeight: 44 }}>
        {saving ? 'Adding…' : 'Add to day'}
      </Button>
    </DialogActions>
  </Dialog>
}
