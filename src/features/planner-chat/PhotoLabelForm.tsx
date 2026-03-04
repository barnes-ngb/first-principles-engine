import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DeleteIcon from '@mui/icons-material/Delete'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import PhotoCapture from '../../components/PhotoCapture'
import type { PhotoLabel, WorkbookConfig } from '../../core/types/domain'
import { SubjectBucket } from '../../core/types/enums'

interface PhotoLabelFormProps {
  labels: PhotoLabel[]
  onLabelsChange: (labels: PhotoLabel[]) => void
  onPhotoCapture: (file: File) => Promise<string | null>
  uploading: boolean
  workbookConfigs?: WorkbookConfig[]
}

/**
 * Try to match a user's lesson label against workbook configs.
 * E.g. "TGTB Math lesson 47" or "lesson 47" → finds matching config.
 */
function matchWorkbookConfig(
  lessonOrPages: string,
  subject: SubjectBucket,
  configs: WorkbookConfig[],
): WorkbookConfig | null {
  if (!lessonOrPages.trim() || configs.length === 0) return null

  const text = lessonOrPages.toLowerCase()

  // Try to match by name mention in the label
  for (const config of configs) {
    const nameLower = config.name.toLowerCase()
    if (text.includes(nameLower) && config.subjectBucket === subject) {
      return config
    }
    // Also try partial name match (e.g. "TGTB" matching "TGTB Math")
    const words = nameLower.split(/\s+/)
    for (const word of words) {
      if (word.length >= 3 && text.includes(word) && config.subjectBucket === subject) {
        return config
      }
    }
  }

  // If no name match, try matching by subject alone (if only one config for that subject)
  const subjectConfigs = configs.filter((c) => c.subjectBucket === subject)
  if (subjectConfigs.length === 1) {
    return subjectConfigs[0]
  }

  return null
}

/** Extract a lesson/page number from label text. */
function extractLessonNumber(lessonOrPages: string): string | null {
  const match = lessonOrPages.match(/(?:lesson|les|pg|page|ch|chapter)\s*#?\s*(\d+)/i)
  if (match) return match[1]
  // Try bare number
  const bareMatch = lessonOrPages.match(/^\s*(\d+)\s*$/)
  if (bareMatch) return bareMatch[1]
  return null
}

/** Build a descriptive chip label from workbook config + lesson number. */
function buildWorkbookChipLabel(config: WorkbookConfig, lessonNumber: string | null): string {
  const parts = [config.name]
  if (lessonNumber) {
    parts.push(`${config.unitLabel} ${lessonNumber} of ${config.totalUnits}`)
  }
  return parts.join(' — ')
}

export default function PhotoLabelForm({
  labels,
  onLabelsChange,
  onPhotoCapture,
  uploading,
  workbookConfigs = [],
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
      const newLabel = { ...label, [field]: value }

      // When lesson/pages or subject changes, try to match workbook config
      if ((field === 'lessonOrPages' || field === 'subjectBucket') && workbookConfigs.length > 0) {
        const lessonText = field === 'lessonOrPages' ? (value as string) : label.lessonOrPages
        const subject = field === 'subjectBucket' ? (value as SubjectBucket) : label.subjectBucket
        const match = matchWorkbookConfig(lessonText, subject, workbookConfigs)
        if (match) {
          const lessonNum = extractLessonNumber(lessonText)
          newLabel.extractedContent = {
            subject: match.subjectBucket,
            lessonNumber: lessonNum ?? '',
            topic: match.name,
            estimatedMinutes: label.estimatedMinutes,
            difficulty: '',
            modifications: '',
            rawDescription: `${match.name} ${match.unitLabel} ${lessonNum ?? ''}`.trim(),
            workbookMatch: {
              workbookName: match.name,
              totalUnits: match.totalUnits,
              currentPosition: match.currentPosition,
              unitLabel: match.unitLabel,
            },
          }
        } else {
          // Clear extracted content if no match
          newLabel.extractedContent = undefined
        }
      }

      return newLabel
    })
    onLabelsChange(updated)
  }

  const handleRemove = (index: number) => {
    onLabelsChange(labels.filter((_, i) => i !== index))
  }

  return (
    <Stack spacing={1.5}>
      {labels.map((label, index) => {
        const matchedConfig = label.extractedContent?.workbookMatch
        const lessonNum = extractLessonNumber(label.lessonOrPages)

        return (
          <Box
            key={label.artifactId}
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: matchedConfig ? 'success.light' : 'divider',
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
              {matchedConfig && (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  label={buildWorkbookChipLabel(
                    {
                      name: matchedConfig.workbookName,
                      totalUnits: matchedConfig.totalUnits,
                      currentPosition: matchedConfig.currentPosition,
                      unitLabel: matchedConfig.unitLabel,
                    } as WorkbookConfig,
                    lessonNum,
                  )}
                  sx={{ alignSelf: 'flex-start' }}
                />
              )}
            </Stack>
          </Box>
        )
      })}
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
