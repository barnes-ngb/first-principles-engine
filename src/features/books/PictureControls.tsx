import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import RotateLeftIcon from '@mui/icons-material/RotateLeft'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import FlipIcon from '@mui/icons-material/Flip'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import type { ImagePosition } from './draggableImageUtils'

interface PictureControlsProps {
  label: string
  position: ImagePosition
  busy: boolean
  canTransform: boolean
  onNudge: (axis: 'x' | 'y', sign: 1 | -1) => void
  onRotate: (sign: 1 | -1) => void
  onFlip: (axis: 'flipH' | 'flipV') => void
  onScale: (factor: number) => void
  onCenter: () => void
  onRemove?: () => void
  onReorder?: (direction: 'up' | 'down') => void
}

/** Ordinary document-flow controls, outside the picture's clipping, rotation
 * and stacking context. All actions also work by keyboard or a single tap. */
export default function PictureControls({ label, position, busy, canTransform, onNudge, onRotate, onFlip, onScale, onCenter, onRemove, onReorder }: PictureControlsProps) {
  const disabled = busy || !canTransform
  const action = (name: string, icon: ReactNode, onClick: () => void, pressed?: boolean) => (
    <Tooltip title={name} disableInteractive>
      <span>
        <IconButton aria-label={name} aria-pressed={pressed} onClick={onClick} disabled={disabled} sx={{ minWidth: 44, minHeight: 44, bgcolor: pressed ? 'action.selected' : undefined }}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  )
  return (
    <Paper
      variant="outlined"
      role="group"
      aria-label="Selected picture controls"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      sx={{ p: 1, borderRadius: 2, minWidth: 0, maxWidth: '100%' }}
    >
      <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere', mb: 0.5 }}>Selected: {label}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ mr: 0.5 }}>Move</Typography>
        {action('Move left', <ArrowBackIcon fontSize="small" />, () => onNudge('x', -1))}
        {action('Move up', <ArrowUpwardIcon fontSize="small" />, () => onNudge('y', -1))}
        {action('Move down', <ArrowDownwardIcon fontSize="small" />, () => onNudge('y', 1))}
        {action('Move right', <ArrowForwardIcon fontSize="small" />, () => onNudge('x', 1))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
        <Button size="small" disabled={disabled} onClick={() => onScale(1 / 1.1)} sx={{ minHeight: 44 }}>Smaller</Button>
        <Button size="small" disabled={disabled} onClick={() => onScale(1.1)} sx={{ minHeight: 44 }}>Larger</Button>
        {action('Rotate left 15°', <RotateLeftIcon fontSize="small" />, () => onRotate(-1))}
        {action('Rotate right 15°', <RotateRightIcon fontSize="small" />, () => onRotate(1))}
        <Typography variant="caption">{Math.round(position.rotation)}°</Typography>
        {action('Flip horizontal', <FlipIcon fontSize="small" />, () => onFlip('flipH'), position.flipH)}
        {action('Flip vertical', <FlipIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />, () => onFlip('flipV'), position.flipV)}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        <Button size="small" startIcon={<CenterFocusStrongIcon />} disabled={disabled} onClick={onCenter} sx={{ minHeight: 44 }}>Center on page</Button>
        {onReorder && <>
          <Button size="small" disabled={busy} onClick={() => onReorder('down')} sx={{ minHeight: 44 }}>Send backward</Button>
          <Button size="small" disabled={busy} onClick={() => onReorder('up')} sx={{ minHeight: 44 }}>Bring forward</Button>
        </>}
        {onRemove && <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} disabled={busy} onClick={onRemove} sx={{ minHeight: 44 }}>Remove picture</Button>}
      </Box>
    </Paper>
  )
}
