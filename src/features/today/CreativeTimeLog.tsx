import { useState } from 'react'

import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PaletteIcon from '@mui/icons-material/Palette'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import { hoursCollection } from '../../core/firebase/firestore'
import { SubjectBucket } from '../../core/types/enums'
import { todayKey } from '../../core/utils/dateKey'

const CREATIVE_ACTIVITIES = [
  { id: 'drawing', label: 'Drawing / Painting', bucket: SubjectBucket.Art, icon: '🎨' },
  { id: 'bookmaking', label: 'Book-making', bucket: SubjectBucket.LanguageArts, icon: '📖' },
  { id: 'building', label: 'Building / Lego / Engineering', bucket: SubjectBucket.Science, icon: '🧱' },
  { id: 'gamedesign', label: 'Game Design / Play', bucket: SubjectBucket.Art, icon: '🎲' },
  { id: 'music', label: 'Music / Singing', bucket: SubjectBucket.Music, icon: '🎵' },
  { id: 'nature', label: 'Nature Exploration', bucket: SubjectBucket.Science, icon: '🌿' },
  { id: 'other', label: 'Other Creative', bucket: SubjectBucket.Art, icon: '✨' },
] as const

interface CreativeTimeLogProps {
  familyId: string
  childId: string
  childName: string
}

export default function CreativeTimeLog({ familyId, childId, childName }: CreativeTimeLogProps) {
  const [activityId, setActivityId] = useState<string>(CREATIVE_ACTIVITIES[0].id)
  const [minutes, setMinutes] = useState(15)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [snackOpen, setSnackOpen] = useState(false)

  const selectedActivity = CREATIVE_ACTIVITIES.find((a) => a.id === activityId) ?? CREATIVE_ACTIVITIES[0]

  const handleLog = async () => {
    if (minutes < 1 || saving) return
    setSaving(true)
    try {
      await addDoc(hoursCollection(familyId), {
        childId,
        date: todayKey(),
        minutes,
        subjectBucket: selectedActivity.bucket,
        quickCapture: true,
        notes: notes.trim()
          ? `${selectedActivity.label}: ${notes.trim()}`
          : selectedActivity.label,
      })
      setMinutes(15)
      setNotes('')
      setSnackOpen(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PaletteIcon color="secondary" />
            <Typography fontWeight={600}>Log Creative Time</Typography>
          </Stack>
        </AccordionSummary>

        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Quick-log creative activity for {childName}
          </Typography>

          <Stack spacing={2}>
            <TextField
              select
              label="Activity"
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              fullWidth
              size="medium"
            >
              {CREATIVE_ACTIVITIES.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.icon} {a.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Minutes"
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
              inputProps={{ min: 1, max: 480, inputMode: 'numeric' }}
              fullWidth
              size="medium"
            />

            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              size="medium"
            />

            <Button
              variant="contained"
              onClick={handleLog}
              disabled={saving || minutes < 1}
              size="large"
              sx={{ minHeight: 48 }}
            >
              {saving ? 'Logging...' : 'Log'}
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Snackbar
        open={snackOpen}
        autoHideDuration={3000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnackOpen(false)} variant="filled">
          Logged {selectedActivity.label} for {childName}
        </Alert>
      </Snackbar>
    </>
  )
}
