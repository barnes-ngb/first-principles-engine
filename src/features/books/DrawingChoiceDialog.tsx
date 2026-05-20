import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import DescriptionIcon from '@mui/icons-material/Description'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import BrushIcon from '@mui/icons-material/Brush'
import StarIcon from '@mui/icons-material/Star'
import WallpaperIcon from '@mui/icons-material/Wallpaper'

/** Checkerboard background to make transparent regions visible in previews. */
export const CHECKERBOARD_BG =
  'repeating-conic-gradient(#e0e0e0 0% 25%, #fff 0% 50%) 50% / 16px 16px'

export type DrawingChoice = 'as-is' | 'cleanup' | 'reimagine' | 'sticker' | 'scene'

/**
 * Post-cleanup actions on the cleaned (transparent) drawing.
 * - 'reimagine-sticker': AI enhance with transparent background → sticker
 * - 'reimagine-scene':   AI enhance with full illustrated background
 */
export type PostCleanupChoice =
  | 'add-sticker'
  | 'reimagine-sticker'
  | 'reimagine-scene'
  | 'save-sticker'

interface DrawingChoiceDialogProps {
  open: boolean
  capturedFile: File | null
  capturedPreviewUrl: string | null
  onClose: () => void
  onChoose: (choice: DrawingChoice, reimagineIntensity?: number, transparent?: boolean) => void
  processing: boolean
  processingLabel?: string
  /** Elapsed seconds while processing (for progress feedback) */
  elapsedSeconds?: number
  /** Preview result from processing (cleanup/reimagine/sticker/scene) */
  resultPreviewUrl?: string | null
  /** True when the result preview is a cleaned transparent drawing — show
   *  the post-cleanup choice grid (sticker / reimagine / save / scene). */
  resultIsCleaned?: boolean
  /** Default accept handler — used when not in cleaned-grid mode. */
  onAcceptResult?: () => void
  /** Pick a follow-up action for a cleaned drawing. */
  onPickPostCleanup?: (
    choice: PostCleanupChoice,
    reimagineIntensity?: number,
    transparent?: boolean,
  ) => void
  onRetryResult?: () => void
}

const CHOICES: { value: DrawingChoice; icon: React.ReactNode; label: string; description: string }[] = [
  { value: 'as-is', icon: <DescriptionIcon />, label: 'Use as-is', description: 'Add the photo directly' },
  { value: 'cleanup', icon: <AutoFixHighIcon />, label: 'Clean up', description: 'Remove the background' },
  { value: 'reimagine', icon: <BrushIcon />, label: 'Reimagine', description: 'AI enhances your drawing' },
  { value: 'sticker', icon: <StarIcon />, label: 'Make a sticker', description: 'Turn into a positionable sticker' },
  { value: 'scene', icon: <WallpaperIcon />, label: 'Make a scene', description: 'Create a background from it' },
]

const POST_CLEANUP_CHOICES: { value: PostCleanupChoice; icon: React.ReactNode; label: string; description: string }[] = [
  { value: 'reimagine-sticker', icon: <BrushIcon />, label: 'Reimagine as sticker', description: 'AI enhances, keeps transparent' },
  { value: 'add-sticker', icon: <StarIcon />, label: 'Add as sticker', description: 'Use cleaned version as-is' },
  { value: 'reimagine-scene', icon: <WallpaperIcon />, label: 'Reimagine as scene', description: 'AI creates full background' },
  { value: 'save-sticker', icon: <DescriptionIcon />, label: 'Save to gallery', description: 'Save to your sticker library' },
]

const REIMAGINE_MARKS = [
  { value: 0, label: 'Light' },
  { value: 50, label: 'Medium' },
  { value: 100, label: 'Full' },
]

export default function DrawingChoiceDialog({
  open,
  capturedFile,
  capturedPreviewUrl,
  onClose,
  onChoose,
  processing,
  processingLabel,
  elapsedSeconds = 0,
  resultPreviewUrl,
  resultIsCleaned = false,
  onAcceptResult,
  onPickPostCleanup,
  onRetryResult,
}: DrawingChoiceDialogProps) {
  const [selectedChoice, setSelectedChoice] = useState<DrawingChoice | null>(null)
  const [reimagineIntensity, setReimagineIntensity] = useState(50)
  /**
   * Tracks which post-cleanup reimagine path is open:
   * - 'sticker' → transparent toggle defaults ON
   * - 'scene'   → transparent toggle defaults OFF
   * - null      → not in the post-cleanup reimagine intensity step
   */
  const [postCleanupReimagineMode, setPostCleanupReimagineMode] =
    useState<'sticker' | 'scene' | null>(null)
  /** Transparent-background toggle for the reimagine call. */
  const [transparent, setTransparent] = useState(false)

  const handleChoiceClick = useCallback((choice: DrawingChoice) => {
    if (choice === 'as-is') {
      onChoose('as-is')
      return
    }
    if (choice === 'reimagine') {
      // Raw-photo reimagine → default the transparent toggle OFF (full scene look).
      setTransparent(false)
      setSelectedChoice('reimagine')
      return
    }
    setSelectedChoice(choice)
    onChoose(choice)
  }, [onChoose])

  const handleReimaginGo = useCallback(() => {
    onChoose('reimagine', reimagineIntensity, transparent)
  }, [onChoose, reimagineIntensity, transparent])

  const handlePostCleanupClick = useCallback((choice: PostCleanupChoice) => {
    if (!onPickPostCleanup) return
    if (choice === 'reimagine-sticker') {
      // Sticker path → default transparent toggle ON.
      setTransparent(true)
      setPostCleanupReimagineMode('sticker')
      return
    }
    if (choice === 'reimagine-scene') {
      // Scene path → default transparent toggle OFF.
      setTransparent(false)
      setPostCleanupReimagineMode('scene')
      return
    }
    onPickPostCleanup(choice)
  }, [onPickPostCleanup])

  const handlePostCleanupReimagineGo = useCallback(() => {
    if (!onPickPostCleanup) return
    // Both sticker + scene paths route through the same `reimagine-sticker`
    // server-side handler — the `transparent` flag controls the output.
    const choice: PostCleanupChoice =
      postCleanupReimagineMode === 'scene' ? 'reimagine-scene' : 'reimagine-sticker'
    onPickPostCleanup(choice, reimagineIntensity, transparent)
  }, [onPickPostCleanup, reimagineIntensity, transparent, postCleanupReimagineMode])

  const handleClose = useCallback(() => {
    setSelectedChoice(null)
    setReimagineIntensity(50)
    setPostCleanupReimagineMode(null)
    setTransparent(false)
    onClose()
  }, [onClose])

  if (!capturedFile || !capturedPreviewUrl) return null

  // Post-cleanup reimagine intensity slider (sticker or scene path)
  if (resultPreviewUrl && resultIsCleaned && postCleanupReimagineMode) {
    const isSticker = postCleanupReimagineMode === 'sticker'
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>
          {isSticker ? 'Reimagine as sticker' : 'Reimagine as scene'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, mb: 2 }}>
            <Box
              component="img"
              src={resultPreviewUrl}
              alt="Cleaned drawing"
              sx={{
                width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 1, mb: 2,
                background: CHECKERBOARD_BG,
              }}
            />
            <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                Keep my style
              </Typography>
              <Slider
                value={reimagineIntensity}
                onChange={(_, v) => setReimagineIntensity(v as number)}
                marks={REIMAGINE_MARKS}
                step={null}
                min={0}
                max={100}
                sx={{ flex: 1 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                Full reimagine
              </Typography>
            </Stack>
            <FormControlLabel
              sx={{ mt: 2, ml: 0.5 }}
              control={
                <Switch
                  checked={transparent}
                  onChange={(_, v) => setTransparent(v)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  Keep transparent background (for stickers)
                </Typography>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPostCleanupReimagineMode(null)}>Back</Button>
          <Button variant="contained" onClick={handlePostCleanupReimagineGo}>
            Reimagine!
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  // Post-cleanup choice grid — shown after cleanup completes when caller
  // opted into the new flow (onPickPostCleanup provided).
  if (resultPreviewUrl && resultIsCleaned && onPickPostCleanup) {
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>What's next?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Background removed — here's your cleaned drawing.
          </Typography>
          <Box
            component="img"
            src={resultPreviewUrl}
            alt="Cleaned drawing"
            sx={{
              width: '100%',
              maxHeight: 180,
              objectFit: 'contain',
              borderRadius: 1,
              mb: 2,
              // Checkerboard so transparent regions are visible
              background: CHECKERBOARD_BG,
            }}
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 1.5,
            }}
          >
            {POST_CLEANUP_CHOICES.map((c) => (
              <Box
                key={c.value}
                onClick={() => handlePostCleanupClick(c.value)}
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
                  minHeight: 90,
                  justifyContent: 'center',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  '&:active': { transform: 'scale(0.97)' },
                }}
              >
                <Box sx={{ color: 'primary.main', fontSize: 28, display: 'flex' }}>{c.icon}</Box>
                <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                  {c.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, fontSize: '0.65rem' }}>
                  {c.description}
                </Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          {onRetryResult && (
            <Button onClick={onRetryResult} disabled={processing}>Try again</Button>
          )}
          <Button onClick={handleClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    )
  }

  // Generic result preview with single accept (used by sticker/reimagine/scene)
  if (resultPreviewUrl && onAcceptResult) {
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>How does it look?</DialogTitle>
        <DialogContent>
          <Box
            component="img"
            src={resultPreviewUrl}
            alt="Processed result"
            sx={{ width: '100%', borderRadius: 1, mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          {onRetryResult && (
            <Button onClick={onRetryResult} disabled={processing}>Try again</Button>
          )}
          <Button variant="contained" onClick={() => { onAcceptResult(); handleClose() }}>
            Use this
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  // Show processing state
  if (processing) {
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogContent>
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress size={36} />
            <Typography>{processingLabel ?? 'Processing...'}</Typography>
            {elapsedSeconds > 15 && (
              <Typography variant="body2" color="text.secondary">
                {elapsedSeconds}s
                {elapsedSeconds > 90 ? ' — taking longer than usual...' : elapsedSeconds > 60 ? ' — almost there!' : ' — AI is creating your image'}
              </Typography>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    )
  }

  // Show reimagine intensity slider
  if (selectedChoice === 'reimagine' && !processing) {
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Reimagine intensity</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, mb: 2 }}>
            <Box
              component="img"
              src={capturedPreviewUrl}
              alt="Your drawing"
              sx={{
                width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 1, mb: 2,
                ...(transparent ? { background: CHECKERBOARD_BG } : {}),
              }}
            />
            <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                Keep my style
              </Typography>
              <Slider
                value={reimagineIntensity}
                onChange={(_, v) => setReimagineIntensity(v as number)}
                marks={REIMAGINE_MARKS}
                step={null}
                min={0}
                max={100}
                sx={{ flex: 1 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                Full reimagine
              </Typography>
            </Stack>
            <FormControlLabel
              sx={{ mt: 2, ml: 0.5 }}
              control={
                <Switch
                  checked={transparent}
                  onChange={(_, v) => setTransparent(v)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  Keep transparent background (for stickers)
                </Typography>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedChoice(null)}>Back</Button>
          <Button variant="contained" onClick={handleReimaginGo}>
            Reimagine!
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  // Main choice grid
  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>What should we do with your drawing?</DialogTitle>
      <DialogContent>
        {/* Small preview of the captured image */}
        <Box
          component="img"
          src={capturedPreviewUrl}
          alt="Your drawing"
          sx={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 1, mb: 2, mt: 1 }}
        />

        {/* Choice grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1.5,
          }}
        >
          {CHOICES.map((c) => (
            <Box
              key={c.value}
              onClick={() => handleChoiceClick(c.value)}
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
                minHeight: 90,
                justifyContent: 'center',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
                '&:active': {
                  transform: 'scale(0.97)',
                },
              }}
            >
              <Box sx={{ color: 'primary.main', fontSize: 28, display: 'flex' }}>
                {c.icon}
              </Box>
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                {c.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, fontSize: '0.65rem' }}>
                {c.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
