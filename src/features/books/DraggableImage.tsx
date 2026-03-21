import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import RotateLeftIcon from '@mui/icons-material/RotateLeft'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import type { PageImage } from '../../core/types/domain'

/** Extended position including rotation (degrees) and zIndex. */
export interface ImagePosition {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
}

interface DraggableImageProps {
  image: PageImage
  selected: boolean
  onSelect: () => void
  onPositionChange?: (position: ImagePosition) => void
  onRemove?: () => void
  onZIndexChange?: (delta: 1 | -1) => void
  style?: React.CSSProperties
}

const DEFAULT_POSITIONS: Record<PageImage['type'], { x: number; y: number; width: number; height: number }> = {
  'ai-generated': { x: 0, y: 0, width: 100, height: 100 },
  photo: { x: 10, y: 10, width: 40, height: 40 },
  sticker: { x: 25, y: 15, width: 30, height: 30 },
}

/** Rotation increment per tap (degrees). */
const ROTATION_STEP = 15
/** Nudge per arrow button tap (px). Converted to % via container size. */
const NUDGE_PX = 5

export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  // Allow up to 80% off-canvas on any edge (at least 20% visible).
  const minX = -(width * 0.8)
  const maxX = 100 - width * 0.2
  const minY = -(height * 0.8)
  const maxY = 100 - height * 0.2
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  }
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max)
}

function wrapRotation(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export default function DraggableImage({
  image,
  selected,
  onSelect,
  onPositionChange,
  onRemove,
  onZIndexChange,
  style,
}: DraggableImageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<ImagePosition>(() => {
    const base = image.position ?? DEFAULT_POSITIONS[image.type]
    return {
      x: base.x,
      y: base.y,
      width: base.width,
      height: base.height,
      rotation: image.position?.rotation ?? 0,
      zIndex: image.position?.zIndex ?? 0,
    }
  })
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [pinching, setPinching] = useState(false)
  const dragStart = useRef({ px: 0, py: 0, startX: 0, startY: 0 })
  const resizeStart = useRef({ px: 0, py: 0, startW: 0, startH: 0 })
  const pinchStart = useRef<{
    initialDistance: number
    initialWidth: number
    initialHeight: number
  } | null>(null)
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())

  const getContainerRect = useCallback(() => {
    const container = ref.current?.parentElement
    return container?.getBoundingClientRect() ?? null
  }, [])

  const updatePointer = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }, [])

  const removePointer = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) {
      setPinching(false)
      pinchStart.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (resizing) return
      e.stopPropagation()
      updatePointer(e)

      const el = ref.current
      if (!el) return
      el.setPointerCapture(e.pointerId)

      if (activePointers.current.size === 2) {
        const [p1, p2] = [...activePointers.current.values()]
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        setPinching(true)
        setDragging(false)
        pinchStart.current = {
          initialDistance: distance,
          initialWidth: pos.width,
          initialHeight: pos.height,
        }
        return
      }

      setDragging(true)
      dragStart.current = { px: e.clientX, py: e.clientY, startX: pos.x, startY: pos.y }
    },
    [pos.x, pos.y, pos.width, pos.height, resizing, updatePointer],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      updatePointer(e)

      if (pinching && pinchStart.current && activePointers.current.size >= 2) {
        const [p1, p2] = [...activePointers.current.values()]
        const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const scale = currentDistance / pinchStart.current.initialDistance

        const newW = clamp(pinchStart.current.initialWidth * scale, 10, 100)
        const aspectRatio = pinchStart.current.initialHeight / pinchStart.current.initialWidth
        const newH = clamp(newW * aspectRatio, 10, 100)

        setPos((prev) => ({ ...prev, width: newW, height: newH }))
        return
      }

      if (resizing) return
      if (!dragging) return
      const rect = getContainerRect()
      if (!rect) return
      const dx = ((e.clientX - dragStart.current.px) / rect.width) * 100
      const dy = ((e.clientY - dragStart.current.py) / rect.height) * 100
      const rawX = dragStart.current.startX + dx
      const rawY = dragStart.current.startY + dy
      const clamped = clampPosition(rawX, rawY, pos.width, pos.height)
      setPos((prev) => ({ ...prev, x: clamped.x, y: clamped.y }))
    },
    [pinching, dragging, resizing, updatePointer, getContainerRect, pos.width, pos.height],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      removePointer(e)

      const el = ref.current
      if (el) el.releasePointerCapture(e.pointerId)

      if (pinching || dragging) {
        setDragging(false)
        setPinching(false)
        setPos((curr) => {
          onPositionChange?.(curr)
          return curr
        })
      }
    },
    [pinching, dragging, onPositionChange, removePointer],
  )

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      setResizing(true)
      resizeStart.current = { px: e.clientX, py: e.clientY, startW: pos.width, startH: pos.height }
    },
    [pos.width, pos.height],
  )

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizing) return
      const rect = getContainerRect()
      if (!rect) return
      const dx = ((e.clientX - resizeStart.current.px) / rect.width) * 100
      const newW = clamp(resizeStart.current.startW + dx, 15, 100 - pos.x)
      const aspectRatio = resizeStart.current.startH / resizeStart.current.startW
      const newH = clamp(newW * aspectRatio, 15, 100 - pos.y)
      setPos((prev) => ({ ...prev, width: newW, height: newH }))
    },
    [resizing, getContainerRect, pos.x, pos.y],
  )

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!resizing) return
      const el = e.currentTarget as HTMLElement
      el.releasePointerCapture(e.pointerId)
      setResizing(false)
      setPos((curr) => {
        onPositionChange?.(curr)
        return curr
      })
    },
    [resizing, onPositionChange],
  )

  // ── Sticker toolbar actions ─────────────────────────────────

  const handleNudge = useCallback(
    (axis: 'x' | 'y', sign: 1 | -1) => {
      const rect = getContainerRect()
      const containerSize = rect ? (axis === 'x' ? rect.width : rect.height) : 800
      const nudgePct = (NUDGE_PX / containerSize) * 100
      setPos((prev) => {
        const rawVal = (axis === 'x' ? prev.x : prev.y) + sign * nudgePct
        const clamped = axis === 'x'
          ? clampPosition(rawVal, prev.y, prev.width, prev.height)
          : clampPosition(prev.x, rawVal, prev.width, prev.height)
        const next = { ...prev, x: clamped.x, y: clamped.y }
        onPositionChange?.(next)
        return next
      })
    },
    [getContainerRect, onPositionChange],
  )

  const handleRotate = useCallback(
    (sign: 1 | -1) => {
      setPos((prev) => {
        const next = { ...prev, rotation: wrapRotation(prev.rotation + sign * ROTATION_STEP) }
        onPositionChange?.(next)
        return next
      })
    },
    [onPositionChange],
  )

  // Determine if toolbar should appear below (sticker is near top edge)
  const nearTopEdge = pos.y < 15

  const isSticker = image.type === 'sticker'

  return (
    <Box
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      sx={{
        position: 'absolute',
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: `${pos.width}%`,
        height: `${pos.height}%`,
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        border: selected ? '2px dashed' : 'none',
        borderColor: 'primary.main',
        borderRadius: 1,
        transform: pos.rotation ? `rotate(${pos.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        ...style,
      }}
    >
      <Box
        component="img"
        src={image.url}
        alt={image.label ?? ''}
        draggable={false}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: image.type === 'sticker' ? 'contain' : 'cover',
          pointerEvents: 'none',
          ...(image.type === 'sticker' ? { mixBlendMode: 'multiply' } : {}),
        }}
      />

      {/* Remove button */}
      {selected && onRemove && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          sx={{
            position: 'absolute',
            top: -12,
            right: -12,
            bgcolor: 'error.main',
            color: 'white',
            width: 24,
            height: 24,
            '&:hover': { bgcolor: 'error.dark' },
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}

      {/* Resize handle */}
      {selected && (
        <Box
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          sx={{
            position: 'absolute',
            bottom: -6,
            right: -6,
            width: 24,
            height: 24,
            bgcolor: 'primary.main',
            borderRadius: '50%',
            cursor: 'nwse-resize',
            touchAction: 'none',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: -8,
              left: -8,
              right: -8,
              bottom: -8,
            },
          }}
        />
      )}

      {/* Sticker toolbar — only for stickers when selected */}
      {selected && isSticker && (
        <Paper
          elevation={4}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            ...(nearTopEdge
              ? { top: 'calc(100% + 8px)' }
              : { bottom: 'calc(100% + 8px)' }),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            p: 0.75,
            borderRadius: 2,
            bgcolor: 'background.paper',
            zIndex: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Move row */}
          <Stack direction="row" alignItems="center" spacing={0.25}>
            <Tooltip title="Move left">
              <IconButton size="small" onClick={() => handleNudge('x', -1)} sx={{ p: 0.5 }}>
                <ArrowBackIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Stack spacing={0}>
              <Tooltip title="Move up">
                <IconButton size="small" onClick={() => handleNudge('y', -1)} sx={{ p: 0.5 }}>
                  <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Move down">
                <IconButton size="small" onClick={() => handleNudge('y', 1)} sx={{ p: 0.5 }}>
                  <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Tooltip title="Move right">
              <IconButton size="small" onClick={() => handleNudge('x', 1)} sx={{ p: 0.5 }}>
                <ArrowForwardIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Rotate row */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Tooltip title="Rotate left 15°">
              <IconButton size="small" onClick={() => handleRotate(-1)} sx={{ p: 0.5 }}>
                <RotateLeftIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'center', fontSize: '0.6rem' }}>
              {Math.round(pos.rotation)}°
            </Typography>
            <Tooltip title="Rotate right 15°">
              <IconButton size="small" onClick={() => handleRotate(1)} sx={{ p: 0.5 }}>
                <RotateRightIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Z-index row */}
          {onZIndexChange && (
            <Stack direction="row" alignItems="center" spacing={0.25}>
              <Tooltip title="Move backward">
                <IconButton size="small" onClick={() => onZIndexChange(-1)} sx={{ p: 0.5 }}>
                  <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                Layer
              </Typography>
              <Tooltip title="Move forward">
                <IconButton size="small" onClick={() => onZIndexChange(1)} sx={{ p: 0.5 }}>
                  <KeyboardArrowUpIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Paper>
      )}
    </Box>
  )
}
