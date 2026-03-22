import type * as THREE from 'three'

export interface TouchControlState {
  isDragging: boolean
  prevX: number
  targetRotY: number
  currentRotY: number
  velocityY: number
  autoRotate: boolean
  lastInteractionTime: number
  /** Set externally to receive swipe callbacks */
  onSwipe?: (direction: 'left' | 'right') => void
  /** Internal cleanup function — call on unmount */
  _cleanup?: () => void
}

const AUTO_ROTATE_DELAY = 4000
const AUTO_ROTATE_SPEED = 0.003
const DRAG_SENSITIVITY = 0.006
const LERP_FACTOR = 0.08
const FRICTION = 0.95

const SWIPE_THRESHOLD = 50 // Minimum px for a swipe
const SWIPE_TIME_LIMIT = 300 // Max ms for a swipe gesture

export function createTouchControls(canvas: HTMLCanvasElement): TouchControlState {
  const state: TouchControlState = {
    isDragging: false,
    prevX: 0,
    targetRotY: 0,
    currentRotY: 0,
    velocityY: 0,
    autoRotate: true,
    lastInteractionTime: 0,
  }

  // Swipe tracking
  let touchStartX = 0
  let touchStartTime = 0

  function onPointerDown(x: number) {
    state.isDragging = true
    state.prevX = x
    state.velocityY = 0
    state.autoRotate = false
    state.lastInteractionTime = performance.now()
    touchStartX = x
    touchStartTime = performance.now()
  }

  function onPointerMove(x: number) {
    if (!state.isDragging) return
    const dx = x - state.prevX
    state.velocityY = dx * DRAG_SENSITIVITY
    state.targetRotY += state.velocityY
    state.prevX = x
  }

  function onPointerUp(endX?: number) {
    state.isDragging = false
    state.lastInteractionTime = performance.now()

    // Detect swipe — fast horizontal motion with minimal overall drag
    if (endX !== undefined && state.onSwipe) {
      const dx = endX - touchStartX
      const elapsed = performance.now() - touchStartTime
      if (Math.abs(dx) > SWIPE_THRESHOLD && elapsed < SWIPE_TIME_LIMIT) {
        state.onSwipe(dx > 0 ? 'right' : 'left')
      }
    }
  }

  // ── Touch events ────────────────────────────────────────────────
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) onPointerDown(e.touches[0].clientX)
  }, { passive: true })

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 1) onPointerMove(e.touches[0].clientX)
  }, { passive: true })

  canvas.addEventListener('touchend', (e: TouchEvent) => {
    onPointerUp(e.changedTouches[0]?.clientX)
  }, { passive: true })

  // ── Mouse events (desktop/dev testing) ──────────────────────────
  canvas.addEventListener('mousedown', (e: MouseEvent) => onPointerDown(e.clientX))

  const handleMouseMove = (e: MouseEvent) => {
    if (state.isDragging) onPointerMove(e.clientX)
  }
  const handleMouseUp = () => onPointerUp()

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)

  // Store cleanup function for proper disposal
  state._cleanup = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  return state
}

/** Call in the animation loop to update rotation smoothly */
export function updateRotation(
  character: THREE.Group,
  state: TouchControlState,
): void {
  if (!state.isDragging) {
    // Apply momentum with friction
    state.velocityY *= FRICTION
    state.targetRotY += state.velocityY

    // Resume auto-rotate after delay
    if (performance.now() - state.lastInteractionTime > AUTO_ROTATE_DELAY) {
      state.autoRotate = true
    }
  }

  if (state.autoRotate) {
    state.targetRotY += AUTO_ROTATE_SPEED
  }

  // Smooth lerp
  state.currentRotY += (state.targetRotY - state.currentRotY) * LERP_FACTOR
  character.rotation.y = state.currentRotY
}

/** Clean up event listeners (call on unmount) */
export function destroyTouchControls(state: TouchControlState): void {
  state._cleanup?.()
}
