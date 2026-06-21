import { useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import type { CropFraction } from './cropImage'
import { MIN_CROP_FRACTION } from './cropImage'

interface SketchCropStageProps {
  imageUrl: string
  /** Current crop region as fractions (0..1) of the displayed image. */
  value: CropFraction
  onChange: (next: CropFraction) => void
  disabled?: boolean
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const HANDLE_SIZE = 18

/**
 * Lightweight canvas-free crop selector (FEAT-33). Renders the captured drawing
 * with a draggable / corner-resizable box overlaid. Coordinates are kept as
 * fractions of the displayed image so they survive any rescale; the parent
 * resolves them against the image's natural dimensions when cropping.
 */
export default function SketchCropStage({
  imageUrl,
  value,
  onChange,
  disabled,
}: SketchCropStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    box: CropFraction
  } | null>(null)

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (!drag || !rect || rect.width === 0 || rect.height === 0) return

      const dx = (clientX - drag.startX) / rect.width
      const dy = (clientY - drag.startY) / rect.height
      const b = drag.box
      let next: CropFraction = { ...b }

      if (drag.mode === 'move') {
        next.x = clamp(b.x + dx, 0, 1 - b.width)
        next.y = clamp(b.y + dy, 0, 1 - b.height)
      } else {
        // Resize from a corner — keep the opposite edges anchored.
        let left = b.x
        let top = b.y
        let right = b.x + b.width
        let bottom = b.y + b.height

        if (drag.mode === 'nw' || drag.mode === 'sw') {
          left = clamp(b.x + dx, 0, right - MIN_CROP_FRACTION)
        }
        if (drag.mode === 'ne' || drag.mode === 'se') {
          right = clamp(b.x + b.width + dx, left + MIN_CROP_FRACTION, 1)
        }
        if (drag.mode === 'nw' || drag.mode === 'ne') {
          top = clamp(b.y + dy, 0, bottom - MIN_CROP_FRACTION)
        }
        if (drag.mode === 'sw' || drag.mode === 'se') {
          bottom = clamp(b.y + b.height + dy, top + MIN_CROP_FRACTION, 1)
        }
        next = { x: left, y: top, width: right - left, height: bottom - top }
      }
      onChange(next)
    },
    [onChange],
  )

  const startDrag = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, box: value }

      const onMove = (ev: PointerEvent) => applyDrag(ev.clientX, ev.clientY)
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [applyDrag, value, disabled],
  )

  const handleStyle = (corner: DragMode, pos: Record<string, number>) => ({
    position: 'absolute' as const,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    bgcolor: 'primary.main',
    border: '2px solid white',
    borderRadius: '50%',
    boxShadow: 1,
    touchAction: 'none',
    cursor: disabled ? 'default' : `${corner}-resize`,
    ...pos,
  })

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        display: 'inline-block',
        lineHeight: 0,
        maxWidth: '100%',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <Box
        component="img"
        src={imageUrl}
        alt="Captured drawing"
        draggable={false}
        sx={{ width: '100%', display: 'block', maxHeight: 360, objectFit: 'contain' }}
      />

      {/* Dim the area outside the crop box */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.35)',
          clipPath: `polygon(
            0% 0%, 0% 100%, ${value.x * 100}% 100%,
            ${value.x * 100}% ${value.y * 100}%,
            ${(value.x + value.width) * 100}% ${value.y * 100}%,
            ${(value.x + value.width) * 100}% ${(value.y + value.height) * 100}%,
            ${value.x * 100}% ${(value.y + value.height) * 100}%,
            ${value.x * 100}% 100%, 100% 100%, 100% 0%
          )`,
        }}
      />

      {/* Crop box */}
      <Box
        onPointerDown={startDrag('move')}
        sx={{
          position: 'absolute',
          left: `${value.x * 100}%`,
          top: `${value.y * 100}%`,
          width: `${value.width * 100}%`,
          height: `${value.height * 100}%`,
          border: '2px solid',
          borderColor: 'primary.main',
          boxSizing: 'border-box',
          cursor: disabled ? 'default' : 'move',
          touchAction: 'none',
        }}
      >
        <Box onPointerDown={startDrag('nw')} sx={handleStyle('nw', { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 })} />
        <Box onPointerDown={startDrag('ne')} sx={handleStyle('ne', { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 })} />
        <Box onPointerDown={startDrag('sw')} sx={handleStyle('sw', { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 })} />
        <Box onPointerDown={startDrag('se')} sx={handleStyle('se', { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 })} />
      </Box>
    </Box>
  )
}
