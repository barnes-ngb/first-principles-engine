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
  photo: { x: 0, y: 0, width: 100, height: 100 },
  'ai-generated': { x: 0, y: 0, width: 100, height: 100 },
  sticker: { x: 25, y: 15, width: 50, height: 50 },
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
  const dragStart = useRef({ px: 0, py: 0, startX: 0, startY: 0 })
  const resizeStart = useRef({ px: 0, py: 0, startW: 0, startH: 0 })

  const getContainerRect = useCallback(() => {
    const container = ref.current?.parentElement
    return container?.getBoundingClientRect() ?? null
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (resizing) return
      e.stopPropagation()
      const el = ref.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      setDragging(true)
      dragStart.current = { px: e.clientX, py: e.clientY, startX: pos.x, startY: pos.y }
    },
    [pos.x, pos.y, resizing],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
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
    [dragging, resizing, getContainerRect, pos.width, pos.height],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return
      const el = ref.current
      if (el) el.releasePointerCapture(e.pointerId)
      setDragging(false)
      setPos((curr) => {
        onPositionChange?.(curr)
        return curr
      })
    },
    [dragging, onPositionChange],
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
            bottom: -4,
            right: -4,
            width: 12,
            height: 12,
            bgcolor: 'primary.main',
            borderRadius: '50%',
            cursor: 'nwse-resize',
            touchAction: 'none',
          }}
        />
      )}
    </Box>
  )
}
