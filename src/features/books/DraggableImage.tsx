import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import type { PageImage } from '../../core/types/domain'

interface DraggableImageProps {
  image: PageImage
  selected: boolean
  onSelect: () => void
  onPositionChange?: (position: { x: number; y: number; width: number; height: number }) => void
  onRemove?: () => void
  style?: React.CSSProperties
}

const DEFAULT_POSITIONS: Record<PageImage['type'], { x: number; y: number; width: number; height: number }> = {
  'ai-generated': { x: 0, y: 0, width: 100, height: 100 },
  photo: { x: 10, y: 10, width: 40, height: 40 },
  sticker: { x: 25, y: 15, width: 30, height: 30 },
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max)
}

export default function DraggableImage({
  image,
  selected,
  onSelect,
  onPositionChange,
  onRemove,
  style,
}: DraggableImageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() => image.position ?? DEFAULT_POSITIONS[image.type])
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

      // If this is the second finger, start a pinch
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

      // Single finger = drag
      setDragging(true)
      dragStart.current = { px: e.clientX, py: e.clientY, startX: pos.x, startY: pos.y }
    },
    [pos.x, pos.y, pos.width, pos.height, resizing, updatePointer],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      updatePointer(e)

      // Pinch-to-zoom
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

      // Single finger drag
      if (resizing) return
      if (!dragging) return
      const rect = getContainerRect()
      if (!rect) return
      const dx = ((e.clientX - dragStart.current.px) / rect.width) * 100
      const dy = ((e.clientY - dragStart.current.py) / rect.height) * 100
      const newX = clamp(dragStart.current.startX + dx, 0, 100 - pos.width)
      const newY = clamp(dragStart.current.startY + dy, 0, 100 - pos.height)
      setPos((prev) => ({ ...prev, x: newX, y: newY }))
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
            // Larger touch target than visual size
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
    </Box>
  )
}
