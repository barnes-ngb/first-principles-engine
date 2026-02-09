import { useCallback, useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { addDoc } from 'firebase/firestore'

import { useFamilyId } from '../core/auth/useAuth'
import { childrenCollection } from '../core/firebase/firestore'
import type { Child } from '../core/types/domain'

interface AddChildDialogProps {
  open: boolean
  onClose: () => void
  onChildAdded: (child: Child) => void
}

export default function AddChildDialog({
  open,
  onClose,
  onChildAdded,
}: AddChildDialogProps) {
  const familyId = useFamilyId()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [baselineReading, setBaselineReading] = useState('')
  const [baselineMath, setBaselineMath] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    setIsSaving(true)
    setError('')

    try {
      const birthdate = age
        ? new Date(
            Date.now() - Number(age) * 365.25 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .slice(0, 10)
        : undefined

      const childData = {
        id: '',
        name: trimmedName,
        ...(birthdate ? { birthdate } : {}),
        ...(baselineReading.trim()
          ? { baselineReading: baselineReading.trim() }
          : {}),
        ...(baselineMath.trim()
          ? { baselineMath: baselineMath.trim() }
          : {}),
        createdAt: new Date().toISOString(),
      }

      const ref = await addDoc(childrenCollection(familyId), childData)
      const child: Child = { ...childData, id: ref.id }
      onChildAdded(child)

      // Reset form
      setName('')
      setAge('')
      setBaselineReading('')
      setBaselineMath('')
      onClose()
    } catch (err) {
      console.error('Failed to create child', err)
      setError('Failed to create child. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }, [familyId, name, age, baselineReading, baselineMath, onChildAdded, onClose])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Child</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            error={!!error && !name.trim()}
            helperText={!name.trim() && error ? error : undefined}
          />
          <TextField
            label="Age"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            fullWidth
            slotProps={{ htmlInput: { min: 1, max: 18 } }}
          />
          <TextField
            label="Reading baseline (optional)"
            placeholder="e.g. Pre-K level, knows letter sounds"
            value={baselineReading}
            onChange={(e) => setBaselineReading(e.target.value)}
            fullWidth
          />
          <TextField
            label="Math baseline (optional)"
            placeholder="e.g. Counts to 20, knows shapes"
            value={baselineMath}
            onChange={(e) => setBaselineMath(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
        >
          {isSaving ? 'Saving...' : 'Add Child'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
