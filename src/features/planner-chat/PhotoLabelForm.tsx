import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DeleteIcon from '@mui/icons-material/Delete'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import PhotoCapture from '../../components/PhotoCapture'
import type { PhotoLabel } from '../../core/types/domain'
import { SubjectBucket } from '../../core/types/enums'

interface PhotoLabelFormProps {
  labels: PhotoLabel[]
  onLabelsChange: (labels: PhotoLabel[]) => void
  onPhotoCapture: (file: File) => Promise<string | null>
  uploading: boolean
}

export default function PhotoLabelForm({
  labels,
  onLabelsChange,
  onPhotoCapture,
  uploading,
}: PhotoLabelFormProps) {
  const handleCapture = async (file: File) => {
    const artifactId = await onPhotoCapture(file)
    if (artifactId) {
      onLabelsChange([
        ...labels,
        {
          artifactId,
          subjectBucket: SubjectBucket.Other,
          lessonOrPages: '',
          estimatedMinutes: 15,
        },
      ])
    }
  }

  const handleUpdate = (index: number, field: keyof PhotoLabel, value: string | number) => {
    const updated = labels.map((label, i) => {
      if (i !== index) return label
      return { ...label, [field]: value }
    })
    onLabelsChange(updated)
  }

  const handleRemove = (index: number) => {
    onLabelsChange(labels.filter((_, i) => i !== index))
  }

  return (
    <Stack spacing={1.5}>
      {labels.map((label, index) => (
        <Box
          key={label.artifactId}
          sx={{
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AddPhotoAlternateIcon fontSize="small" color="action" />
              <Typography variant="body2" sx={{ flex: 1 }}>
                Photo {index + 1}
              </Typography>
              <IconButton size="small" onClick={() => handleRemove(index)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <TextField
                label="Subject"
                select
                size="small"
                value={label.subjectBucket}
                onChange={(e) => handleUpdate(index, 'subjectBucket', e.target.value)}
                sx={{ minWidth: 120 }}
              >
                {Object.values(SubjectBucket).map((bucket) => (
                  <MenuItem key={bucket} value={bucket}>{bucket}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Lesson / Pages"
                size="small"
                value={label.lessonOrPages}
                onChange={(e) => handleUpdate(index, 'lessonOrPages', e.target.value)}
                sx={{ flex: 1, minWidth: 120 }}
              />
              <TextField
                label="Est. min"
                type="number"
                size="small"
                value={label.estimatedMinutes}
                onChange={(e) =>
                  handleUpdate(index, 'estimatedMinutes', Number(e.target.value) || 15)
                }
                inputProps={{ min: 5, max: 120, step: 5 }}
                sx={{ width: 90 }}
              />
            </Stack>
          </Stack>
        </Box>
      ))}
      <Box>
        <PhotoCapture onCapture={handleCapture} uploading={uploading} />
        {labels.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {labels.length} photo{labels.length > 1 ? 's' : ''} labeled
          </Typography>
        )}
      </Box>
    </Stack>
  )
}
