import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import OpenWithIcon from '@mui/icons-material/OpenWith'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import type { PageImage } from '../../core/types'
import { hasFitBackdrop, resolveImageFit } from './imageFit'
import ImageFitBackdrop from './ImageFitBackdrop'
import PictureControls from './PictureControls'
import { clampPosition, scaleImagePosition, cornerScaleFromDrag, keepImageVisible, rotationFromDrag, imageGeometry } from './draggableImageUtils'
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
  /** When supplied, render actions outside the artwork. Null means the host
   * is not mounted yet; undefined preserves standalone inline controls. */
  controlsContainer?: HTMLElement | null
  style?: React.CSSProperties
}

/** Rotation increment per tap (degrees). */
const ROTATION_STEP = 15
/** Nudge per arrow button tap (px). Converted to % via container size. */
const NUDGE_PX = 5

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
  controlsContainer,
  style,
}: DraggableImageProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Saved/restored geometry is authoritative while idle. Only an active
  // gesture has a local draft, so same-ID Undo does not require a remount.
  const base = imageGeometry(image)
  const saved: ImagePosition = {
    ...base,
    rotation: image.position?.rotation ?? 0,
    zIndex: image.position?.zIndex ?? 0,
    flipH: image.position?.flipH ?? false,
    flipV: image.position?.flipV ?? false,
  }
  const [draft, setDraft] = useState<ImagePosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const pos = draft ?? saved
  const gesture = useRef<{
    mode: 'drag' | 'pinch' | 'resize' | 'rotate'
    before: ImagePosition
    start: ImagePosition
    current: ImagePosition
    rect: DOMRect
    pointer: { x: number; y: number }
    pointerAngle: number
    distance: number
    pointers: Map<number, { x: number; y: number; target: HTMLElement }>
  } | null>(null)

  const getContainerRect = () => ref.current?.parentElement?.getBoundingClientRect()
  const differs = (a: ImagePosition, b: ImagePosition) =>
    a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height
    || a.rotation !== b.rotation || a.flipH !== b.flipH || a.flipV !== b.flipV

  function begin(e: React.PointerEvent, mode: 'drag' | 'resize' | 'rotate') {
    e.stopPropagation()
    if (e.button !== 0) return
    const current = gesture.current
    if (current) {
      if (mode !== 'drag' || current.mode !== 'drag' || current.pointers.has(e.pointerId)) return
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
      current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, target })
      const [a, b] = [...current.pointers.values()]
      current.distance = Math.hypot(b.x - a.x, b.y - a.y)
      current.start = current.current
      current.mode = 'pinch'
      setDragging(false)
      return
    }
    const rect = getContainerRect()
    if (!rect?.width || !rect.height) return
    e.preventDefault()
    onSelect()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const cx = rect.left + (pos.x + pos.width / 2) * rect.width / 100
    const cy = rect.top + (pos.y + pos.height / 2) * rect.height / 100
    gesture.current = {
      mode, before: pos, start: pos, current: pos, rect,
      pointer: { x: e.clientX, y: e.clientY },
      pointerAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI,
      distance: 0,
      pointers: new Map([[e.pointerId, { x: e.clientX, y: e.clientY, target }]]),
    }
    setDraft(pos)
    setDragging(mode === 'drag')
  }

  function move(e: React.PointerEvent) {
    const g = gesture.current
    const pointer = g?.pointers.get(e.pointerId)
    if (!g || !pointer) return
    e.stopPropagation()
    g.pointers.set(e.pointerId, { ...pointer, x: e.clientX, y: e.clientY })
    const dx = e.clientX - g.pointer.x
    const dy = e.clientY - g.pointer.y
    let next: ImagePosition
    if (g.mode === 'pinch') {
      const [a, b] = [...g.pointers.values()]
      if (!b || g.distance === 0) return
      next = scaleImagePosition(g.start, Math.hypot(b.x - a.x, b.y - a.y) / g.distance)
    } else if (g.mode === 'resize') {
      next = scaleImagePosition(g.start, cornerScaleFromDrag(g.start, g.rect, dx, dy))
    } else if (g.mode === 'rotate') {
      const cx = g.rect.left + (g.start.x + g.start.width / 2) * g.rect.width / 100
      const cy = g.rect.top + (g.start.y + g.start.height / 2) * g.rect.height / 100
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI
      next = { ...g.start, rotation: rotationFromDrag(g.start.rotation, g.pointerAngle, angle) }
    } else {
      next = { ...g.start, ...clampPosition(g.start.x + dx / g.rect.width * 100, g.start.y + dy / g.rect.height * 100, g.start.width, g.start.height) }
    }
    g.current = keepImageVisible(next, g.rect)
    setDraft(g.current)
  }

  function finish(e: React.PointerEvent, cancelled = false) {
    const g = gesture.current
    if (!g?.pointers.has(e.pointerId)) return
    e.stopPropagation()
    // Clear first: releasePointerCapture may synchronously trigger lost capture.
    // The first lift ends a pinch; the other finger cannot start a stray drag.
    gesture.current = null
    for (const [id, pointer] of g.pointers) {
      if (pointer.target.hasPointerCapture?.(id)) pointer.target.releasePointerCapture(id)
    }
    setDraft(null)
    setDragging(false)
    if (!cancelled && differs(g.before, g.current)) onPositionChange?.(g.current)
  }

  const handlePointerDown = (e: React.PointerEvent) => begin(e, 'drag')
  const handleResizePointerDown = (e: React.PointerEvent) => begin(e, 'resize')
  const handleRotatePointerDown = (e: React.PointerEvent) => begin(e, 'rotate')
  const handlePointerUp = (e: React.PointerEvent) => finish(e)
  const handlePointerCancel = (e: React.PointerEvent) => finish(e, true)

  // Discrete controls have one commit, outside React's replayable state updaters.
  function commit(next: ImagePosition) {
    const rect = getContainerRect()
    const visible = rect ? keepImageVisible(next, rect) : next
    if (!gesture.current && differs(pos, visible)) onPositionChange?.(visible)
  }
  function handleNudge(axis: 'x' | 'y', sign: 1 | -1) {
    const rect = getContainerRect()
    const containerSize = rect ? (axis === 'x' ? rect.width : rect.height) : 800
    if (!containerSize) return
    const amount = NUDGE_PX / containerSize * 100 * sign
    commit({ ...pos, ...clampPosition(pos.x + (axis === 'x' ? amount : 0), pos.y + (axis === 'y' ? amount : 0), pos.width, pos.height) })
  }
  function handleRotate(sign: 1 | -1) {
    commit({ ...pos, rotation: wrapRotation(pos.rotation + sign * ROTATION_STEP) })
  }
  function handleFlip(axis: 'flipH' | 'flipV') {
    commit({ ...pos, [axis]: !pos[axis] })
  }

  const controls = <PictureControls
    label={image.label?.trim() || (image.type === 'sticker' ? 'Sticker' : 'Picture')}
    position={pos}
    busy={draft !== null}
    canTransform={!!onPositionChange}
    onNudge={handleNudge}
    onRotate={handleRotate}
    onFlip={handleFlip}
    onScale={(factor) => commit(scaleImagePosition(pos, factor))}
    onCenter={() => commit({ ...pos, x: (100 - pos.width) / 2, y: (100 - pos.height) / 2 })}
    onRemove={onRemove}
    onReorder={onReorder}
  />

  // Determine if toolbar should appear below (sticker is near top edge)
  const nearTopEdge = pos.y < 15

  const isSticker = image.type === 'sticker'

  return (
    <Box
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={move}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
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
      {/* FEAT-177 — a fitted background leaves space inside the box this
          component owns; fill it with a blurred, enlarged copy of the same
          picture. Never a sticker (they are cut-outs meant to float). The
          wrapper carries the rotation/flip, so the copy inherits them. */}
      {hasFitBackdrop(image) && (
        <ImageFitBackdrop
          url={image.url}
          sx={{ position: 'absolute', inset: 0, borderRadius: 1, zIndex: 0 }}
        />
      )}
      <Box
        component="img"
        src={image.url}
        alt={image.label ?? ''}
        draggable={false}
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          objectFit: resolveImageFit(image),
          pointerEvents: 'none',
          zIndex: 1,
          ...(image.type === 'sticker' ? { mixBlendMode: 'multiply' } : {}),
        }}
      />

      {/* Remove button */}
      {selected && onRemove && controlsContainer === undefined && (
        <IconButton
          size="small"
          onPointerDown={(e) => e.stopPropagation()}
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
            onPointerMove={move}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
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
            onPointerMove={move}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
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

      {/* In the editor these actions live below the canvas, outside every
          artwork transform/stack. A portal retains this gesture's callbacks. */}
      {selected && (controlsContainer
        ? createPortal(controls, controlsContainer)
        : controlsContainer === undefined && isSticker
          ? <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 280, ...(nearTopEdge ? { top: 'calc(100% + 8px)' } : { bottom: 'calc(100% + 8px)' }), zIndex: 999 }}>{controls}</Box>
          : null)}
    </Box>
  )
}
