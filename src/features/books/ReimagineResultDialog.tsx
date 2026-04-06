import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ImageIcon from '@mui/icons-material/Image'
import StarIcon from '@mui/icons-material/Star'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

import type { ReimagineJob } from './useBackgroundReimagine'

interface ReimagineResultDialogProps {
  open: boolean
  job: ReimagineJob | null
  onClose: () => void
  onAddToPage: () => void
  onMakeSticker: () => void
  onSaveToGallery: () => void
  onDiscard: () => void
}

export default function ReimagineResultDialog({
  open,
  job,
  onClose,
  onAddToPage,
  onMakeSticker,
  onSaveToGallery,
  onDiscard,
}: ReimagineResultDialogProps) {
  if (!job || job.status !== 'done' || !job.resultUrl) return null

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Your reimagined drawing</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* Side-by-side preview */}
          <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Original
              </Typography>
              <Box
                component="img"
                src={job.sourceImageUrl}
                alt="Original drawing"
                sx={{
                  width: '100%',
                  maxHeight: 180,
                  objectFit: 'contain',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
            </Box>
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Reimagined
              </Typography>
              <Box
                component="img"
                src={job.resultUrl}
                alt="Reimagined drawing"
                sx={{
                  width: '100%',
                  maxHeight: 180,
                  objectFit: 'contain',
                  borderRadius: 1,
                  border: '2px solid',
                  borderColor: 'secondary.main',
                }}
              />
            </Box>
          </Stack>

          {/* Action grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1.5,
            }}
          >
            <Box
              onClick={onAddToPage}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                p: 1.5,
                borderRadius: 2,
                border: '2px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
                minHeight: 80,
                justifyContent: 'center',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <ImageIcon color="primary" />
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                Add to page
              </Typography>
            </Box>
            <Box
              onClick={onMakeSticker}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                p: 1.5,
                borderRadius: 2,
                border: '2px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
                minHeight: 80,
                justifyContent: 'center',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <StarIcon color="primary" />
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                Make a sticker
              </Typography>
            </Box>
            <Box
              onClick={onSaveToGallery}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                p: 1.5,
                borderRadius: 2,
                border: '2px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
                minHeight: 80,
                justifyContent: 'center',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <SaveAltIcon color="primary" />
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                Save to gallery
              </Typography>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          startIcon={<DeleteOutlineIcon />}
          color="error"
          onClick={onDiscard}
          size="small"
        >
          Discard
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
