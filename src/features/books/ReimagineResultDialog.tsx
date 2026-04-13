import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import WallpaperIcon from '@mui/icons-material/Wallpaper'
import StarIcon from '@mui/icons-material/Star'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

import type { ReimagineJob } from './useBackgroundReimagine'

interface ReimagineResultDialogProps {
  open: boolean
  job: ReimagineJob | null
  onClose: () => void
  onReplaceBackground: () => void
  onAddAsSticker: () => void
  onSaveToGallery: () => void
  onDiscard: () => void
}

export default function ReimagineResultDialog({
  open,
  job,
  onClose,
  onReplaceBackground,
  onAddAsSticker,
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
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 1.5,
            }}
          >
            <Box
              onClick={onReplaceBackground}
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
              <WallpaperIcon color="primary" />
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                Replace background
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                Full page background
              </Typography>
            </Box>
            <Box
              onClick={onAddAsSticker}
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
                Add as sticker
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                Movable & resizable
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
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                Save for later
              </Typography>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          Saved to your gallery automatically
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            startIcon={<DeleteOutlineIcon />}
            color="error"
            onClick={onDiscard}
            size="small"
          >
            Discard
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
