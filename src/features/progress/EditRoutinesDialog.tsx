import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import type { ActivityConfig } from '../../core/types'
import type { ActivityFrequency } from '../../core/types/enums'
import { durationOptionsWithValue } from './durationOptions'

interface EditRoutinesDialogProps {
  open: boolean
  routines: ActivityConfig[]
  onSave: (updated: ActivityConfig[]) => void
  onClose: () => void
}

export default function EditRoutinesDialog({ open, routines, onSave, onClose }: EditRoutinesDialogProps) {
  const [items, setItems] = useState<ActivityConfig[]>(() => routines.map((r) => ({ ...r })))

  const updateItem = (index: number, field: keyof ActivityConfig, value: unknown) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const addItem = () => {
    const now = new Date().toISOString()
    setItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: '',
        type: 'routine',
        subjectBucket: 'Other',
        defaultMinutes: 15,
        frequency: 'daily',
        childId: 'both',
        sortOrder: prev.length + 1,
        completed: false,
        scannable: false,
        createdAt: now,
        updatedAt: now,
      } as ActivityConfig,
    ])
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Routine Activities</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {items.map((item, i) => (
            <Stack key={item.id} direction="row" spacing={1} alignItems="center">
              <TextField
                value={item.name}
                onChange={(e) => updateItem(i, 'name', e.target.value)}
                size="small"
                placeholder="Activity name"
                sx={{ flex: 1 }}
              />
              <Select
                value={item.defaultMinutes}
                size="small"
                onChange={(e) => updateItem(i, 'defaultMinutes', Number(e.target.value))}
                sx={{ minWidth: 84 }}
              >
                {durationOptionsWithValue(item.defaultMinutes).map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}m
                  </MenuItem>
                ))}
              </Select>
              <Select
                value={item.frequency}
                size="small"
                onChange={(e) => updateItem(i, 'frequency', e.target.value as ActivityFrequency)}
                sx={{ minWidth: 100 }}
              >
                <MenuItem value="daily">daily</MenuItem>
                <MenuItem value="3x">3x/wk</MenuItem>
                <MenuItem value="2x">2x/wk</MenuItem>
                <MenuItem value="1x">1x/wk</MenuItem>
              </Select>
              <IconButton size="small" onClick={() => removeItem(i)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} onClick={addItem} sx={{ alignSelf: 'flex-start' }}>
            Add routine activity
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(items)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
