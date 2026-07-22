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
import FlipIcon from '@mui/icons-material/Flip'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import OpenWithIcon from '@mui/icons-material/OpenWith'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import type { PageImage } from '../../core/types'
import { clampPosition, scaleAboutCenter, rotationFromDrag, DEFAULT_IMAGE_GEOMETRY } from './draggableImageUtils'
import type { ImagePosition } from './draggableImageUtils'
export type { ImagePosition } from './draggableImageUtils'

interface DraggableImageProps {
  image: PageImage
  selected: boolean
  onSelect: () => void
  onPositionChange?: (position: ImagePosition) => void
  onRemove?: () => void
  /** Move this element one step in the layer stack ('up' = toward the top). */
  onReorder?: (direction: 'up' | 'down') => void
  style?: React.CSSProperties
}

const DEFAULT_POSITIONS = DEFAULT_IMAGE_GEOMETRY

/** Rotation increment per tap (degrees). */
const ROTATION_STEP = 15
/** Nudge per arrow button tap (px). Converted to % via container size. */
const NUDGE_PX = 5

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
  onReorder,
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
      flipH: image.position?.flipH ?? false,
      flipV: image.position?.flipV ?? false,
    }
  })
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [pinching, setPinching] = useState(false)
  const dragStart = useRef({ px: 0, py: 0, startX: 0, startY: 0 })
  // centerX/centerY are captured at gesture start so scaling stays anchored to
  // the object's center (the invariant: center before === center after).
  const resizeStart = useRef({ px: 0, py: 0, startW: 0, startH: 0, centerX: 0, centerY: 0 })
  const pinchStart = useRef<{
    initialDistance: number
    initialWidth: number
    initialHeight: number
    centerX: number
    centerY: number
  } | null>(null)
  // Pointer angle + rotation captured at rotate-handle grab, so the drag
  // applies an angular delta (no jump from the handle's own start angle).
  const rotateStart = useRef({ pointerAngle: 0, startRotation: 0 })
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
      if (resizing || rotating) return
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
          centerX: pos.x + pos.width / 2,
          centerY: pos.y + pos.height / 2,
        }
        return
      }

      setDragging(true)
      dragStart.current = { px: e.clientX, py: e.clientY, startX: pos.x, startY: pos.y }
    },
    [pos.x, pos.y, pos.width, pos.height, resizing, rotating, updatePointer],
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
        // Anchor to the center captured at pinch start — scaling never drifts.
        const { centerX, centerY } = pinchStart.current

        setPos((prev) => ({ ...prev, width: newW, height: newH, x: centerX - newW / 2, y: centerY - newH / 2 }))
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
      resizeStart.current = {
        px: e.clientX,
        py: e.clientY,
        startW: pos.width,
        startH: pos.height,
        centerX: pos.x + pos.width / 2,
        centerY: pos.y + pos.height / 2,
      }
    },
    [pos.x, pos.y, pos.width, pos.height],
  )

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizing) return
      const rect = getContainerRect()
      if (!rect) return
      // Corner drag scales about the object's center: grow symmetrically, so
      // the dragged corner tracks the pointer while the center stays fixed.
      const dx = ((e.clientX - resizeStart.current.px) / rect.width) * 100
      const newW = clamp(resizeStart.current.startW + dx * 2, 15, 100)
      const aspectRatio = resizeStart.current.startH / resizeStart.current.startW
      const newH = clamp(newW * aspectRatio, 15, 100)
      setPos((prev) => {
        const { x, y } = scaleAboutCenter(
          { x: prev.x, y: prev.y, width: prev.width, height: prev.height },
          newW,
          newH,
        )
        return { ...prev, width: newW, height: newH, x, y }
      })
    },
    [resizing, getContainerRect],
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

  // ── Rotate handle (drag) ────────────────────────────────────

  const handleRotatePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      setRotating(true)
      const box = ref.current?.getBoundingClientRect()
      if (box) {
        const cx = box.left + box.width / 2
        const cy = box.top + box.height / 2
        const pointerAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
        rotateStart.current = { pointerAngle, startRotation: pos.rotation }
      }
    },
    [pos.rotation],
  )

  const handleRotatePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!rotating) return
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // Apply the angular delta from grab — the image continues from its
      // current rotation instead of snapping to the handle's start angle.
      const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
      const rotation = rotationFromDrag(
        rotateStart.current.startRotation,
        rotateStart.current.pointerAngle,
        angle,
      )
      setPos((prev) => ({ ...prev, rotation }))
    },
    [rotating],
  )

  const handleRotatePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!rotating) return
      const el = e.currentTarget as HTMLElement
      el.releasePointerCapture(e.pointerId)
      setRotating(false)
      setPos((curr) => {
        onPositionChange?.(curr)
        return curr
      })
    },
    [rotating, onPositionChange],
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

  const handleFlip = useCallback(
    (axis: 'flipH' | 'flipV') => {
      setPos((prev) => {
        const next = { ...prev, [axis]: !prev[axis] }
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
        transform: (() => {
          const t: string[] = []
          if (pos.rotation) t.push(`rotate(${pos.rotation}deg)`)
          if (pos.flipH) t.push('scaleX(-1)')
          if (pos.flipV) t.push('scaleY(-1)')
          return t.length > 0 ? t.join(' ') : undefined
        })(),
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

      {/* Corner handles — fresh look, finger-sized (28px), one job each.
          top-left: move · bottom-right: scale · bottom-left: rotate. */}
      {selected && (
        <>
          {/* Move affordance (drag the body; this badge just signals it) */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: -10,
              left: -10,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.main',
              color: 'white',
              borderRadius: '50%',
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
              cursor: dragging ? 'grabbing' : 'grab',
              pointerEvents: 'none',
            }}
          >
            <OpenWithIcon sx={{ fontSize: 16 }} />
          </Box>

          {/* Rotate handle (drag) */}
          <Box
            role="button"
            aria-label="Rotate"
            onPointerDown={handleRotatePointerDown}
            onPointerMove={handleRotatePointerMove}
            onPointerUp={handleRotatePointerUp}
            sx={{
              position: 'absolute',
              bottom: -10,
              left: -10,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'secondary.main',
              color: 'white',
              borderRadius: '50%',
              cursor: 'grab',
              touchAction: 'none',
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            }}
          >
            <RotateRightIcon sx={{ fontSize: 16 }} />
          </Box>

          {/* Scale handle (corner, scales about center) */}
          <Box
            role="button"
            aria-label="Resize"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            sx={{
              position: 'absolute',
              bottom: -10,
              right: -10,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.main',
              color: 'white',
              borderRadius: '50%',
              cursor: 'nwse-resize',
              touchAction: 'none',
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            }}
          >
            <OpenInFullIcon sx={{ fontSize: 15 }} />
          </Box>
        </>
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

          {/* Flip row */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Tooltip title="Flip horizontal">
              <IconButton
                size="small"
                onClick={() => handleFlip('flipH')}
                sx={{ p: 0.5, bgcolor: pos.flipH ? 'action.selected' : undefined }}
              >
                <FlipIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Flip vertical">
              <IconButton
                size="small"
                onClick={() => handleFlip('flipV')}
                sx={{ p: 0.5, bgcolor: pos.flipV ? 'action.selected' : undefined }}
              >
                <FlipIcon sx={{ fontSize: 14, transform: 'rotate(90deg)' }} />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Layer row */}
          {onReorder && (
            <Stack direction="row" alignItems="center" spacing={0.25}>
              <Tooltip title="Send backward">
                <IconButton size="small" onClick={() => onReorder('down')} sx={{ p: 0.5 }}>
                  <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                Layer
              </Typography>
              <Tooltip title="Bring forward">
                <IconButton size="small" onClick={() => onReorder('up')} sx={{ p: 0.5 }}>
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
