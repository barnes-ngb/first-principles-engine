import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { GeneratedActivity } from '../../core/ai/useAI'
import type { DraftPlanItem } from '../../core/types/domain'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'

/** Decode any literal \\uXXXX escape sequences that survived double-serialization. */
function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}

interface LessonCardPreviewProps {
  open: boolean
  onClose: () => void
  activity: GeneratedActivity
  planItem: DraftPlanItem
  saved: boolean
  saving: boolean
  onSave: () => void
}

export default function LessonCardPreview({
  open,
  onClose,
  activity,
  planItem,
  saved,
  saving,
  onSave,
}: LessonCardPreviewProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant="h6" component="span">{decodeUnicodeEscapes(activity.title)}</Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Objective */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Objective
            </Typography>
            <Typography variant="body2">{decodeUnicodeEscapes(activity.objective)}</Typography>
          </Box>

          {/* Skill tags */}
          {planItem.skillTags.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {planItem.skillTags.map((tag) => {
                const def = SKILL_TAG_MAP[tag]
                return (
                  <Chip
                    key={tag}
                    label={def?.label ?? tag.split('.').pop()}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                )
              })}
              <Chip
                label={`${planItem.estimatedMinutes}m`}
                size="small"
                variant="outlined"
              />
            </Stack>
          )}

          <Divider />

          {/* Materials */}
          {activity.materials.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Materials
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {activity.materials.map((m, i) => (
                  <Chip key={i} label={decodeUnicodeEscapes(m)} size="small" variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}

          {/* Steps */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Steps
            </Typography>
            <List dense disablePadding>
              {activity.steps.map((step, i) => (
                <ListItem key={i} sx={{ pl: 0 }}>
                  <ListItemText
                    primary={`${i + 1}. ${decodeUnicodeEscapes(step)}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Success Criteria */}
          {activity.successCriteria.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Success Criteria
              </Typography>
              <List dense disablePadding>
                {activity.successCriteria.map((c, i) => (
                  <ListItem key={i} sx={{ pl: 0 }}>
                    <ListItemText
                      primary={`• ${decodeUnicodeEscapes(c)}`}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          <Divider />

          {/* Save button */}
          <Button
            variant={saved ? 'outlined' : 'contained'}
            startIcon={saved ? <BookmarkIcon /> : <BookmarkBorderIcon />}
            onClick={onSave}
            disabled={saved || saving}
            fullWidth
          >
            {saving ? 'Saving...' : saved ? 'Saved as Lesson Card' : 'Save as Lesson Card'}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
